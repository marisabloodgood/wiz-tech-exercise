# Wiz Technical Exercise — Blond Fury Regatta Tracker

This repo contains a deliberately insecure demo application deployed on GCP:
- GKE (Kubernetes) runs the Regatta API container
- A Compute Engine VM runs an intentionally outdated MongoDB server
- Daily database backups are uploaded to a publicly readable/listable GCS bucket
- The API is exposed via GKE Ingress + Google Cloud Load Balancer

## Live URLs
- API root: http://regattas.blondfury.com/
- Health: http://regattas.blondfury.com/health
- Regattas: http://regattas.blondfury.com/api/regattas

## Architecture (high level)
- **Client (dev):** React/Vite runs locally on http://localhost:5173 and proxies `/api` to the API.
- **API:** Node/Express container in GKE (`regatta-api` Deployment + Service).
- **Database:** MongoDB running on a VM in a private VPC IP (10.10.0.2).
- **Backups:** cron on VM runs `mongo_backup.sh` daily and uploads archives to GCS.
- **Ingress:** GKE Ingress provisions a Google Cloud Load Balancer with static IP + DNS.

## How to run locally (dev)
Frontend:
```bash
cd app/frontend
npm install
npm run dev