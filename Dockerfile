# syntax=docker/dockerfile:1
FROM node:25-bookworm-slim@sha256:81db02c4b671288a03915da9534dbd54f96d0e7c24d80ccc54f5b36b2e684370
LABEL org.opencontainers.image.title="Historia Local" \
      org.opencontainers.image.description="Multiplayer alternate history with Ollama" \
      org.opencontainers.image.licenses="MIT"
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 DATA_DIR=/data
RUN command -v flock && mkdir -p /data && chown node:node /data && chmod 700 /data
COPY --chown=node:node package.json campaign-admin.mjs victory.mjs turn-planner.mjs ai-jobs.mjs ai-queue.mjs server.mjs engine.mjs rules.mjs strategy.mjs scenario-editor.mjs map-director.mjs security.mjs scenario.mjs prompts.mjs diplomacy.mjs turn-timer.mjs context.mjs manage.mjs ./
COPY --chown=node:node public ./public
COPY --chown=node:node prompts ./prompts
COPY --chown=node:node docker ./docker
COPY --chown=node:node LICENSE ./LICENSE
USER node
EXPOSE 3000
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD ["node", "docker/healthcheck.mjs"]
ENTRYPOINT ["sh", "/app/docker/entrypoint.sh"]
CMD ["node", "server.mjs"]
