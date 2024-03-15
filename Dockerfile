FROM docker.io/bitnami/minideb:latest
LABEL org.opencontainers.image.source="https://github.com/tschaefer/beets-store"

RUN install_packages pipx curl dumb-init
COPY rootfs /

ARG BUILD_BRANCH=main

RUN bash -c ' \
    PIPX_HOME=/opt/beets/.local/pipx \
    PIPX_BIN_DIR=$PIPX_HOME/bin \
    pipx install --include-deps \
    https://github.com/tschaefer/beets-store/archive/refs/heads/${BUILD_BRANCH}.zip \
    '
VOLUME ["/opt/beets/media/music"]
EXPOSE 3000

USER root
WORKDIR /opt/beets

ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["bash", "-c", "/opt/beets/bin/beets-setup && exec /opt/beets/bin/beets-start"]
