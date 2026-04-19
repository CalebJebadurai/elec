#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────
# Initial GCP setup & Terraform bootstrap
# Run ONCE to set up the project from scratch
# ─────────────────────────────────────────────────────────
set -euo pipefail

PROJECT_ID="${1:?Usage: ./setup.sh <project-id>}"
REGION="${2:-asia-south1}"
STATE_BUCKET="${PROJECT_ID}-terraform-state"

echo "=== Setting up GCP project: ${PROJECT_ID} ==="

# 1. Set project
gcloud config set project "${PROJECT_ID}"

# 2. Enable billing (must be done manually in console)
echo "⚠  Ensure billing is enabled: https://console.cloud.google.com/billing/linkedaccount?project=${PROJECT_ID}"

# 3. Enable base APIs
echo "→ Enabling APIs..."
gcloud services enable \
  compute.googleapis.com \
  run.googleapis.com \
  sqladmin.googleapis.com \
  cloudbuild.googleapis.com \
  secretmanager.googleapis.com \
  servicenetworking.googleapis.com \
  artifactregistry.googleapis.com

# 4. Create Terraform state bucket
echo "→ Creating Terraform state bucket..."
gsutil mb -p "${PROJECT_ID}" -l "${REGION}" "gs://${STATE_BUCKET}" 2>/dev/null || true
gsutil versioning set on "gs://${STATE_BUCKET}"

# 5. Grant Cloud Build permissions
echo "→ Configuring Cloud Build permissions..."
PROJECT_NUMBER=$(gcloud projects describe "${PROJECT_ID}" --format='value(projectNumber)')
CLOUDBUILD_SA="${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com"

for role in roles/run.admin roles/storage.admin roles/iam.serviceAccountUser; do
  gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
    --member="serviceAccount:${CLOUDBUILD_SA}" \
    --role="${role}" \
    --quiet
done

# 6. Create Artifact Registry repo
echo "→ Creating Artifact Registry..."
gcloud artifacts repositories create elec \
  --repository-format=docker \
  --location="${REGION}" 2>/dev/null || true

# 7. Init Terraform
echo "→ Initializing Terraform..."
cd "$(dirname "$0")/terraform"

# Update backend bucket name
cat > backend.tf <<EOF
terraform {
  backend "gcs" {
    bucket = "${STATE_BUCKET}"
    prefix = "terraform/state"
  }
}
EOF

terraform init

echo ""
echo "=== Setup complete ==="
echo ""
echo "Next steps:"
echo "  1. cp terraform.tfvars.example terraform.tfvars"
echo "  2. Edit terraform.tfvars with your values"
echo "  3. terraform plan"
echo "  4. terraform apply"
echo "  5. Point your domain A record to the load balancer IP"
echo "  6. Seed the database: ./seed-db.sh"
