variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "region" {
  description = "Primary GCP region"
  type        = string
  default     = "asia-south1" # Mumbai — lowest latency for Tamil Nadu users
}

variable "zone" {
  description = "Primary zone within region"
  type        = string
  default     = "asia-south1-a"
}

variable "domain" {
  description = "Custom domain (e.g. tnelection.in)"
  type        = string
}

variable "db_tier" {
  description = "Cloud SQL machine type"
  type        = string
  default     = "db-custom-1-3840" # 1 vCPU, 3.75GB RAM — good start
}

variable "db_password" {
  description = "PostgreSQL password"
  type        = string
  sensitive   = true
}

variable "jwt_secret" {
  description = "JWT signing secret (64+ chars)"
  type        = string
  sensitive   = true
}

variable "db_ha_enabled" {
  description = "Enable Cloud SQL high availability (regional failover)"
  type        = bool
  default     = true
}

variable "api_min_instances" {
  description = "Minimum Cloud Run instances (0 = scale to zero, 1+ = zero downtime)"
  type        = number
  default     = 1
}

variable "api_max_instances" {
  description = "Maximum Cloud Run instances for autoscaling"
  type        = number
  default     = 10
}

variable "google_client_id" {
  description = "Google OAuth client ID"
  type        = string
  default     = ""
}

variable "allowed_origins" {
  description = "CORS origins (comma-separated)"
  type        = string
  default     = ""
}
