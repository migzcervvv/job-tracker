terraform {
  required_version = ">= 1.11.4, < 2.0.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
  }
}
provider "google" {
  project = var.project_id
  region  = var.region
}
variable "project_id" {
  type = string
}
variable "region" {
  type    = string
  default = "asia-east1"
}
variable "n8n_image" {
  type = string
  validation {
    condition     = can(regex("@sha256:[0-9a-f]{64}$", var.n8n_image))
    error_message = "Production n8n must use an immutable image digest."
  }
}
variable "database_host" {
  type = string
}
variable "database_name" {
  type = string
}
variable "database_user" {
  type = string
}
variable "database_password_secret" {
  type = string
}
variable "encryption_key_secret" {
  type = string
}
variable "allow_public_access" {
  type    = bool
  default = false
}
variable "webhook_url" {
  type = string
}
resource "google_service_account" "n8n" {
  account_id   = "jobtracker-n8n"
  display_name = "Job Tracker automation"
}
resource "google_secret_manager_secret_iam_member" "database" {
  secret_id = var.database_password_secret
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.n8n.email}"
}
resource "google_secret_manager_secret_iam_member" "encryption" {
  secret_id = var.encryption_key_secret
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.n8n.email}"
}
resource "google_cloud_run_v2_service" "n8n" {
  name                = "jobtracker-n8n"
  location            = var.region
  deletion_protection = true
  template {
    service_account = google_service_account.n8n.email
    timeout         = "3600s"
    scaling {
      min_instance_count = 1
      max_instance_count = 1
    }
    containers {
      image = var.n8n_image
      ports {
        container_port = 5678
      }
      resources {
        limits = {
          cpu    = "1"
          memory = "1Gi"
        }
        cpu_idle = false
      }
      env {
        name  = "DB_TYPE"
        value = "postgresdb"
      }
      env {
        name  = "DB_POSTGRESDB_HOST"
        value = var.database_host
      }
      env {
        name  = "DB_POSTGRESDB_DATABASE"
        value = var.database_name
      }
      env {
        name  = "DB_POSTGRESDB_USER"
        value = var.database_user
      }
      env {
        name  = "DB_POSTGRESDB_SSL_ENABLED"
        value = "true"
      }
      env {
        name = "DB_POSTGRESDB_PASSWORD"
        value_source {
          secret_key_ref {
            secret  = var.database_password_secret
            version = "latest"
          }
        }
      }
      env {
        name = "N8N_ENCRYPTION_KEY"
        value_source {
          secret_key_ref {
            secret  = var.encryption_key_secret
            version = "latest"
          }
        }
      }
      env {
        name  = "WEBHOOK_URL"
        value = var.webhook_url
      }
      env {
        name  = "N8N_EDITOR_BASE_URL"
        value = var.webhook_url
      }
      env {
        name  = "N8N_PROXY_HOPS"
        value = "1"
      }
      env {
        name  = "N8N_PROTOCOL"
        value = "https"
      }
      env {
        name  = "EXECUTIONS_DATA_SAVE_ON_SUCCESS"
        value = "none"
      }
      env {
        name  = "EXECUTIONS_DATA_SAVE_ON_ERROR"
        value = "none"
      }
      env {
        name  = "EXECUTIONS_DATA_PRUNE"
        value = "true"
      }
      env {
        name  = "EXECUTIONS_DATA_MAX_AGE"
        value = "24"
      }
      startup_probe {
        http_get {
          path = "/healthz/readiness"
          port = 5678
        }
        initial_delay_seconds = 10
        period_seconds        = 10
        failure_threshold     = 20
      }
      liveness_probe {
        http_get {
          path = "/healthz"
          port = 5678
        }
        period_seconds    = 30
        failure_threshold = 3
      }
    }
  }
  depends_on = [google_secret_manager_secret_iam_member.database, google_secret_manager_secret_iam_member.encryption]
}
resource "google_cloud_run_v2_service_iam_member" "public" {
  count    = var.allow_public_access ? 1 : 0
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.n8n.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}
output "n8n_url" {
  value = google_cloud_run_v2_service.n8n.uri
}
