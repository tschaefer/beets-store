FROM docker.io/library/debian:trixie-slim

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        curl \
        dumb-init \
        pipx \
        python3-venv \
    && rm -rf /var/lib/apt/lists/*

COPY rootfs /
COPY . /build

RUN PIPX_HOME=/opt/beets/.local/pipx \
    PIPX_BIN_DIR=/opt/beets/.local/pipx/bin \
    pipx install --include-deps /build \
    && rm -rf /build

VOLUME ["/opt/beets/media/music"]
EXPOSE 3000

USER root
WORKDIR /opt/beets

ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["bash", "-c", "/opt/beets/bin/beets-setup && exec /opt/beets/bin/beets-start"]
