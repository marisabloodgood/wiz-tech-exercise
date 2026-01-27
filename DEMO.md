# Demo Runbook (5–7 minutes)

## 1) Show cluster + private nodes
```bash
kubectl get nodes -o wide
kubectl get pods -l app=regatta-api

## 2) Show env var for Mongo access
```bash
kubectl describe pod -l app=regatta-api | sed -n '/Environment:/,/Mounts:/p'

## 3) Prove app is live via Ingress/LB
```bash
curl -i http://regattas.blondfury.com/health
curl -s http://regattas.blondfury.com/api/regattas | head -c 300 && echo

## 4) Prove data exists in MongoDB
```bash
gcloud compute ssh wiz-mongo-vm --zone us-central1-a --command \
"mongosh --host 127.0.0.1 --port 27017 --username wizuser --password 'WizPassw0rd!' \
 --authenticationDatabase admin regatta_tracker --eval 'db.regattas.find({}, {name:1, location:1}).limit(5).toArray()'"

## 5) Prove backups + public bucket listing
```bash
gcloud compute ssh wiz-mongo-vm --zone us-central1-a --command "sudo crontab -l | grep mongo_backup"
curl -s "https://storage.googleapis.com/storage/v1/b/clgcporg10-162-wiz-mongo-backups/o" | head -c 400 && echo

## 6) Validate wizexercise.txt in running container

POD=$(kubectl get pod -l app=regatta-api -o jsonpath='{.items[0].metadata.name}')
kubectl exec -it "$POD" -- sh -lc 'cat /wizexercise.txt'

## 7) Call out intentional weaknesses + what you’d fix first
	• remove cluster-admin
	• move secrets out of env vars
	• close public SSH
	• remove public bucket access
	• add network policies + TLS