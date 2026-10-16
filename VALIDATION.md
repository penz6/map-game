# Validation record — Historia Local 2.1

Validated October 15, 2026 on Node.js 24.19.0 (host) and Node.js 24.22.0 (Linux amd64 image).

- All 35 API/engine/security tests passed together. New checks cover host-only prompt edits, atomic validation, persisted prompt text, interpolated NPC identity, private AI context, current-ownership neighbor calculation, invited country availability, Docker secret-file loading and bounded AI configuration.
- Two independent Chromium contexts passed MFA login, administrator controls, invitation signup, campaign joining, unavailable country display, prompt edit/save/reopen, nearby AI recipient controls, two-player advancement, escaped private chat, reload recovery, account disable and mobile layout.
- Docker image built successfully from the pinned Node base. Container smoke passed as UID 1000 with a read-only root filesystem: health, authenticated campaign creation, persisted accounts/sessions/campaign after SIGKILL/restart, and rejection of a second container sharing the data volume.
- Compose configuration and GitHub Actions workflow syntax validated. Actionlint ran with networking disabled, no source mounts and only workflow YAML on stdin. The workflow is configured for amd64/arm64 publication, but only amd64 was built locally. No GitHub workflow was executed and no registry image was pushed from this workspace.
- Controlled Ollama HTTP responses verified schema validation, private NPC dialogue, advisor and model discovery. No real model, GPU compatibility, strategic quality or latency was benchmarked. RX 6750 XT recommendations are based on published model sizes and Ollama GPU documentation.
- Existing tests verified exact HTTPS proxy trust, host-only Secure cookies and HSTS. No public domain or public certificate was deployed. See the Docker proxy validation note below for the local end-to-end check.
- JavaScript syntax checks passed. This is regression/hardening evidence, not independent penetration testing or certification. No chat-hosted preview URL was produced.

Run `npm test` for the full suite. Build with `docker build -t historia:ci .`, then run `node scripts/container-smoke.mjs historia:ci` on a Docker host. Review SECURITY.md and DOCKER.md for deployment and recovery.

Docker proxy validation: the pinned Caddy image and hardened app passed an end-to-end local HTTPS check with an explicitly trusted disposable internal CA, correct loopback forwarding, HSTS and non-root app access to the read-only MFA secret. The proxy retains NET_BIND_SERVICE; all other proxy capabilities and all app capabilities are dropped. No public certificate or domain was used.

## Live turn timer (2.2)

All 40 API/engine/security tests passed together. New timer checks cover host/CSRF permissions, duration bounds, stale round rejection, the exact deadline boundary, saved orders and absent players, pause/resume/extension, reopening expired planning, restart persistence and AI failure preserving expired state. Timer deadlines are evaluated on the server independently of browser countdowns. The image includes the timer module; the existing Docker build and persistence smoke checks are re-run for this version.

Two-context Chromium timer QA passed: both players saw the live countdown; host pause/resume/extension synchronized; expiry disabled edits and warned about an unsaved draft; the host advanced with saved orders only; the next turn restarted the timer. Existing account/security browser flows and 390px mobile layout also passed.

## VRAM profile and compaction (2.3)

All 47 API/engine/security/context tests passed together. New tests exercise the 12K/one-generation/batch-128 profile, unchanged current state and submitted policies after 240-turn compaction, private-dialogue isolation, Unicode/oversized required input, combined output-reserve validation, Ollama output-limit failures and rollback without contacting Ollama when input cannot fit. The updated amd64 Docker image built and passed persistence/isolation smoke checks. Compose configuration and JavaScript syntax checks passed. Existing two-context Chromium security/game/timer flows passed after the UI profile display was added.

Memory settings were verified in controlled Ollama request payloads, not against a physical RX 6750 XT or a live model. No VRAM total, speed or exact tokenizer compatibility has been measured. The profile uses conservative byte-based input budgeting with template headroom; compaction consists of lossy local extracts and keeps original archives intact (subject to the existing chat retention limit). Host Ollama global settings are documented separately and were not changed remotely. No executable LLM tool calls, automatic repair loop or request queue were introduced.

## Province and political sandbox (3.0)

The current build replaces the prototype rules rather than maintaining a compatibility branch. It has 84 schematic provinces, persistent armies, political orders, bounded concrete actions from freeform policies, bilateral treaties, validated starting-world editing, private persisted advisor/suggestions and host checkpoint rewind. Public first-party Pax research and the implemented/partial/missing comparison are in PARITY.md. No proprietary Pax code, prompts, scenario rules or map assets were copied.

