# Historia Local 3.7 — multiplayer AI map sandbox

An original self-hosted alternate-history game using your Ollama endpoint. It is not built on another game's image or engine. Runtime dependencies are Node.js and its bundled SQLite; there is no npm installation/build step or CDN. The Docker image uses the official Node base behind your Pangolin/Traefik HTTPS route.

**Wild Map is the default:** one AI world director turns player plans into breakaway republics, improbable unions, collapses and border transfers. Each successful AI turn must actually change province ownership; a funny headline alone is rejected. The shared map updates its colors and highlights changed provinces for every player. See [MAP-DIRECTOR.md](MAP-DIRECTOR.md). The starting map has **47 governments and 122 playable regions across the whole world**; the optional Strategy mode retains armies, budgets, treaties and bounded NPC orders. [PARITY.md](PARITY.md) records the current Pax Historia research and remaining gaps. The MapLibre atlas fills the screen with local shaded relief, lakes, rivers, cities, live political borders, real scale and flat/globe views. Actions and chats open as overlays. See [ATLAS.md](ATLAS.md) for sources, licenses and rebuild instructions. Events and campaign players open on demand. Army strength and treasury details stay internal; direct orders remain under Game menu → Structured orders. This is not full Pax Historia parity. Use Find a nation, My nation, zoom and World to navigate every continent. Smaller countries and territories are grouped with larger governments; Antarctica is neutral. New campaigns use this world map; existing saved campaigns retain their original map. Interwar outlines and groupings are approximate, and playable regions are game sectors rather than historical provinces; see [map sources and limitations](data-maps/README.md).

See [FEATURES.md](FEATURES.md) for the current feature matrix and gaps, [AUDIT.md](AUDIT.md) for audit closures, and [AI.md](AI.md) for measured context requirements.

## Docker

Follow [DOCKER.md](DOCKER.md): configure the domain, HTTPS origin and Ollama endpoint, then:

```sh
docker compose up -d --build
docker compose exec app node manage.mjs create-admin
```

Create the administrator interactively and sign in with its username and password at your configured HTTPS URL. There are no default accounts/passwords. Existing account-based version-4 campaigns are supported and their untouched default map geometry upgrades automatically. Obsolete prototype saves still require a fresh data directory/volume.

`.github/workflows/container.yml` tests and builds PRs, and publishes amd64/arm64 images to GHCR after default-branch pushes or version tags. Creating the file locally has not published a registry image. It uses GitHub's built-in token with package-write permission.

## Run on one computer

Use a patched Node.js release, minimum 22.13 (tested on Node 24):

```sh
node manage.mjs create-admin
npm start
```

Open `http://localhost:3000` on that computer. Localhost is not a remotely hosted preview. Multiplayer over a network needs HTTPS; see DOCKER.md and SECURITY.md. Never expose an unauthenticated Ollama port publicly.

## Accounts and campaigns

Registration is open to everyone; new users always receive the member role. The server administrator disables accounts, revokes sessions, manages campaign assignments, closes campaigns and reviews security events. All accounts use password-only login; MFA and its encryption-key setup have been removed. Account recovery is console-only. Accounts use salted scrypt password hashes and server-side HttpOnly cookie sessions with CSRF/Origin checks.

Each account can hold one nation in a campaign. A campaign host or server administrator generates a reusable seven-day campaign invitation; guests without accounts are prompted to register with their invitation preserved, then load available nations and choose an unclaimed country with land. Up to 12 human players share the same world; unclaimed nations remain map owners. In Wild Map, one world director changes the world without separate nation action plans. New independent nations become available seats too. New accounts are ordinary members; additional administrators require the console.

Host and administrator privileges are separate. Administrators have no automatic API access to another campaign's private chat. The machine operator can inspect save files, so this is not end-to-end encrypted hosting. See [SECURITY.md](SECURITY.md) for the full boundaries, session lifetimes, throttling and deployment requirements.

## Play

