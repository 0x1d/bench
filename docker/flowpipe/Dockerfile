# Flowpipe server for local development
# Downloads the linux amd64 binary from GitHub releases (requires glibc)
FROM debian:trixie-slim

ARG FLOWPIPE_VERSION=v1.2.0

RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates wget && \
    wget -qO- "https://github.com/turbot/flowpipe/releases/download/${FLOWPIPE_VERSION}/flowpipe.linux.amd64.tar.gz" | tar xz -C /usr/local/bin flowpipe && \
    chmod +x /usr/local/bin/flowpipe && \
    apt-get purge -y wget && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*

WORKDIR /flows

EXPOSE 7103

ENTRYPOINT ["flowpipe", "server", "--mod-location", "/flows", "--listen", "network"]