The expanded test suite covers unit ownership/routes, recruitment, simultaneous combat, retreats, successor-state identity and allegiance, cession, annexation protections, reciprocal mergers, government/rename actions, AI sovereignty/cost limits, policy action translation, treaty consent/effects/breaking, scenario graph validation, checkpoint restoration, discarded-future AI replies, advisor audience isolation and production CLI secret-file handling. Full-suite totals are recorded after the final run below.

Two-context Chromium checks passed actual UI workflows: 84 province polygons and 28 initial army markers, scenario JSON import, guest joining, army recruitment and movement, government/leader changes, renaming, release of an independent nation, NPC diplomacy with the successor, private persisted advisor suggestions, reload, whole-turn rewind and mobile layout. Existing multiplayer/timer/security browser flows also passed.

The amd64 image built; Docker smoke verified non-root/read-only operation, authentication, persisted world/session state after SIGKILL/restart and shared-volume exclusion. A separate pinned Caddy/container test passed locally trusted HTTPS, forwarding, HSTS and secret-file access. Compose configuration validated. No live Ollama model, physical RX 6750 XT, public certificate, arm64 execution or GitHub publication was available/tested. The larger authoritative world uses a 20,480 context starting profile, single generation and batch 128; actual VRAM is unmeasured. Large custom scenarios or long policies can still exceed the conservative budget and fail explicitly.

This is not full Pax Historia feature parity. See PARITY.md for remaining global-map, visual-editor, scene/intervention, generic-feature and workflow gaps.

Final version-3 suite: all **66 tests passed together**. The last regression also rejects a delayed NPC response after its initiating account changes government seats. Source syntax, Compose and the final image build passed.


## Wild Map director (3.1)

All **79 tests passed together** on October 15, 2026. New tests cover real ownership changes, rejection of narrative/cosmetic-only proposals, secession/collapse/union/restoration, army allegiance, human last-province protection, atomic rollback, smaller map-focused context, one director request, a bounded correction attempt and failure preserving orders/date/expired timer.

Two-context Chromium QA with controlled Ollama responses passed three shared turns: Tiny Tea Republic secession, Italy split into Pasta Republic/Noodle Federation, and Belgium joining United Wafflelands. Both players saw matching ownership/colors, changed-province outlines and engine-confirmed summaries. Reload persistence, timeline rewind and 390px mobile layout passed. These checks verify the application plumbing, not a live model's creativity or reliability.

The updated amd64 Docker image built and passed non-root/read-only health, authenticated play, SIGKILL/restart persistence and shared-volume exclusion. Compose configuration validated. The GitHub workflow was not run and no image was published. No physical RX 6750 XT or live Ollama model was benchmarked.


## Diplomacy consequences and AI queue (3.2)

All **89 tests passed together** on October 15, 2026. New checks cover FIFO queue admission, one slot per account, configurable global concurrency, overload limits, timeout/shutdown cleanup, two concurrent player chats completing serially, failed generation releasing its slot, queued session revocation and stale-world rejection before generation. Controlled turn requests include recent NPC negotiations while excluding human DMs/advisor text, former seats, future/old rounds and account identifiers. Diplomacy excerpts compact without modifying submitted orders.

The updated amd64 image built and passed authenticated non-root/read-only startup, SIGKILL/restart persistence and shared-volume exclusion. Two-context Chromium Wild Map QA passed matching ownership/colors, reload, rewind and mobile layout. Compose and client/server syntax checks passed. Model responses were controlled fixtures; no live Ollama/GPU quality or performance benchmark was run. No GitHub workflow or registry publication was executed.


## Pangolin/Traefik deployment and application rate limits (3.3)

All **93 tests passed together**. Public-mode backend HTTP works without a trusted proxy or forwarding headers; exact public Host/Origin, CSRF, Secure cookies and MFA remain enforced. Tests verify per-account rate isolation on one proxy address, forwarding-header changes cannot reset counters, more than thirty unrelated login attempts do not lock out a valid account, more than ten independently invited users can register behind one proxy, and the short global POST burst guard refills.

Compose configuration and JavaScript syntax validated. The updated amd64 image built successfully. The new Docker smoke run was not executed: automatic approval review could not complete because workspace credits were exhausted. This is an infrastructure review failure, not an unsafe-action determination. Earlier release smoke results do not substitute for this version's unrun check. No live Pangolin/Traefik instance or public endpoint was exercised, and no GitHub image was published.

This change addresses proxy configuration and application rate limiting. The other gameplay/concurrency findings in the separate 3.2 audit remain outstanding.
