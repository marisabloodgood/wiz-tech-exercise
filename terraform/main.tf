terraform {
  required_version = ">= 1.5.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

locals {
  gke_nodes_cidr = "10.20.0.0/24"
}

resource "google_compute_network" "vpc" {
  name                    = "wiz-vpc"
  auto_create_subnetworks = false
}

resource "google_compute_subnetwork" "vm_subnet" {
  name          = "wiz-subnet-vm"
  ip_cidr_range = "10.10.0.0/24"
  region        = var.region
  network       = google_compute_network.vpc.id
}

resource "google_compute_subnetwork" "gke_subnet" {
  name          = "wiz-subnet-gke"
  ip_cidr_range = "10.20.0.0/24"
  region        = var.region
  network       = google_compute_network.vpc.id

  private_ip_google_access = true

  secondary_ip_range {
    range_name    = "pods"
    ip_cidr_range = "10.30.0.0/16"
  }

  secondary_ip_range {
    range_name    = "services"
    ip_cidr_range = "10.40.0.0/20"
  }
}

resource "google_compute_firewall" "allow_ssh_world" {
  name    = "allow-ssh-world"
  network = google_compute_network.vpc.name

  allow {
    protocol = "tcp"
    ports    = ["22"]
  }

  source_ranges = ["0.0.0.0/0"]
  target_tags   = ["mongo-vm"]
}

resource "google_compute_firewall" "allow_mongo_from_gke" {
  name    = "allow-mongo-from-gke"
  network = google_compute_network.vpc.name

  allow {
    protocol = "tcp"
    ports    = ["27017"]
  }

  source_ranges = [local.gke_nodes_cidr]
  target_tags   = ["mongo-vm"]
}

# --- Mongo VM Service Account (INTENTIONAL: overly permissive) ---
resource "google_service_account" "mongo_vm_sa" {
  account_id   = "wiz-mongo-vm-sa"
  display_name = "Wiz Mongo VM Service Account"
}

resource "google_project_iam_member" "mongo_vm_editor" {
  project = var.project_id
  role    = "roles/editor"
  member  = "serviceAccount:${google_service_account.mongo_vm_sa.email}"
}

# --- MongoDB VM (Outdated OS + public SSH tag + startup install) ---
resource "google_compute_instance" "mongo_vm" {
  name         = "wiz-mongo-vm"
  machine_type = "e2-medium"
  zone         = var.zone
  tags         = ["mongo-vm"] # matches firewall target_tags

  boot_disk {
    initialize_params {
      # Outdated Linux image
      image = "debian-cloud/debian-11"
    }
  }

  network_interface {
    subnetwork = google_compute_subnetwork.vm_subnet.id
    access_config {} # public IP
  }

  service_account {
    email  = google_service_account.mongo_vm_sa.email
    scopes = ["cloud-platform"]
  }

  metadata_startup_script = file("${path.module}/mongo_startup.sh")
}
# --- GCS bucket for Mongo backups (will be made public later - intentional weakness) ---
resource "google_storage_bucket" "backup_bucket" {
  name                        = "${var.project_id}-wiz-mongo-backups"
  location                    = var.region
  uniform_bucket_level_access = true
  force_destroy               = true
}

# --- GKE Cluster (private nodes) ---
resource "google_container_cluster" "wiz_gke" {
  name     = "wiz-gke"
  location = var.zone

  network    = google_compute_network.vpc.name
  subnetwork = google_compute_subnetwork.gke_subnet.name

  # We manage node pools separately
  remove_default_node_pool = true
  initial_node_count       = 1

  # VPC-native
  ip_allocation_policy {
    cluster_secondary_range_name  = "pods"
    services_secondary_range_name = "services"
  }

  # Private nodes, public control plane endpoint (simplest for laptop kubectl)
  private_cluster_config {
    enable_private_nodes    = true
    enable_private_endpoint = false
    master_ipv4_cidr_block  = "172.16.0.0/28"
  }

  # (Optional but nice for Wiz narrative)
  logging_config {
    enable_components = ["SYSTEM_COMPONENTS", "WORKLOADS"]
  }

  # Enable Ingress (GCE LB)
  addons_config {
    http_load_balancing {
      disabled = false
    }
  }
}

resource "google_container_node_pool" "wiz_nodes" {
  name       = "wiz-nodes"
  location   = var.zone
  cluster    = google_container_cluster.wiz_gke.name
  node_count = 2

  node_config {
    machine_type = "e2-standard-2"

    # Allow pulling images, pushing logs, etc.
    oauth_scopes = ["https://www.googleapis.com/auth/cloud-platform"]

    # (Optional) labels help you filter later
    labels = {
      env = "wiz"
    }
  }
}