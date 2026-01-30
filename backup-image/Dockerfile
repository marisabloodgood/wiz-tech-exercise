FROM google/cloud-sdk:alpine

# Install mongo tools at BUILD time (not runtime)
RUN apk add --no-cache mongodb-tools bash tar

WORKDIR /work
ENTRYPOINT ["/bin/sh","-c"]
