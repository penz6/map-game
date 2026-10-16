# Pax Historia comparison and implementation target

Reviewed October 15, 2026. This is a functional comparison based on public first-party documentation and public preset pages, not access to Pax's production code or a claim of complete parity. Direct website requests from the shell were blocked; the web research connector successfully retrieved the official documentation. Some linked source contracts returned errors, so their private implementation details remain unverified.

## What the public sources establish

Pax separates workflow decisions from a validating, persistent runtime and from provider-owned AI services. Its public contracts describe normalized model-tool results; a model request does not by itself become a gameplay side effect. Our independent implementation follows that separation with schema-driven action data and deterministic application checks, using Ollama rather than Pax's provider layer. Source: [creator architecture](https://www.paxhistoria.co/docs), [AI slots and tools](https://www.paxhistoria.co/docs/workflows/ai-calls).

Current official workflow documentation also describes advisor streaming, artifact/report presentation, user cancellation and multiplayer workflow restrictions. We have not copied these workflows or their code. Source: [workflow documentation](https://www.paxhistoria.co/docs/workflows).

Pax's memory design distinguishes exact current-world snapshots, canonical public history and private scene memory; documented intervention removes the unrevealed continuation. Our snapshots remain authoritative, extractive compaction stays audience-scoped, and timeline rewind deletes later chronology/dialogue rather than feeding a discarded future into new requests. Rewind is not a reproduction of Pax's per-event intervention interface. Source: [history and agent memory](https://www.paxhistoria.co/docs/workflows/compression).

Public user-created presets show mutable political entities/tags and persistent map features, including military formations, and maps with thousands of regions. These are evidence of supported scenario expressiveness, not proof that every rule written by a preset author is a universal deterministic engine mechanic. In particular, a preset's promises about finance, logistics or civil wars should not be mistaken for an audited platform implementation. Examples: [modern scenario](https://www.paxhistoria.co/presets/KLQ7aRIopJivCXa0AjVB?versionID=2), [large region preset](https://www.paxhistoria.co/presets/6t3KmqE3l3eaCH2zaAHA?versionID=22), [military-feature preset](https://www.paxhistoria.co/presets/NOYJyfWeLnWTzead5jE2). Their maps, rules and assets were not copied.

Failure handling in the official contracts distinguishes validated tool output from provisional output and makes retries explicit. Our local adapter validates each committed result, rejects incomplete/invalid output and preserves state on failure. We allow one bounded correction for invalid proposals, plus manual retries and a bounded queue/background-job API, not Pax's provider infrastructure. Source: [failures and retries](https://www.paxhistoria.co/docs/workflows/ai-failures-retries).

The current priority is visible, playful map changes rather than reproducing the advisor. Version 3.1 defaults to a single Wild Map director with real transfers, secessions, collapses, unions and restoration of existing identities. Strategy remains optional. This changes the implementation target below; it does not claim full parity.

## Current implementation comparison

The maintained version-3.4 comparison is in [FEATURES.md](FEATURES.md). It distinguishes the default Wild Map director from optional Strategy orders, current diplomatic agreement support, simplified mechanics and missing Pax-style workflows. It also identifies unverified hardware/model performance.

## Scope and remaining work

Version 3 replaces the initial one-territory prototype with one coherent ruleset. No legacy gameplay branch or save-conversion command is maintained. Use a fresh data directory for this pre-deployment build.

This release is a substantial implementation step, **not complete Pax Historia feature parity**. The largest remaining gaps are global geographic data, visual scenario tooling, generic map objects/tags, branching scenes/per-event intervention, group diplomacy, streamed advisor artifacts and extensible workflows. Those need independent implementation and testing; they are not capabilities unlocked just by changing the system prompt. A 7B model also cannot be assumed to match the reasoning quality or context capacity of larger hosted models.
