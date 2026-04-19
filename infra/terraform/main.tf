terraform {
  required_version = ">= 1.5"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }

  # Store state in GCS bucket (create this bucket manually first)
  backend "gcs" {
    bucket = "elec-terraform-state"
    prefix = "terraform/state"
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

# ══════════════════════════════════════════════════════════
# Enable required APIs
# ══════════════════════════════════════════════════════════

resource "google_project_service" "apis" {
  for_each = toset([
    "run.googleapis.com",
    "sqladmin.googleapis.com",
    "compute.googleapis.com",
    "cloudbuild.googleapis.com",
    "secretmanager.googleapis.com",
    "servicenetworking.googleapis.com",
    "artifactregistry.googleapis.com",
  ])
  service            = each.key
  disable_on_destroy = false
}

# ══════════════════════════════════════════════════════════
# TIER 3: DATABASE — Cloud SQL PostgreSQL (HA)
# ══════════════════════════════════════════════════════════

# Private network for DB (not exposed to internet)
resource "google_compute_network" "vpc" {
  name                    = "elec-vpc"
  auto_create_subnetworks = false
  depends_on              = [google_project_service.apis]
}

resource "google_compute_subnetwork" "subnet" {
  name          = "elec-subnet"
  ip_cidr_range = "10.0.0.0/24"
  region        = var.region
  network       = google_compute_network.vpc.id
}

resource "google_compute_global_address" "private_ip" {
  name          = "elec-db-private-ip"
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 16
  network       = google_compute_network.vpc.id
}

resource "google_service_networking_connection" "private_vpc" {
  network                 = google_compute_network.vpc.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.private_ip.name]
}

resource "google_sql_database_instance" "postgres" {
  name             = "elec-postgres"
  database_version = "POSTGRES_16"
  region           = var.region

  depends_on = [google_service_networking_connection.private_vpc]

  settings {
    tier              = var.db_tier
    availability_type = var.db_ha_enabled ? "REGIONAL" : "ZONAL"
    disk_autoresize   = true
    disk_size         = 10 # GB, auto-grows
    disk_type         = "PD_SSD"

    ip_configuration {
      ipv4_enabled                                  = false
      private_network                               = google_compute_network.vpc.id
      enable_private_path_for_google_cloud_services = true
    }

    backup_configuration {
      enabled                        = true
      start_time                     = "02:00" # 2 AM IST
      point_in_time_recovery_enabled = true
      transaction_log_retention_days = 7

      backup_retention_settings {
        retained_backups = 14
        retention_unit   = "COUNT"
      }
    }

    maintenance_window {
      day          = 7 # Sunday
      hour         = 3 # 3 AM
      update_track = "stable"
    }

    database_flags {
      name  = "max_connections"
      value = "100"
    }

    insights_config {
      query_insights_enabled  = true
      query_plans_per_minute  = 5
      query_string_length     = 1024
      record_application_tags = true
      record_client_address   = false
    }
  }

  deletion_protection = true
}

resource "google_sql_database" "elec" {
  name     = "elec"
  instance = google_sql_database_instance.postgres.name
}

resource "google_sql_user" "elec" {
  name     = "elec"
  instance = google_sql_database_instance.postgres.name
  password = var.db_password
}

# ══════════════════════════════════════════════════════════
# SECRETS — Store sensitive values in Secret Manager
# ══════════════════════════════════════════════════════════

resource "google_secret_manager_secret" "db_url" {
  secret_id = "elec-database-url"
  replication {
    auto {}
  }
  depends_on = [google_project_service.apis]
}

resource "google_secret_manager_secret_version" "db_url" {
  secret      = google_secret_manager_secret.db_url.id
  secret_data = "postgresql://elec:${var.db_password}@/elec?host=/cloudsql/${google_sql_database_instance.postgres.connection_name}"
}

resource "google_secret_manager_secret" "jwt_secret" {
  secret_id = "elec-jwt-secret"
  replication {
    auto {}
  }
  depends_on = [google_project_service.apis]
}

