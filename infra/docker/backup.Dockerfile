# Money Money database backup sidecar: scheduled pg_dump, integrity + restore verification,
# local retention and optional off-server copy via rclone (e.g. Cloudflare R2 / any S3).
FROM postgres:17-alpine
RUN apk add --no-cache rclone tzdata bash coreutils
COPY infra/docker/backup/ /usr/local/bin/mm-backup/
RUN chmod +x /usr/local/bin/mm-backup/*.sh
ENV TZ=Asia/Manila
HEALTHCHECK --interval=5m --timeout=10s --start-period=2m --retries=3 \
  CMD /usr/local/bin/mm-backup/healthcheck.sh
ENTRYPOINT ["/usr/local/bin/mm-backup/scheduler.sh"]