Players submit up to three autosaved actions. Guests mark ready; the host can save, ready and advance in one click. AI requests now explicitly label every order index and bind policy responses to the exact submitted player/order pairs, preventing country IDs or one-based numbering from being accepted as policy references. Invalid responses still receive one correction attempt and cannot change the world. Failed AI jobs now show an explicit error with a reference matching a structured diagnostic in container stderr; see [AI failure diagnostics](DOCKER.md#ai-failure-diagnostics). The host advances once everyone is ready or the optional countdown expires. Orders remain private until resolution. In Wild Map, write a Policy describing what you want, or simply ready up and watch events unfold. The director proposes up to eight validated map changes, with at least one real ownership change. It gets one correction attempt for invalid proposals; if that also fails, the world and saved orders stay intact. Demo mode makes no AI calls and does not generate director map changes. Strategy mode instead adds bounded policy effects and NPC orders.

| Order | Treasury | Effect |
| --- | ---: | --- |
| Invest | 15 | +6 economy |
| Mobilize | 15 | +8 military readiness, −2 stability |
| Stabilize | 10 | +10 stability |
| Recruit | 20 | New 30-strength army in an owned province |
| Move | 0 | Selected army moves one route into an owned province |
| Attack | 10 | Selected army attacks one adjacent foreign province |
| Policy | 5 | Wild Map: narrative outcome and director map changes. Strategy: bounded stats and up to two requested concrete actions at their normal costs |
| Government | 10 | Change government, ideology and leader; −5 stability |
| Rename | 5 | Rename own polity without changing its stable ID |
| Release | 20 | Create a new independent nation from an owned non-capital province |
| Cede | 0 | Transfer an owned province and local armies to another nation |
| Annex | 15 | Formally remove a landless defeated NPC whose original capital you control |
| Merge | 10 | Unify only with reciprocal consent; two human seats cannot merge |
| Treaty | 5 | Reciprocal trade, nonaggression or defensive alliance |
| Break treaties | 5 | End agreements with the selected partner; −8 stability |

Armies have persistent IDs, strength and province positions. One army can receive one movement/attack order per turn. Friendly moves resolve before battles; attacking armies do not also defend their origin. Combat combines same-country attackers, uses national readiness and deterministic variation, and gives local defenders a garrison plus defensive advantage. Attackers lose 25% strength and local defenders 30%; survivors retreat to a friendly adjacent province if possible. The strongest successful contender takes the province. Units unable to retreat are removed. Limits: 12 armies per nation, 256 worldwide, 64 nations.

Treaties last 12 further turns. Trade adds 3 income per active partner; nonaggression and alliances block attacks. Alliances add 3 defensive garrison strength per ally, capped at 9. Break a blocking treaty in an earlier turn before attacking. Hostile action ends other bilateral agreements. Unification does not silently execute from a chat promise. Political orders that become impossible during combat are not completed and refund their fixed cost.

A nation with land earns rounded economy/5 treasury, minimum 2, each turn. Statistics are abstract and bounded. A landless human nation remains in exile rather than being silently reassigned. Calendar jumps are 1/3/6 months; costs and effects are per turn. Victory criteria are editable by server administrators, as described below. There is no naval/air model, terrain/supply simulation or global economic market.

## Live turn timer

Use **Host settings → Configure live turn timer**, or **Orders → Turn timer → Configure**. Set 30 seconds to 24 hours, or 0 for unlimited planning. Pause, resume, add one minute or disable from Orders. Expiry locks saved orders/readiness and lets the host advance without absent players. Unsaved drafts do not count. The server enforces deadlines even with browsers closed. Each successful turn starts a fresh countdown; AI failure preserves the expired turn for retry. This timer is separate from in-game calendar time.

## Diplomacy and advice

The Diplomacy tab groups nearby AI/human governments and other active nations. Map selection also opens diplomacy. Public congress reaches everyone; human DMs reach the corresponding account; NPC conversations are private to the initiating account. Replacement governments do not inherit previous occupants' private chat. Completed NPC negotiations feed the turn director and can influence subsequent map changes. They execute nothing immediately and do not guarantee success or create binding treaties. Recent private NPC exchanges from current human seats are supplied to the director, but are not added to other players’ chat views. Human DMs and advisor exchanges are excluded. Finish negotiations before the host advances.

The optional Advisor tab stores private per-account Q&A and can suggest actions. Advice never executes orders. Chat/advisor context compaction is audience-scoped and original histories remain saved, subject to 1,000-message retention limits for campaign chat and advisor exchanges.

## Starting scenarios and timeline

Before the first completed turn, with all players unready, **Host settings → Starting-world editor** opens the world JSON. Paste/edit an original scenario, including polygons, province routes, nations, armies and political fields. Every seated human nation must remain with land. Validation rejects dangling references, invalid colors/stats, duplicate IDs and misplaced armies. Applying clears orders and dialogue. This is a JSON editor, not a visual map-drawing tool or public preset browser. Custom imports can have up to 512 provinces, but larger worlds may exceed the configured model context and fail explicitly.

**Host settings → Timeline checkpoints** lists up to 20 pre-turn snapshots. Rewind restores world state and removes later events, chat, advisor exchanges and current orders. It does not alter accounts or invitations. Seats for successor nations absent at the chosen checkpoint must be removed first. In-flight replies from the discarded branch are rejected. This is whole-turn rewind, not per-event intervention.

AI requests return background jobs immediately and the browser polls for completion, so Pangolin/Traefik connections stay short. Queued follow-ups use the latest completed conversation. AI generation requests queue instead of failing when another player is using Ollama. The default remains one active generation, with up to 32 waiting requests and four outstanding per account. Waits expire after ten minutes; model execution has its separate timeout. The queue/job cache is in memory; after restart or expired results, refresh the campaign before retrying. Idempotency keys prevent duplicate execution while a job is cached. Stale or unauthorized queued requests are rejected before generation.

## Models, prompts and memory

[AI.md](AI.md) documents the RX 6750 XT starting profile and the **32,768 total context ceiling**, including output/framing reserves. Keep one generation, batch 128, and begin with qwen2.5:7b Q4. Large turns automatically use sequential policy batches plus one final world pass; they never request a larger context. Full orders stay saved, while final policy intents are explicitly lossy summaries. A failed phase commits nothing. Set AI_CONTEXT_LENGTH=32768 in your .env; an existing explicit 20000 setting continues to select a smaller window. Actual model quality and VRAM usage remain unbenchmarked on your card.

Hosts can edit turn/diplomacy/advisor prompts per campaign. The fixed application contract and engine validation remain in force. The world is encoded as tables; optional older history and private dialogue compact into partial highlights. Essential state and the current message are budgeted before each request. Original orders stay saved and are read in full during bounded policy or explicit source-compression passes; final world planning uses labeled lossy intent summaries. Impossible scenarios/prompts are rejected instead of increasing the 32K ceiling. See [PROMPTS.md](PROMPTS.md).

## Recovery and checks

Stop the server before coherent backups of the whole data directory/volume. Public exports are not account backups. Console recovery:

```sh
node manage.mjs reset-password USERNAME
```

For Docker, prefix with `docker compose exec app`. Password resets revoke sessions. Do not use `docker compose down -v` to stop an installation you intend to keep.

Run `npm test`. See [VALIDATION.md](VALIDATION.md) for actual checks and untested boundaries. Authentication and regression checks are not a security certification or a live-model benchmark.

## Campaign administration and winning

Open **Administration → Campaigns → Manage**. Administrators can add an existing active account to a nation midway through a campaign, reassign a player to an unclaimed nation, or swap two existing players. Changes are allowed between turns, including after a timer deadline (extend the timer to let new players submit). They clear affected players' saved orders/private conversations, invalidate old seat jobs, and reset everyone to unready. Host privileges follow the host's new seat. Territory stays with the nation. Duplicate seats and landless/retired nations are refused.

The same screen contains **Private victory criteria**. Save a prompt such as “The first player to own six provinces and maintain stability above 70 wins.” Click **Evaluate current world with AI**. The model sees the current world and compacted public history, not private chat or current secret orders. It can recommend one winner, a tie, or no winner. All criteria/recommendations remain admin-only; evaluation is queued and stays within the same 32K budget.

Review the result, enter a separate public announcement, and choose **Declare winner and finish campaign**. Only a current winning recommendation can be published. Players see the winning nation/player and announcement; turn mutations stop. Admins can reopen the campaign. Changed criteria/world/assignments invalidate recommendations. Criteria express subjective rules for AI review; admin confirmation decides the result. No new defeat/elimination mechanic was added; existing human nation protection remains enabled by default.