resource "google_secret_manager_secret_version" "jwt_secret" {
  secret      = google_secret_manager_secret.jwt_secret.id
  secret_data = var.jwt_secret
}

# ══════════════════════════════════════════════════════════
# TIER 2: BACKEND — Cloud Run (auto-scaling, zero downtime)
# ══════════════════════════════════════════════════════════

# Artifact Registry for Docker images
resource "google_artifact_registry_repository" "elec" {
  location      = var.region
  repository_id = "elec"
  format        = "DOCKER"
  depends_on    = [google_project_service.apis]
}

# Service account for Cloud Run
resource "google_service_account" "api" {
  account_id   = "elec-api"
  display_name = "Election API Service Account"
}

# Allow API to access secrets
resource "google_secret_manager_secret_iam_member" "api_db_url" {
  secret_id = google_secret_manager_secret.db_url.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.api.email}"
}

resource "google_secret_manager_secret_iam_member" "api_jwt" {
  secret_id = google_secret_manager_secret.jwt_secret.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.api.email}"
}

# Allow API to connect to Cloud SQL
resource "google_project_iam_member" "api_sql" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.api.email}"
}

# Cloud Run service
resource "google_cloud_run_v2_service" "api" {
  name     = "elec-api"
  location = var.region
  ingress  = "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER"

  template {
    service_account = google_service_account.api.email

    scaling {
      min_instance_count = var.api_min_instances
      max_instance_count = var.api_max_instances
    }

    containers {
      image = "${var.region}-docker.pkg.dev/${var.project_id}/elec/api:latest"

      ports {
        container_port = 8000
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
        cpu_idle          = true  # Throttle CPU when not handling requests
        startup_cpu_boost = true  # Full CPU during startup
      }

      env {
        name = "DATABASE_URL"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.db_url.secret_id
            version = "latest"
          }
        }
      }

      env {
        name = "JWT_SECRET"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.jwt_secret.secret_id
            version = "latest"
          }
        }
      }

      env {
        name  = "ALLOWED_ORIGINS"
        value = var.allowed_origins != "" ? var.allowed_origins : "https://${var.domain}"
      }

      env {
        name  = "GOOGLE_CLIENT_ID"
        value = var.google_client_id
      }

      startup_probe {
        http_get {
          path = "/health"
        }
        initial_delay_seconds = 5
        period_seconds        = 5
        failure_threshold     = 3
      }

      liveness_probe {
        http_get {
          path = "/health"
        }
        period_seconds = 30
      }
    }

    # Cloud SQL connection via Unix socket (private, no public IP)
    volumes {
      name = "cloudsql"
      cloud_sql_instance {
        instances = [google_sql_database_instance.postgres.connection_name]
      }
    }
  }

  traffic {
    percent = 100
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
  }

  depends_on = [
    google_project_service.apis,
    google_secret_manager_secret_iam_member.api_db_url,
    google_secret_manager_secret_iam_member.api_jwt,
  ]
}

# ══════════════════════════════════════════════════════════
# TIER 1: FRONTEND — Cloud Storage + Cloud CDN
# ══════════════════════════════════════════════════════════

# GCS bucket for static frontend
resource "google_storage_bucket" "frontend" {
  name     = "${var.project_id}-frontend"
  location = var.region

  website {
    main_page_suffix = "index.html"
    not_found_page   = "index.html" # SPA routing
  }

  uniform_bucket_level_access = true

  cors {
    origin          = ["https://${var.domain}"]
    method          = ["GET", "HEAD"]
    response_header = ["Content-Type"]
    max_age_seconds = 3600
  }
}

# Make bucket publicly readable
resource "google_storage_bucket_iam_member" "frontend_public" {
  bucket = google_storage_bucket.frontend.name
  role   = "roles/storage.objectViewer"
  member = "allUsers"
}

# ══════════════════════════════════════════════════════════
# LOAD BALANCER + CDN + SSL (global)
# ══════════════════════════════════════════════════════════

# Reserve static IP
resource "google_compute_global_address" "lb" {
  name = "elec-lb-ip"
}

