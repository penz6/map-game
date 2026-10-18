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
- Supply a bounded intent summary for **every** policy to one final world-resolution pass. These summaries are explicitly lossy (up to 320 UTF-8 bytes per intent at 32K, reduced uniformly to 160 or 80 when a larger world needs the space; 80 in smaller windows); that pass does not re-adjudicate policies. It chooses the final map changes/NPC diplomatic responses or Strategy NPC orders.
- Compact the final Strategy graph losslessly into undirected row-index pairs, and omit display-only army names while retaining unit IDs/owners/positions/strength. Output actions still require stable IDs. Full original state stays in the game.
- Validate the entire combined result and future world's capacity, then commit once. No intermediate policy result changes the shared map, treasury, date or order list. Any failed phase leaves the turn unchanged.

The one world director remains responsible for the final map; batching does not create independent AI nation agents. Large turns take more sequential model calls. Each phase gets at most one correction for invalid JSON/proposals. Network/timeouts/output-limit errors are not automatically replayed. Model timeouts apply per call; a large job can take substantially longer than one timeout interval overall.

## Reproducible 32K stress measurements

Run node scripts/context-report.mjs. The current fixture is the full 47-government, 122-region world. It uses controlled valid responses, not a live model. Every number below includes input byte-bound, output reserve and framing headroom. Calls can vary with real responses, requested extra actions, custom prompts and history.

| Global map workload | Wild Map calls / peak bound | Strategy calls / peak bound |
| --- | ---: | ---: |
| 2 players, no policies | 1 / 22,953 | 1 / 24,189 |
| 2 players, one short policy each | 1 / 23,468 | 1 / 24,704 |
| 12 players, one 300-character policy each | 1 / 28,896 | 1 / 30,142 |
| 12 players, three 300-character policies each | 7 / 27,008 | 7 / 24,328 |
| 12 players, three maximum-length ASCII policies each | 7 / 30,033 | 7 / 28,185 |
| 12 players, three maximum-length multibyte policies each | 19 / 29,481 | 19 / 27,641 |

All remain below 32,768 without dropping a player's policy. The multibyte fixture uses 2,000 three-byte characters per policy. These are app budget measurements, not actual Qwen token counts, real-model agreement quality, throughput or exact VRAM totals.

## Admission and failures

Scenario imports, prompt/premise configuration and AI-proposed successor worlds are checked against the minimum world-resolution budget. An impossible setup is rejected before saving it; an oversized successor proposal can receive the bounded correction attempt. Extremely large custom maps, many long names, oversized prompts or large output reserves can still be incompatible with 32K. The error asks for a smaller scenario/prompt/reserve rather than raising context or silently deleting ownership data.

AI jobs return HTTP 202 promptly and are polled through account-private endpoints. Default generation concurrency stays one; at most 32 wait, with four outstanding per account and a ten-minute queue deadline. Staged calls share that job's slot through final validation/commit. Completed jobs are cached up to one hour subject to bounded eviction; restart/expiry requires refreshing the campaign before retrying. Idempotency-Key replay is supported while cached. There is no arbitrary executable tool dispatch: model JSON is data validated by the engine.

## Diplomacy

The final director receives recent completed NPC negotiations from current human seats: up to 48 messages across the current/two preceding rounds, with 600-character excerpts, compacted further as needed. Human DMs, advisor exchanges, former-seat conversations and account identifiers are excluded. Private narration is instructed not to quote negotiations; public consequences may reveal an arrangement. The server/Ollama operator is trusted. Finish conversations before advancing; unfinished replies are rejected once resolution has begun.

## Map planning in 3.6

Both single-call and staged world resolution use the same fixed director contract. Wild Map permits 1–8 operations with a required net ownership change. Temporary references let a newly created state receive land from other countries and a regime in the same settlement. All operations validate sequential ownership and commit atomically; human identity/last-province protections still apply. See MAP-DIRECTOR.md.

A 32K window increases KV-cache memory compared with 20K. Keep a single generation and the existing Q4 7B starting model; optional q8_0 KV cache depends on your working AMD backend. Full GPU residency and speed at 32K have not been measured on the RX 6750 XT. Smaller AI_CONTEXT_LENGTH values remain available if required, with more staging or scenario-capacity rejection.


## Failure diagnostics

