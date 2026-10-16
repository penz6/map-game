# 32K model context, compaction and RX 6750 XT profile

Version 3.6 enforces a **32,768-token total context ceiling**. The configured window includes input, response reserve and framing headroom. The default is now 32K (32,768), as requested. Values above 32768 are rejected at startup; update existing .env files to AI_CONTEXT_LENGTH=32768 to use the new window.

This is an application request/budget limit, not a measured VRAM allocation. The separate Ollama process, other clients and GPU backend retain their own settings. No physical RX 6750 XT or real-model quality/latency benchmark was available.

## Starting configuration

For the 12 GB RX 6750 XT, keep qwen2.5:7b Q4 as the starting model, one generation and batch 128:

```dotenv
OLLAMA_MODEL=qwen2.5:7b
AI_MAX_CONCURRENCY=1
AI_CONTEXT_LENGTH=32768
AI_BATCH_SIZE=128
AI_TURN_OUTPUT_TOKENS=3072
AI_CHAT_OUTPUT_TOKENS=768
AI_KEEP_ALIVE_SECONDS=300
AI_THINK=default
```

AI_CONTEXT_LENGTH accepts 4096–32768, but lower values may not fit essential state. Output reserves must leave more than 1,024 tokens of input at startup; every request then passes its stricter actual budget check. A smaller output reserve can cause incomplete answers; done_reason=length is always rejected.

Configure your **separate Ollama service** as well, then restart that service:

```dotenv
OLLAMA_NUM_PARALLEL=1
OLLAMA_MAX_LOADED_MODELS=1
OLLAMA_CONTEXT_LENGTH=32768
```

Putting those variables only in the game container does not configure host Ollama. Every game request explicitly sends num_ctx no higher than 32768, num_batch 128 by default, and its output reserve. Keep your already-working AMD backend. Check ollama ps, service logs and a GPU monitor during real play; model weights, KV cache, display use and backend buffers all consume memory. The game's container needs no GPU device.

