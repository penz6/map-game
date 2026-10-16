# Docker deployment behind Pangolin / Traefik

The game runs as one Node container with persistent accounts/campaigns and a separate MFA secret. Ollama runs separately. Pangolin/Traefik supplies the browser-facing HTTPS connection and is the only network route in this deployment. No bundled Caddy or trusted-proxy configuration is required.

## First deployment

1. Copy `.env.docker.example` to `.env`. Set `PUBLIC_ORIGIN` to your exact Pangolin HTTPS URL, and set your Ollama endpoint/model. The app listens on `0.0.0.0:3000`; Compose publishes port 3000 (customizable through `APP_BIND` and `APP_PORT`).
2. Generate the MFA key once with `node scripts/init-container-secret.mjs`. Keep `secrets/mfa_key` and the data volume for recovery. If Node is unavailable, use a temporary official Node container to run that script against the mounted project directory.
3. Start the app and create the administrator:

   ```sh
   docker compose up -d --build
   docker compose exec app node manage.mjs create-admin
   ```

4. Point Pangolin at `http://<game-host>:3000`, or `http://app:3000` when your connector shares the Docker network. Preserve the public Host header. Open the public HTTPS URL and enroll/sign in with the administrator's password and authenticator.

The backend accepts HTTP connections from any source address. It neither requires nor uses `X-Forwarded-For`, `X-Forwarded-Proto` or a proxy-IP allowlist. `PUBLIC_ORIGIN` still controls exact browser Origin/Host validation and Secure cookies. Pangolin is responsible for public TLS and network reachability, as specified for this deployment.

Allow enough upstream time for AI calls: the app permits ten minutes waiting in its queue, followed by generation, and a turn may need one correction attempt. With default 180-second generations, two attempts can each wait and run; use an upstream response timeout of at least 30 minutes if your proxy imposes one. Requests currently hold their HTTP connection open rather than returning asynchronous job IDs.

