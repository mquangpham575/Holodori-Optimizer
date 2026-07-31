FROM twinproduction/gatus:latest

USER root
RUN mkdir -p /data && chown -R 1000:1000 /data
USER 1000

# Embed the pre-configured config.yaml into the container
COPY config.yaml /config/config.yaml
