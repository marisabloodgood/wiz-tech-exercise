#!/bin/bash
set -e

apt-get update -y
apt-get install -y curl gnupg cron

curl -fsSL https://pgp.mongodb.com/server-5.0.asc | gpg --dearmor -o /usr/share/keyrings/mongodb-server-5.0.gpg
echo "deb [ signed-by=/usr/share/keyrings/mongodb-server-5.0.gpg ] https://repo.mongodb.org/apt/debian bullseye/mongodb-org/5.0 main" \
  > /etc/apt/sources.list.d/mongodb-org-5.0.list

apt-get update -y
apt-get install -y mongodb-org

PRIVATE_IP=$(curl -s -H "Metadata-Flavor: Google" \
  http://metadata.google.internal/computeMetadata/v1/instance/network-interfaces/0/ip)

sed -i "s/^  bindIp:.*/  bindIp: 127.0.0.1,${PRIVATE_IP}/" /etc/mongod.conf

systemctl enable mongod
systemctl restart mongod

mongosh admin --eval '
db.createUser({
  user: "wizuser",
  pwd: "WizPassw0rd!",
  roles: [{ role: "readWriteAnyDatabase", db: "admin" }]
})
' || true