Application rate limits do not group players by the proxy address: 120 authenticated mutations and 300 authenticated reads per account per minute; ten login attempts per username per 15 minutes (successful authentication clears that username's counter); ten registration attempts per valid invitation per 15 minutes. There is a shared short burst guard of 200 POSTs, refilling at 50 per second, plus a two-password-hash concurrency limit and the existing bounded AI queue. Forwarded-IP changes cannot reset these limits.

`docker compose logs --tail=100 app` shows server logs. The workflow publishes GHCR images after eligible pushes/tags; no image is published merely by editing these files. Set `HISTORIA_IMAGE` to an available image and use `docker compose pull && docker compose up -d --no-build` to run a published release. Run only one app against a data volume.

## Connect Ollama

Start Ollama on the host or another trusted machine. Pull `qwen2.5:7b` with `ollama pull qwen2.5:7b`. The example uses `http://host.docker.internal:11434`; on Linux a host-gateway mapping is included. Inside the app container, `localhost` refers to the container, not your host.

Ollama must listen on an interface reachable from Docker; its default loopback listener may be unreachable through the Linux gateway. Set Ollama's service environment accordingly, restart it, and restrict port 11434 with the host firewall to the Docker/private network. Do not publish an unauthenticated Ollama endpoint to the internet. Alternatively supply a reachable trusted service URL. Endpoint approval is controlled by the server operator, not arbitrary players. Ollama browser CORS settings are unnecessary: requests originate from the Node server.

Set `.env` values, then recreate the app with Compose. Existing campaigns keep their saved model; use Host settings to change it. New campaigns inherit `OLLAMA_MODEL`.

| Setting | Compose default | Meaning |
| --- | --- | --- |
| `OLLAMA_URL` | `http://host.docker.internal:11434` | Approved native Ollama endpoint |
| `OLLAMA_MODEL` | `qwen2.5:7b` | Default model for new campaigns |
| `AI_MAX_CONCURRENCY` | `1` | Global simultaneous generations, allowed 1–2; one per account |
| `AI_CONTEXT_LENGTH` | `20480` | Requested context, allowed 4096–32768 |
| `AI_BATCH_SIZE` | `128` | Prompt processing batch size |
| `AI_TURN_OUTPUT_TOKENS` | `3072` | Reserved maximum generated turn tokens |
| `AI_CHAT_OUTPUT_TOKENS` | `768` | Reserved maximum chat/advisor tokens |
| `AI_KEEP_ALIVE_SECONDS` | `300` | Requested model residency after use |
| `AI_THINK` | `default` | Omit think flag, or explicitly `on`/`off` for compatible models |

The server also accepts `AI_TIMEOUT_SECONDS` (30–600, default 180) in its service environment. Compose exposes this setting too. Disabling thinking is useful with compatible Qwen3 models; use `default` with Qwen2.5 or models that reject the flag. Ollama's server-side parallelism and loaded-model settings also affect GPU memory; begin with `OLLAMA_NUM_PARALLEL=1` and one loaded model in Ollama's own service environment. No GPU is emulated by Docker or the game.

See [AI.md](AI.md) for the complete memory profile and compaction algorithm. Existing explicit `.env` values override new defaults, so update those settings when upgrading. `.env.ollama.example` describes settings for the separate Ollama process; the app cannot apply them remotely.

## RX 6750 XT and model size

The RX 6750 XT has 12 GB VRAM. Start with Q4 `qwen2.5:7b`; `qwen3:8b` with thinking disabled is another candidate. Their Ollama weight downloads are roughly 4.7 GB and 5.2 GB respectively. Actual runtime memory also includes context/KV cache, compute buffers, parallel requests and display use. These are recommendations, not measurements on this GPU.

`qwen2.5:3b` (about 1.9 GB weights) or `qwen3:4b` (about 2.5 GB) are experimental small-model options. They may produce weaker strategy or fail structured turn outputs more often. There is no validated lowest model: the full turn schema is more demanding than diplomatic chat. Failed structured generation preserves the turn for retry. Qwen2.5 3B uses a different license from its Apache-licensed 7B variant; check your intended use.

RX 6750 XT is absent from Ollama's official ROCm GPU lists. Current Ollama docs also describe a Vulkan backend for additional GPUs on Windows/Linux. Use a current supported build/driver and verify the actual backend and offload using Ollama logs and `ollama ps`; acceleration on this exact GPU has not been tested here. Linux ROCm target overrides are experimental, not a guarantee. CPU fallback may work, but latency depends on your CPU/RAM, which have not been specified. Running Ollama natively first is the simplest way to validate GPU support; putting the game in Docker does not require putting Ollama there.

Sources: [Ollama GPU support](https://docs.ollama.com/gpu), [context memory](https://docs.ollama.com/context-length), [thinking controls](https://docs.ollama.com/capabilities/thinking), [Qwen2.5 7B](https://ollama.com/library/qwen2.5:7b), [Qwen2.5 3B](https://ollama.com/library/qwen2.5:3b), [Qwen3 8B](https://ollama.com/library/qwen3:8b), [Qwen3 4B](https://ollama.com/library/qwen3:4b).

## GitHub Actions → GHCR

`.github/workflows/container.yml` runs the Node tests and Docker smoke test for pull requests and pushes to main/master. After tests pass, default-branch pushes publish `ghcr.io/<owner>/<repository>:latest` and `sha-<full-commit>`. Version tags such as `v2.1.0` publish `:2.1.0` and `:2.1`; version tags do not move latest. A manual run publishes only on the default branch or a version tag. PRs never receive publishing credentials.

The publish job uses GitHub's built-in `GITHUB_TOKEN` with `packages: write`; no registry password or personal access token needs to be added to repository secrets. Repository/org policy must permit Actions package publication. Images target linux/amd64 and linux/arm64 and request SBOM/provenance attestations. Action versions and runtime base images are pinned; Dependabot proposes updates. The example image name is `ghcr.io/penz6/map-game:latest` for the currently configured Git remote. If you fork, update `.env` to use your own repository's image.

The workflow must first be committed and pushed to GitHub to run. Creating the YAML locally does not publish an image. See GitHub's [publishing guide](https://docs.github.com/en/actions/tutorials/publish-packages/publish-docker-images).

## Backup and recovery

Stop the app, then back up the complete `game_data` volume and `secrets/mfa_key` separately and securely. The volume holds password hashes, account/session/invitation records, private chat and campaign saves. Public world exports are not complete backups. Do not use `docker compose down -v` unless you intend to delete all persistent data.

The app runs as UID 1000 with a read-only root filesystem, all capabilities dropped, no-new-privileges and a persistent writable data volume. The entrypoint uses an OS file lock for exclusive volume ownership across container PID namespaces and crash recovery. A second container using the same volume is rejected. Use a local Docker volume/filesystem with working file locks, not an unsupported network share. Do not mount the same saves into a separate bare-Node server.

Recovery commands retain the same console-only security boundary:

```sh
docker compose exec app node manage.mjs reset-password USERNAME
docker compose exec app node manage.mjs reset-mfa USERNAME
```

This pre-deployment ruleset does not migrate older prototype saves. Start with a fresh data location. Keep the configured production MFA secret stable once accounts are enrolled. Keep secrets out of the image; `.dockerignore` permits only runtime source files. App-only memory limit is 512 MiB; Ollama requires its own independent resources.
