# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim@sha256:a5f4366e834695d5f363b920c104953a535d3a9864d1bdf74566a0ebe01daee5
LABEL org.opencontainers.image.title="Historia Local" \
      org.opencontainers.image.description="Multiplayer alternate history with Ollama" \
      org.opencontainers.image.licenses="MIT"
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 DATA_DIR=/data
RUN command -v flock && mkdir -p /data && chown node:node /data && chmod 700 /data
COPY --chown=node:node package.json turn-planner.mjs ai-jobs.mjs ai-queue.mjs server.mjs engine.mjs rules.mjs strategy.mjs scenario-editor.mjs map-director.mjs security.mjs scenario.mjs prompts.mjs diplomacy.mjs turn-timer.mjs context.mjs manage.mjs ./
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
