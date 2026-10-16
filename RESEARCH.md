> **Version 3:** See PARITY.md for freshly verified public sources, the current comparison and remaining gaps. The following is the archived initial prototype research, not the current feature list.

> **Version 2 update:** This document records the initial gameplay research and prototype design. Browser bearer access described below has been superseded by password accounts, password-only administrators, cookie sessions, open signup and campaign invitations. See README.md and SECURITY.md for the current build.

# Research: a local multiplayer Pax Historia alternative

Research conducted October 15, 2026. Public documentation and repository materials were reviewed. These findings do not claim access to Pax Historia's private implementation or complete product parity.

## What Pax Historia exposes publicly

The product organizes gameplay around map, chat, actions and advisor functions. Its supported creator architecture separates workflow orchestration, a game runtime that validates commands and persists state, and platform-owned AI/provider services. Workflow code controls prompts, tools, timing and retry policy. This is the most useful architectural lesson for a local implementation: keep authoritative world state in the application and make the language model a replaceable generation service. Sources: [Creator Docs](https://www.paxhistoria.co/docs), [Bundle Quickstart](https://www.paxhistoria.co/docs/bundles).

Creator workflows are typed JavaScript generators yielding JSON-serializable commands. Their sandbox does not directly expose provider credentials, fetch or filesystem access. Advisor replies can stream text and validated tool output; tool calls are data that the workflow must explicitly turn into an effect. The game runtime checks schemas before dispatch. Source: [Workflow Quickstart](https://www.paxhistoria.co/docs/workflows).

Long campaigns need deliberate memory management. Pax documents deterministic current-world snapshots, canonical historical logs, exact recent exchanges and separate scene memory. Its default world memory compresses history rather than the world snapshot, using character thresholds. Intervention discards unrevealed continuation so it cannot influence future turns. These details demonstrate that consistent alternate history needs durable state and carefully selected context, not just an indefinitely growing chat transcript. Source: [Default History and Agent Memory](https://www.paxhistoria.co/docs/workflows/compression).

Public presets combine an initial timeline with extensive natural-language simulation rules. For example, a medieval preset asks the AI to account for travel, resources and period knowledge. Such rules describe intended behavior; they are not evidence that every constraint is enforced deterministically in code. Source: [Better 1444 preset](https://www.paxhistoria.co/presets/undXAyQbz7OwIXfIZLXL?versionID=136).

The observed player-facing loop is: select a scenario and polity, issue written actions and diplomacy, advance time, inspect narrated events and map changes, then act again. A useful independent implementation must retain both the creative text interface and the shared, inspectable world state. The exact prompts and production internals were not verified; some source links from the official creator docs returned 404 during this research.

## Existing open-source candidates

| Project | What was verified | Fit for this request |
| --- | --- | --- |
| [Open-Historia/open-historia](https://github.com/Open-Historia/open-historia) | Self-hosted map, AI events, diplomacy, advisor and scenario tools; local AI support; AGPL-3.0-or-later | Closest solo alternative, but explicitly has no multiplayer |
| [OpenHistoria/OpenHistoria](https://github.com/OpenHistoria/OpenHistoria) | Separate project with a similar name; Bun workspace, map rendering, browser storage and optional Supabase | Public README did not establish shared multiplayer campaigns with Ollama |
| [Ant3iros/Phos](https://github.com/Ant3iros/Phos) | MIT geopolitical narrative game, free actions, advisor, diplomacy and Ollama-compatible configuration | Public materials did not establish multiple human countries in one campaign |
| [iamarxs/AnyWorld](https://github.com/iamarxs/AnyWorld) | MIT multiplayer browser text adventure; host and player passwords; grouped action resolution and local AI backend options | Real multiplayer, but lacks the geopolitical map/country simulation required here |

The decisive finding is the first project's own [self-hosting guide](https://github.com/Open-Historia/open-historia/blob/main/wiki/hosting/self-hosting.md): reaching a save from two devices does not make it multiplayer. Its [wiki](https://openhistoria.com/wiki/) explicitly distinguishes remote access from lobbies and simultaneous turns. A shared file server alone would allow players to overwrite each other's campaign state.

Open Historia's [AI setup guide](https://github.com/Open-Historia/open-historia/blob/main/wiki/start/ai-setup.md) documents Ollama through its OpenAI-compatible `/v1` endpoint. Its [AI overview](https://github.com/Open-Historia/open-historia/blob/main/docs/ai-overview.md) describes a centralized AI adapter, per-task model selection and a local relay for browser access. Its [world-state documentation](https://github.com/Open-Historia/open-historia/blob/main/docs/world-state.md) describes events with machine-readable impacts applied to persisted world state.

These sources do not prove no matching project exists anywhere. They establish that none of the examined, relevant candidates was verified to satisfy all three requirements: geopolitical gameplay, multiple human countries in one shared campaign, and locally hosted Ollama use. Building an original multiplayer core was therefore the chosen route.

## Ollama integration

Ollama's native [chat API](https://docs.ollama.com/api/chat) accepts messages, generation options, optional tools and an output format; [structured outputs](https://docs.ollama.com/capabilities/structured-outputs) allow a JSON schema. Model discovery is available through [GET /api/tags](https://docs.ollama.com/api/tags). A schema constrains shape, but application checks must still reject illegal country IDs, excessive stat changes, duplicate policies and unaffordable orders.

Historia Local uses one server-side adapter to this native API. This avoids making every player's browser connect to the host's AI port or configure Ollama CORS. A shared turn is validated and committed once by the server. User-supplied endpoints are configured only by the campaign host. No proprietary Pax prompts, code, assets or presets were copied.

## What was implemented, and what was deliberately simplified

The accepted multiplayer format is simultaneous orders with host-controlled advancement. The implementation has persistent rooms, bearer player sessions, one country per player, private orders, readiness gates, public/direct chat, AI diplomacy for NPCs, a private advisor, bounded policy effects, shared chronology and deterministic resource/combat rules. All game clients read the same server-owned world; they cannot directly upload replacements for it.

The bundled Europe 1936 scenario is an original low-resolution geographic sketch with one territory per country and abstract statistics. Territory transfers happen through combat. AI narratives and policies do not have unrestricted world-mutation authority. This is a practical first playable version; worldwide province data, nation creation, formal treaties, richer military logistics, scenario import/editor tooling, intervention, multiplayer scheduling, sophisticated historical memory and complete Pax UI parity remain future work.

Verification used automated API/engine tests and two independent browser player sessions. The Ollama interface was exercised with controlled responses. No actual local model was available, so neither live generation performance nor a specific model recommendation was validated on the user's hardware.
