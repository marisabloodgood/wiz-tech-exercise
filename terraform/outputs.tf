output "vpc_name" {
  value = google_compute_network.vpc.name
}

output "vm_subnet" {
  value = google_compute_subnetwork.vm_subnet.name
}

output "gke_subnet" {
  value = google_compute_subnetwork.gke_subnet.name
}
output "mongo_private_ip" {
  value = google_compute_instance.mongo_vm.network_interface[0].network_ip
}

output "mongo_public_ip" {
  value = google_compute_instance.mongo_vm.network_interface[0].access_config[0].nat_ip
}

output "backup_bucket_name" {
  value = google_storage_bucket.backup_bucket.name
}