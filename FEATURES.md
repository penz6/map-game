# Current features and remaining scope — 3.5

Reviewed October 16, 2026. This is an original Ollama game inspired by AI grand strategy. The comparison uses the previously reviewed public Pax Historia documentation/presets; it is not access to Pax production code or a claim of complete parity. Source links and research limits are in PARITY.md.

| Capability | Current implementation | Boundary / missing work |
| --- | --- | --- |
| Shared multiplayer | One to twelve human seats, invitation accounts, simultaneous private orders, host-controlled shared turns | Single server/process; no host transfer, spectators or seamless host departure |
| Live turn timer | 30 seconds–24 hours, pause/resume/extend/disable, server-enforced deadline and saved-order lock | Host still presses Advance; no automatic resolution on expiry |
| AI changes the map | Wild Map requires a real province-ownership change each successful AI turn; up to four validated changes | No scripted fallback if both AI proposals fail |
| Nation creation and destruction | Secession, collapse into 2–4 successors, unions, transfers, restored identities, names/colors/governments/leaders | Up to 64 nation identities; human identities cannot be deleted; final human province protected by default |
| Map | 28 starting nations and 84 original schematic European provinces | No accurate global geographic dataset; territory transfers change owners of existing polygons, not their shapes |
| Human army commands | Recruit, move, attack, persistent unit IDs/strength, attrition and retreats in either mode | Land armies only; no fleets, aircraft, terrain, supply or detailed logistics |
| Wild Map AI behavior | One world director, player-policy outcomes and validated territorial/political map changes | Does not plan recruitment/movement separately for every NPC; freeform military requests do not automatically create unit orders |
| Strategy AI behavior | Up to eight validated NPC orders, one per nation; bounded policy stats and up to two requested concrete actions per policy | Simplified simulation; no complete plan for every nation every turn; director map patches are prohibited |
| Diplomacy | Private NPC replies, human DMs, public congress and nearby-nation shortcuts | No multi-party private rooms. Only recent completed NPC exchanges inform shared resolution; human DMs/advisor text do not |
| Binding treaties | Trade, nonaggression and alliances, reciprocal consent, real costs/duration, break orders | Wild director can supply NPC consent via agreements. Chat alone is not binding; no complex custom treaty language or guarantee of AI acceptance |
| Economy and politics | Abstract treasury/economy/readiness/stability; rename, government, release, cede, annex and merge orders | No detailed trade market, demographics, research tree or production chains |
| System prompts | Editable turn/diplomacy/advisor prompts and world premise; fixed contracts remain enforced | Prompt edits cannot grant code execution or bypass engine rules |
| AI memory | Exact current state, strict 32K budgeting, extractive history/chat compaction and automatic staged policy planning | Lossy excerpts; no semantic retrieval, vector database or guaranteed lifelong diplomatic memory |
| AI execution | Ollama structured JSON, validation, one correction for invalid proposals, transactional state, bounded queue | No arbitrary shell/filesystem/network tools; no streamed function-call UI |
| Long AI requests | Background jobs, immediate HTTP 202, authenticated polling, idempotency-key replay | Job/result cache is in memory, bounded and retained up to one hour subject to capacity. Restart/expiry requires refreshing campaign state; no automatic replay or cancel UI |
| Saves/history | Persisted world, public events, private dialogue, 20 whole-turn checkpoints | No per-event reveal/intervention, branching story scene engine or named branch manager |
| Scenario editing | Validated starting-world JSON import/edit/export before turn 1 | No visual polygon editor or preset marketplace; up to 512 imported provinces can exceed the model budget |
| Advisor | Optional private Q&A/suggestions | No streamed charts/reports/artifact workflow; not needed for normal turns |
| Accounts/admin | Scrypt passwords, TOTP for administrators, invitations, server sessions, revocation, CSRF/Origin checks, application rate limits and audit | No public signups, email recovery, SSO or end-to-end encrypted chat |
| Deployment | Docker, non-root/read-only container, Pangolin/Traefik backend on 0.0.0.0:3000, no proxy-IP trust requirement | Pangolin/Traefik provides external TLS/routing; no live ingress or GPU benchmark performed |
| Publishing | PR tests/image smoke, GHCR workflow for eligible default-branch/tag pushes, amd64/arm64 build targets | A workflow configuration is not a deployed game or proof of arm64 runtime validation |

The most relevant missing Pax-style features are accurate global maps, visual scenario tooling, generic map objects (cities/factories/ships/aircraft/tags), per-event intervention/branching scenes, group diplomacy and user-authored workflows. Rich advisor artifacts are also absent, but are outside the user's current priority.

Recommended local model starting point remains qwen2.5:7b Q4, one generation and at most 32,768 total context. Large turns use bounded sequential passes, with lossy final intent summaries and atomic commit. Smaller-model reliability and RX 6750 XT runtime memory have not been measured. Use AI.md and scripts/context-report.mjs for workload-specific context sizing.

Version 3.6 adds up to eight Wild Map operations per turn, temporary new-state references for cross-border federations and same-turn government changes, exact adjacency context, stronger continuity guidance, and longer staged policy intents at 32K. Province geometry remains fixed.
