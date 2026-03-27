FROM docker.io/library/debian:trixie-slim AS builder

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        pipx \
        python3-venv \
    && rm -rf /var/lib/apt/lists/*

COPY . /build

RUN PIPX_HOME=/opt/beets/.local/pipx \
    PIPX_BIN_DIR=/opt/beets/.local/pipx/bin \
    pipx install --include-deps /build \
    && rm -rf /build


FROM docker.io/library/debian:trixie-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        curl \
        dumb-init \
        python3 \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd -r -g 1000 beets \
    && useradd -r -u 1000 -g beets -d /opt/beets -s /sbin/nologin beets

COPY --from=builder --chown=beets:beets /opt/beets/.local /opt/beets/.local
COPY --chown=beets:beets rootfs /

VOLUME ["/opt/beets/media/music"]
EXPOSE 3000

USER beets
WORKDIR /opt/beets

ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["bash", "-c", "/opt/beets/bin/beets-setup && exec /opt/beets/bin/beets-start"]