Expected AI failures are now logged too, including validation errors such as unknown policy references. Each failed AI job emits an `ai_failure` JSON record to stderr and returns the same log reference to its caller. A failed turn retains its orders and shows the reference in its persistent error banner; failed diplomacy and advisor requests show an inline error. Use `docker compose logs -f app` and match the reference. Logs include the model, operation, world-resolution phase, correction attempt, upstream HTTP status or network error code and failure reason. They omit request bodies, policies, private messages and raw model output. See DOCKER.md for details.

## Slower 14B option: RX 6750 XT 12 GB, 32 GB RAM, 10 GB host allowance

Try `qwen2.5:14b` before attempting 32B. Ollama lists the default 14B quantization as Q4_K_M, about 9.0 GB of weights; context cache and backend allocations need additional memory. With a 32K context the model may spill onto CPU/system RAM and become substantially slower. GPU acceleration and latency have not been measured on this machine. A larger model is not a prompt-injection fix.

1. On the machine/container running **Ollama**, run `ollama pull qwen2.5:14b`.
2. Merge [.env.14b.example](.env.14b.example) into the game’s existing `.env`, retaining `OLLAMA_URL`, origin and other deployment settings. Recreate the game container with `docker compose up -d app`. This increases the per-generation timeout from 180 to 600 seconds and retains one concurrent generation, the full 32K context, and asynchronous job polling.
3. Existing campaigns save their model separately. Open the campaign Settings, load available models, select `qwen2.5:14b`, and save. Changing the environment only changes the default for new campaigns.
4. On the separate Ollama service keep `OLLAMA_NUM_PARALLEL=1` and `OLLAMA_MAX_LOADED_MODELS=1`. Where the installed AMD backend supports it, enable `OLLAMA_FLASH_ATTENTION=1` and `OLLAMA_KV_CACHE_TYPE=q8_0` to reduce KV memory. Restart Ollama after changing its environment. Do not replace your working AMD backend.
5. To enforce the requested 10 GB system-memory allowance on a Linux systemd Ollama host, add `[Service]` settings `MemoryMax=10G` and `MemorySwapMax=0` using `sudo systemctl edit ollama.service`, then `sudo systemctl daemon-reload` and `sudo systemctl restart ollama`. If Ollama itself runs in Docker, apply `mem_limit: 10g` and `memswap_limit: 10g` to **that Ollama service**, not the game service. These constrain host RAM/swap, not VRAM. They can terminate a generation if its actual allocations exceed the cap; they do not guarantee 14B at 32K will fit. Check service/cgroup memory under load. Leave the game’s existing 512 MB container cap alone.
6. During a real turn inspect `ollama ps` for the CPU/GPU split, host memory and `docker compose logs -f app`. If the backend exceeds the allowance or repeatedly times out, return the campaign to `qwen2.5:7b`. Do not increase the cap beyond your allowance. Avoid 32B in this budget.

Sources: [Qwen2.5 14B model and quantization](https://ollama.com/library/qwen2.5:14b), [Ollama memory, parallelism and KV-cache configuration](https://docs.ollama.com/faq). An environment example is provided; no model was pulled or switched on your live server.

## Prompt injection and model authority

Player orders and diplomacy remain untrusted data in user-role JSON, including staged summaries. Country names are never substituted into system prompts; the addressed diplomatic identity is supplied as data. Every generation path gets an explicit boundary rejecting instruction overrides, guaranteed-win demands and coercive threats. Treat these as mitigation, not proof that a language model will always comply.

The server validates exact policy identities, owned units, costs, map IDs, consent and permissions. Wild director changes additionally limit each human nation to `max(2, ceil(starting province count / 4))` newly acquired provinces per turn. Count newly acquired land, not net growth; giving away old land cannot increase that allowance. The same check runs before resolution and again on the applied patch. An excessive gift triggers the bounded repair attempt and then an explicit logged failure with no committed changes. This intentionally limits large territorial gifts even if requested in ordinary language. Strategy mode continues to require validated orders/combat for land changes. Model dialogue cannot execute actions; AI victory assessments remain private recommendations and require administrator confirmation to end a campaign. Lower configured contexts can use shorter 40/24-byte intent summaries so that adding the trust contract does not break the existing 20K fallback; full submitted policies are still read before summarizing. Creative Wild mode still lets the model influence plausible world events and bounded settlements; it is not a competitive anti-cheat guarantee.