Flash attention and q8_0 KV cache remain optional backend-specific settings in .env.ollama.example; they are not forced by the game. Sources: [GPU support](https://docs.ollama.com/gpu), [context](https://docs.ollama.com/context-length), [FAQ/KV cache](https://docs.ollama.com/faq), [Qwen2.5 7B](https://ollama.com/library/qwen2.5:7b).

## Compaction and strict request budgeting

1. Encode world data in tables. Keep stable nation/province IDs, exact ownership and required resources/relationships. Omit polygon coordinates and visual labels. Wild Map includes a lossless undirected adjacency graph so the director can reason about borders, alongside exact ownership.
2. Compact optional public history into selected excerpts, not a fabricated canonical memory. Private chat/advisor compaction uses only the already participant-filtered exchange.
3. Shorten/drop optional older history and negotiation excerpts as needed. Preserve the current request and the original orders on disk. Public/private histories are not replaced by summaries.
4. Reserve 3,072 output tokens for turns (768 for chat by default) and 512 for template/framing headroom. Include schema size. Conservatively bound text using UTF-8 bytes, not an English characters-per-token assumption. This is not an exact tokenizer for every model/template.
5. Small turns use the existing one-call full resolution. If that cannot fit, automatically use staged planning below. No model request bypasses the 32K check.

Compaction is lossy. Incidental events, old promises or nuance may be omitted. Current state remains authoritative, but model summaries and optional memory are not a guarantee of lifelong diplomatic recall. Original campaign data remains saved, subject to the existing 1,000-message chat/advisor retention caps.

## Oversized turns use sequential bounded passes

- Read the full submitted policy texts in batches of up to six, sized by the actual budget. Each batch sees all ownership/identity information and the issuing governments' exact resources, units, routes and other orders. It cannot issue commands for another human government.
- Policies retain their original playerId/orderIndex. Results are validated together with earlier policy actions, including budget and repeated-unit constraints.
- If an individual text plus necessary state still cannot fit (for example, heavily escaped text), first send its complete text in a small intent-compression request. The subsequent policy pass uses the explicitly labeled summary. The original is never silently cut or replaced in the save.
- Supply a bounded intent summary for **every** policy to one final world-resolution pass. These summaries are explicitly lossy (up to 320 UTF-8 bytes per intent at 32K; 80 in smaller windows); that pass does not re-adjudicate policies. It chooses the final map changes/NPC diplomatic responses or Strategy NPC orders.
- Compact the final Strategy graph losslessly into undirected row-index pairs, and omit display-only army names while retaining unit IDs/owners/positions/strength. Output actions still require stable IDs. Full original state stays in the game.
- Validate the entire combined result and future world's capacity, then commit once. No intermediate policy result changes the shared map, treasury, date or order list. Any failed phase leaves the turn unchanged.

The one world director remains responsible for the final map; batching does not create independent AI nation agents. Large turns take more sequential model calls. Each phase gets at most one correction for invalid JSON/proposals. Network/timeouts/output-limit errors are not automatically replayed. Model timeouts apply per call; a large job can take substantially longer than one timeout interval overall.

## Reproducible 32K stress measurements

Run node scripts/context-report.mjs. It uses controlled valid responses, not a live model. Every number below includes input byte-bound, output reserve and framing headroom. Calls can vary with real responses, requested extra actions, custom prompts and history.

| Starting map workload | Wild Map calls / peak bound | Strategy calls / peak bound |
| --- | ---: | ---: |
| 2 players, no policies | 1 / 18,576 | 1 / 18,351 |
| 2 players, one short policy each | 1 / 18,830 | 1 / 18,605 |
| 12 players, one 300-character policy each | 1 / 22,992 | 1 / 22,777 |
| 12 players, three 300-character policies each | 1 / 30,864 | 1 / 30,649 |
| 12 players, three maximum-length ASCII policies each | 7 / 26,530 | 7 / 26,560 |
| 12 players, three maximum-length multibyte policies each | 13 / 32,170 | 13 / 32,099 |

All remain below 32,768 without dropping a player's policy. The multibyte fixture uses 2,000 three-byte characters per policy. These are app budget measurements, not actual Qwen token counts, real-model agreement quality, throughput or exact VRAM totals.

## Admission and failures

Scenario imports, prompt/premise configuration and AI-proposed successor worlds are checked against the minimum world-resolution budget. An impossible setup is rejected before saving it; an oversized successor proposal can receive the bounded correction attempt. Extremely large custom maps, many long names, oversized prompts or large output reserves can still be incompatible with 32K. The error asks for a smaller scenario/prompt/reserve rather than raising context or silently deleting ownership data.

AI jobs return HTTP 202 promptly and are polled through account-private endpoints. Default generation concurrency stays one; at most 32 wait, with four outstanding per account and a ten-minute queue deadline. Staged calls share that job's slot through final validation/commit. Completed jobs are cached up to one hour subject to bounded eviction; restart/expiry requires refreshing the campaign before retrying. Idempotency-Key replay is supported while cached. There is no arbitrary executable tool dispatch: model JSON is data validated by the engine.

## Diplomacy

The final director receives recent completed NPC negotiations from current human seats: up to 48 messages across the current/two preceding rounds, with 600-character excerpts, compacted further as needed. Human DMs, advisor exchanges, former-seat conversations and account identifiers are excluded. Private narration is instructed not to quote negotiations; public consequences may reveal an arrangement. The server/Ollama operator is trusted. Finish conversations before advancing; unfinished replies are rejected once resolution has begun.

## Map planning in 3.6

Both single-call and staged world resolution use the same fixed director contract. Wild Map permits 1–8 operations with a required net ownership change. Temporary references let a newly created state receive land from other countries and a regime in the same settlement. All operations validate sequential ownership and commit atomically; human identity/last-province protections still apply. See MAP-DIRECTOR.md.

A 32K window increases KV-cache memory compared with 20K. Keep a single generation and the existing Q4 7B starting model; optional q8_0 KV cache depends on your working AMD backend. Full GPU residency and speed at 32K have not been measured on the RX 6750 XT. Smaller AI_CONTEXT_LENGTH values remain available if required, with more staging or scenario-capacity rejection.
