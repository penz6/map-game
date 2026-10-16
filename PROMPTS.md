# Maps, countries, prompts and diplomacy

## Choosing a map and a country

This version includes one scenario: **Europe, January 1936**, 28 countries. It uses an original coarse geographic sketch and 84 schematic provinces and persistent land armies. There is a starting-world JSON editor/importer, but no visual polygon editor, preset marketplace or worldwide bundled map.

The host selects their country when creating a campaign. A registered player opens a valid campaign invitation, loads the available nations, selects an unclaimed country with territory, then joins. Server validation prevents two people claiming one country, including simultaneous join attempts. Each account has one seat per campaign; up to 12 people can participate. Countries without human seats are AI governments. Seats cannot currently be switched in-place: a host can remove another player and invite them to rejoin an available country.

Map source is `scenario.mjs`: countries, stats, polygon points, initial owners and the symmetric adjacency graph, including selected sea connections. Edit it and restart/rebuild to change the scenario for **new** campaigns. Existing campaigns retain their saved world. The UI's initial map/country list also comes from this scenario, so keep IDs, territories and adjacency consistent. The starting-world editor accepts the world JSON from an export before the first turn. It validates identity, ownership and graph integrity. Accounts and chronology are not imported; back up the private data volume and separate MFA key for recovery.

## What is the system prompt?

There are three system prompts, not one shared persona. Exact editable text is in:

- `prompts/turn.txt`: Wild Map world director encouraging playful border changes; optional Strategy mode uses historical/logistical plausibility. Policies are attempts, and protected human seats retain land.
- `prompts/diplomacy.txt`: represent the selected nation's interests; negotiate, refuse or demand concessions; specific proposals under 180 words. `{{countryName}}` and `{{countryId}}` are substituted by the server.
- `prompts/advisor.txt`: private strategic counsel, distinguish estimates from facts, offer trade-offs under 250 words.

The host can open **Host settings → AI system prompts · view & edit**, change each prompt and save during planning. These changes persist per campaign and affect subsequent requests. Reset populates the default fields; save to commit the reset. New campaigns snapshot the bundled prompt files. Old saves without prompt fields use the bundled defaults. Editing a source prompt file therefore changes defaults/new campaigns after restart; it does not silently rewrite a campaign's saved prompts.

Every prompt has a fixed **application contract** appended by `prompts.mjs`, also visible read-only in the editor. It specifies schema/stat limits for turn output, treats supplied player content as data, and limits chat/advice to proposals. The engine independently validates and resolves orders. A host-edited prompt cannot grant permissions or directly change accounts, territory or arbitrary server files. Prompt instructions cannot guarantee an LLM will behave correctly; server-side authorization and deterministic validation enforce those boundaries.

The world premise is a separate editable field in Host settings, supplied as context with the current date, country stats, territory owners, adjacency and recent public history. Turn adjudication also receives the submitted human orders. Diplomatic requests receive the speaking player's country and its nearby IDs, plus only the recent private exchange with that recipient. They do not receive other humans' unsubmitted orders or other private conversations. The server-side model operator can inspect the requests it receives; this is not end-to-end encryption.

## Talk to nearby AI nations

Open **Diplomacy** to see **Around your borders & sea routes**. Buttons distinguish AI and human governments. Neighbors are computed from current territory ownership and scenario adjacency; they update after conquests. The recipient selector groups nearby AI, nearby human and other governments. Click a country on the map and use **Open diplomacy** as another entry point. Distant diplomacy remains available.

A message to an unclaimed country generates an in-character reply via the campaign's Ollama endpoint/model. The exchange is private to the initiating account. A message to a human-controlled nation is delivered privately to that player; the AI does not impersonate them. World congress is public to everyone in the campaign. Recipient ownership is rechecked after a model reply to prevent stale NPC answers after a human joins. A new player claiming a previously occupied country does not inherit the former player's private conversations.

Trade offers, alliances, threats and peace terms in chat are proposals. Use reciprocal treaty orders for trade/nonaggression/alliances; chat promises alone are not binding. Completed NPC conversations also inform the next shared turn, so negotiations can influence map consequences without being guaranteed. Use policies to make your intent explicit. Recent NPC negotiation excerpts from current seats are visible to the director; human DMs and advisor messages are excluded. AI may refuse or misjudge an offer. Demo mode tests deterministic turns; meaningful NPC replies still need a configured model.

## Turn and model boundaries

Players submit up to three private orders and mark ready. The host advances once everyone is ready or the optional live turn countdown expires. At expiry, only saved orders count; missing orders become no actions. Host settings exposes the timer separately from the calendar skip. In default Wild Map mode, the model narrates events and proposes real ownership changes using one director; no NPC action plans or advisor calls are needed. Strategy mode instead adjudicates bounded policy effects and proposes limited NPC orders. The engine validates costs, adjacency, human sovereignty and effect ranges, resolves combat and commits one shared world. Invalid AI output or connectivity failure preserves the previous world and submitted orders for retry.

Requested context and concurrency can be reduced by the server operator for smaller hardware. Automatic compaction uses conservative input budgeting, keeps current state/orders exact and reduces optional history/private dialogue into partial extracts. It rejects essential input that cannot fit rather than depending on silent model truncation. This is not an exact tokenizer or an AI-generated summary. See AI.md for the algorithm and its memory trade-offs. See DOCKER.md for the RX 6750 XT recommendations, known AMD compatibility limits and resource controls.


Version 3.4 Wild Map responses may include agreements for NPC treaty/unification consent or breaking treaties, using normal costs and reciprocal order rules. Strategy responses must leave mapChanges empty. Chat promises alone are not binding. NPC exchanges and advisor questions are packed when their queued job acquires the generation slot, after preceding committed replies, rather than at initial submission. Full resolution is simulated before accepting a proposal so post-order conflicts can receive one correction. AI endpoints return background jobs; the browser polls their account-private result.


Version 3.6 stages oversized turns under a 32,768 total context ceiling. Editable turn text is used in policy/world passes, followed by phase-specific fixed contracts. Policy batches return provisional outcomes and intents; only the final world pass selects map consequences. A separate fixed text-compression task is used only when a full individual source plus necessary state will not fit. Final intent summaries are lossy and original orders remain saved. The model never receives arbitrary code/tool authority in any phase.