# Backend: Cloud Storage for frontend
resource "google_compute_backend_bucket" "frontend" {
  name        = "elec-frontend-backend"
  bucket_name = google_storage_bucket.frontend.name
  enable_cdn  = true

  cdn_policy {
    cache_mode                   = "CACHE_ALL_STATIC"
    default_ttl                  = 3600
    max_ttl                      = 86400
    client_ttl                   = 3600
    signed_url_cache_max_age_sec = 0
  }
}

# Backend: Cloud Run for API
resource "google_compute_region_network_endpoint_group" "api" {
  name                  = "elec-api-neg"
  region                = var.region
  network_endpoint_type = "SERVERLESS"

  cloud_run {
    service = google_cloud_run_v2_service.api.name
  }
}

resource "google_compute_backend_service" "api" {
  name                  = "elec-api-backend"
  protocol              = "HTTPS"
  load_balancing_scheme = "EXTERNAL_MANAGED"

  backend {
    group = google_compute_region_network_endpoint_group.api.id
  }

  # Cloud Armor security policy (optional, blocks DDoS)
  # security_policy = google_compute_security_policy.default.id

  log_config {
    enable    = true
    sample_rate = 0.5
  }
}

# URL Map: route /api/* to Cloud Run, everything else to frontend bucket
resource "google_compute_url_map" "default" {
  name            = "elec-url-map"
  default_service = google_compute_backend_bucket.frontend.id

  host_rule {
    hosts        = [var.domain]
    path_matcher = "main"
  }

  path_matcher {
    name            = "main"
    default_service = google_compute_backend_bucket.frontend.id

    path_rule {
      paths   = ["/api/*", "/auth/*", "/bookmarks/*", "/health", "/docs", "/openapi.json"]
      service = google_compute_backend_service.api.id
    }
  }
}

# Managed SSL certificate (free, auto-renewing)
resource "google_compute_managed_ssl_certificate" "default" {
  name = "elec-ssl-cert"
  managed {
    domains = [var.domain]
  }
}

# HTTPS proxy
resource "google_compute_target_https_proxy" "default" {
  name    = "elec-https-proxy"
  url_map = google_compute_url_map.default.id
  ssl_certificates = [google_compute_managed_ssl_certificate.default.id]
}

# Global forwarding rule (HTTPS)
resource "google_compute_global_forwarding_rule" "https" {
  name                  = "elec-https-rule"
  target                = google_compute_target_https_proxy.default.id
  port_range            = "443"
  ip_address            = google_compute_global_address.lb.address
  load_balancing_scheme = "EXTERNAL_MANAGED"
}

# HTTP → HTTPS redirect
resource "google_compute_url_map" "http_redirect" {
  name = "elec-http-redirect"
  default_url_redirect {
    https_redirect = true
    strip_query    = false
  }
}

resource "google_compute_target_http_proxy" "redirect" {
  name    = "elec-http-redirect-proxy"
  url_map = google_compute_url_map.http_redirect.id
}

resource "google_compute_global_forwarding_rule" "http" {
  name                  = "elec-http-rule"
  target                = google_compute_target_http_proxy.redirect.id
  port_range            = "80"
  ip_address            = google_compute_global_address.lb.address
  load_balancing_scheme = "EXTERNAL_MANAGED"
}

# ══════════════════════════════════════════════════════════
# OUTPUTS
# ══════════════════════════════════════════════════════════

output "load_balancer_ip" {
  value       = google_compute_global_address.lb.address
  description = "Point your domain DNS A record to this IP"
}

output "api_url" {
  value       = google_cloud_run_v2_service.api.uri
  description = "Cloud Run API URL (internal)"
}

output "frontend_bucket" {
  value       = google_storage_bucket.frontend.url
  description = "Frontend storage bucket"
}

output "db_connection_name" {
  value       = google_sql_database_instance.postgres.connection_name
  description = "Cloud SQL connection name"
}

output "db_private_ip" {
  value       = google_sql_database_instance.postgres.private_ip_address
  description = "Database private IP"
}
