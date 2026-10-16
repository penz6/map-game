# Pax Historia comparison and implementation target

Reviewed October 15, 2026. This is a functional comparison based on public first-party documentation and public preset pages, not access to Pax's production code or a claim of complete parity. Direct website requests from the shell were blocked; the web research connector successfully retrieved the official documentation. Some linked source contracts returned errors, so their private implementation details remain unverified.

## What the public sources establish

Pax separates workflow decisions from a validating, persistent runtime and from provider-owned AI services. Its public contracts describe normalized model-tool results; a model request does not by itself become a gameplay side effect. Our independent implementation follows that separation with schema-driven action data and deterministic application checks, using Ollama rather than Pax's provider layer. Source: [creator architecture](https://www.paxhistoria.co/docs), [AI slots and tools](https://www.paxhistoria.co/docs/workflows/ai-calls).

Current official workflow documentation also describes advisor streaming, artifact/report presentation, user cancellation and multiplayer workflow restrictions. We have not copied these workflows or their code. Source: [workflow documentation](https://www.paxhistoria.co/docs/workflows).

Pax's memory design distinguishes exact current-world snapshots, canonical public history and private scene memory; documented intervention removes the unrevealed continuation. Our snapshots remain authoritative, extractive compaction stays audience-scoped, and timeline rewind deletes later chronology/dialogue rather than feeding a discarded future into new requests. Rewind is not a reproduction of Pax's per-event intervention interface. Source: [history and agent memory](https://www.paxhistoria.co/docs/workflows/compression).

Public user-created presets show mutable political entities/tags and persistent map features, including military formations, and maps with thousands of regions. These are evidence of supported scenario expressiveness, not proof that every rule written by a preset author is a universal deterministic engine mechanic. In particular, a preset's promises about finance, logistics or civil wars should not be mistaken for an audited platform implementation. Examples: [modern scenario](https://www.paxhistoria.co/presets/KLQ7aRIopJivCXa0AjVB?versionID=2), [large region preset](https://www.paxhistoria.co/presets/6t3KmqE3l3eaCH2zaAHA?versionID=22), [military-feature preset](https://www.paxhistoria.co/presets/NOYJyfWeLnWTzead5jE2). Their maps, rules and assets were not copied.

Failure handling in the official contracts distinguishes validated tool output from provisional output and makes retries explicit. Our local adapter validates each committed result, rejects incomplete/invalid output and preserves state on failure. We allow one bounded correction for invalid proposals, plus manual retries and a global busy limit, not Pax's provider infrastructure. Source: [failures and retries](https://www.paxhistoria.co/docs/workflows/ai-failures-retries).

The current priority is visible, playful map changes rather than reproducing the advisor. Version 3.1 defaults to a single Wild Map director with real transfers, secessions, collapses, unions and restoration of existing identities. Strategy remains optional. This changes the implementation target below; it does not claim full parity.

## Current implementation comparison

| Capability | Historia Local 3 status | Actual boundary |
| --- | --- | --- |
| Multiple human countries in one shared world | Implemented | Invitation accounts, simultaneous private orders, host-controlled advancement; maximum 12 players |
| Configurable live countdown | Implemented | Server-enforced saved-order lock; host pause/resume/extend; no automatic AI advancement |
| Freeform actions | Implemented with bounds | Policies can produce bounded stat effects and up to two requested concrete actions, using the same ownership, budget and army rules |
| Persistent military formations | Implemented, simplified | Land armies with IDs, location, strength, recruitment, movement, attack and retreat; no naval/air/supply engine |
| Province ownership | Implemented | 84 original schematic provinces, single authoritative owner each; combat and political transfers |
| Nation creation and release | Implemented | Release one owned non-capital province into a new polity, with stable identity and local army allegiance |
| Renaming and governments | Implemented | Stable nation IDs survive name, leader, government and ideology changes |
| Annexation and unification | Implemented with consent rules | Annex defeated landless NPCs after controlling original capital; unification requires reciprocal orders and preserves a single human seat |
| Treaties | Implemented, simplified | Reciprocal trade, nonaggression and alliances; trade income, attack blocking and defensive garrison bonus; explicit break order |
| AI nation agency | Implemented with bounds | Up to eight NPC actions per turn, at most one per NPC, plus narrated events; this is not full simulation of every state each turn |
| Private and public diplomacy | Implemented | Human DMs, public congress, NPC replies and neighboring-country shortcuts; no multi-party private diplomatic rooms |
| Private advisor history | Implemented | Per-account persisted Q&A and suggestions; no streamed charts or report artifacts |
| Historical chronology | Implemented | Shared events, revealed past orders and full persisted archive |
| Timeline reset | Implemented, simplified | Twenty pre-turn checkpoints; host can rewind committed turns, clearing later messages and AI context |
| Per-event reveal/intervention | Not implemented | Rewind is whole-turn; no unrevealed event continuation or intervention scene |
| Scenario editing | Implemented, partial | Starting-world JSON editor/import/export with schema/ownership/adjacency validation; no visual polygon drawing or public preset marketplace |
| Large global maps | Not implemented | Built-in map is a European sketch; JSON imports capped at 512 provinces and may exceed small-model context budgets |
| Interactive catalyst/story scenes | Not implemented | No isolated branching scene engine or scene-specific outcomes UI |
| Custom workflow editor | Not implemented | Editable system prompts; no user-authored JavaScript execution or plugin sandbox |
| Formal LLM function-call streaming | Not implemented | Structured JSON actions provide mutation data; arbitrary model tool calls are not executed |
| Rich map objects and tags | Partial | Armies and political fields; no generic cities, factories, ships, aircraft, organization tags or arbitrary marker editor |
| Local AI and Docker | Implemented | Native Ollama API, constrained concurrency, extractive compaction, hardened app/proxy setup, GHCR workflow |
| Accounts and administration | Implemented | Passwords, admin MFA, invitations, sessions, role checks and audit; see SECURITY.md |
| Large-map/local-model performance | Unverified | No live model or RX 6750 XT benchmark was available |

## Scope and remaining work

Version 3 replaces the initial one-territory prototype with one coherent ruleset. No legacy gameplay branch or save-conversion command is maintained. Use a fresh data directory for this pre-deployment build.

This release is a substantial implementation step, **not complete Pax Historia feature parity**. The largest remaining gaps are global geographic data, visual scenario tooling, generic map objects/tags, branching scenes/per-event intervention, group diplomacy, streamed advisor artifacts and extensible workflows. Those need independent implementation and testing; they are not capabilities unlocked just by changing the system prompt. A 7B model also cannot be assumed to match the reasoning quality or context capacity of larger hosted models.
