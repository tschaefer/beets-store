FROM docker.io/bitnami/minideb:latest
LABEL org.opencontainers.image.source="https://github.com/tschaefer/beets-store"

RUN install_packages pipx curl
COPY rootfs /

RUN bash -c ' \
    PIPX_HOME=/opt/beets/.local/pipx \
    PIPX_BIN_DIR=$PIPX_HOME/bin \
    pipx install --include-deps https://github.com/tschaefer/beets-store/archive/refs/heads/main.zip \
    '
VOLUME ["/opt/beets/media/music"]
EXPOSE 3000

USER root
WORKDIR /opt/beets

ENTRYPOINT ["/opt/beets/entrypoint"]
