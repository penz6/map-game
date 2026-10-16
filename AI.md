# RX 6750 XT profile and context compaction

Version 3 raises the earlier 12K context to 20K for its larger world and schema. This version supplies a conservative starting profile for a 12 GB Radeon RX 6750 XT using Ollama's Q4 `qwen2.5:7b`. It was not benchmarked on this GPU and does not reserve an exact amount of VRAM. Your existing Ollama endpoint stays in use; the game container needs no GPU devices. The Docker image is our original Node application built on the official Node.js base, not another game's image.

## Game configuration

Set these in your existing Compose `.env` before recreating the app. Old explicit values remain in effect until changed; do not replace your whole `.env` or regenerate the MFA secret.

```dotenv
OLLAMA_MODEL=qwen2.5:7b
AI_MAX_CONCURRENCY=1
AI_CONTEXT_LENGTH=20480
AI_BATCH_SIZE=128
AI_TURN_OUTPUT_TOKENS=3072
AI_CHAT_OUTPUT_TOKENS=768
AI_KEEP_ALIVE_SECONDS=300
AI_THINK=default
```

Then run `docker compose up -d --build`. Existing campaigns keep their model selection; change that in Host settings if necessary. All campaigns use the server's context/output/batch settings. Host settings shows the active context size and compaction status.

A 20K window accommodates the expanded authoritative province/army state, one generation avoids parallel cache duplication, and a batch size of 128 reduces prompt-processing memory at a possible throughput cost. Output reserves limit long generations. The game asks Ollama to keep the model loaded for five minutes after use; this is a residency request, not a VRAM cap or guaranteed immediate release. Reducing batch/context can slow or limit workloads. Qwen2.5 7B's roughly 4.7 GB download is not its total runtime footprint.

| Variable | Default | Allowed |
| --- | --- | --- |
| `AI_MAX_CONCURRENCY` | 1 | 1–2; use 1 on this GPU |
| `AI_CONTEXT_LENGTH` | 20480 | 4096–32768; smaller windows may not fit the essential game data |
| `AI_BATCH_SIZE` | 128 | 32–512 |
| `AI_TURN_OUTPUT_TOKENS` | 3072 | 512–8192 |
| `AI_CHAT_OUTPUT_TOKENS` | 768 | 128–2048 |
| `AI_KEEP_ALIVE_SECONDS` | 300 | 0–3600 |

Output reserves must leave more than 1,024 tokens for input at startup. Every individual request must also pass the stricter actual input-budget check below. More players, long policies or custom system prompts can require a larger window or shorter text. A lower output limit can cause a turn to fail validation; it does not silently apply partial results.

## Settings for your separate Ollama service

The game cannot change your host Ollama process's global memory configuration. `.env.ollama.example` documents these settings for the machine running Ollama:

```dotenv
OLLAMA_NUM_PARALLEL=1
OLLAMA_MAX_LOADED_MODELS=1
OLLAMA_CONTEXT_LENGTH=20480
```

Apply them to Ollama's service/user environment, then restart Ollama using your existing operating-system/service setup. Merely putting these variables in the game container does not configure a separate host Ollama. For a manually launched Linux/macOS server, after stopping the existing Ollama process, the equivalent command is:

```sh
OLLAMA_NUM_PARALLEL=1 OLLAMA_MAX_LOADED_MODELS=1 OLLAMA_CONTEXT_LENGTH=20480 ollama serve
```

Keep using your already-working GPU backend. Check `ollama ps`, Ollama logs and your GPU memory monitor during a turn and a diplomatic conversation. Display use, other applications, model variants and backend buffers affect available memory. Backend acceleration for the RX 6750 XT was not tested here.

Flash attention plus `OLLAMA_KV_CACHE_TYPE=q8_0` can reduce cache memory on compatible Ollama backends. They are optional commented settings in `.env.ollama.example`; support varies, particularly across AMD backends. Enable only after confirming your installed backend supports them. The default profile does not force them or alter model weight quantization.

Sources: [Ollama GPU compatibility](https://docs.ollama.com/gpu), [context length](https://docs.ollama.com/context-length), [FAQ and KV cache settings](https://docs.ollama.com/faq), [Qwen2.5 7B](https://ollama.com/library/qwen2.5:7b).

## What compaction does

Compaction runs locally before each AI request. It uses deterministic extraction, not an extra AI summary call. It adds no model generations or chance of a summarizer inventing facts.

1. Send exact live state as tables. Wild Map uses a smaller map-focused snapshot: all nation IDs/names/colors/capitals, every province ID/name/owner, human seats, date and current orders. It omits army/economy planning and adjacency. Strategy retains gameplay stats, units and adjacency. Neither sends polygon/label coordinates.
2. Keep the system prompt, world premise, current message/question and every submitted current order unchanged. Include the JSON schema in budgeting for turn requests.
3. Start with up to three recent public turns. Build hierarchical highlights from the older archive, selecting short excerpts and merging older ranges into bounded blocks. Favor policy and conflict-related developments. These are partial highlights, not complete diplomatic memory.
4. For NPC diplomacy, work only with the account/recipient-filtered conversation. Start with the latest six messages verbatim and selected older excerpts. Never read other private messages into the request. Private excerpts are not added to public campaign memory.
5. Reserve the output budget plus 512 tokens of template/framing headroom. Bound the text conservatively using UTF-8 byte length, rather than assuming a fixed English characters-per-token ratio. This is a conservative bound for byte-fallback/BPE text such as Qwen's, not an exact tokenizer or a guarantee for arbitrary custom model templates.
6. If necessary, shorten recent historical bodies, merge/drop older highlight blocks and compact/drop prior conversation. The current world, submitted orders and current message are never shortened. If those essential parts still do not fit, reject before contacting Ollama with an actionable error.

Compaction is lossy. Earlier nuance, promises or incidental events may be absent from a request, especially under tight budgets. The prompt explicitly labels highlights as incomplete and the current world as authoritative. It does not create binding treaty mechanics. Full public history, saved orders and private messages are left untouched by compaction; existing chat retention still caps a campaign at its latest 1,000 messages. There is no vector database or retrieval search, and highlights are recomputed from saved data for each request rather than replacing the archive with an AI-generated summary.

A successful request can use fewer actual tokens than the conservative budget allows. This intentionally favors predictable fitting over maximum context utilization. Models with unusual templates/tokenizers may need more headroom or a different context setting.

## Failures and executable tools

The model has no filesystem, shell, network tools or permission to change accounts. Turn requests use Ollama's structured JSON response format, not its function/tool-calling protocol. The engine validates proposed actions and independently resolves them. Diplomatic/advisor replies are text only. A model-provided `tool_calls` field is never dispatched to executable code; absent text fails the usual response check.

If Ollama reports `done_reason: length`, the server rejects the answer even if its partial text appears valid. Invalid schema, excessive effects, timeouts and oversized essential context likewise leave world/resources/orders unchanged and permit host retry. A malformed JSON or invalid proposal gets at most one correction generation, with the validation error. Network errors, timeouts and output-limit failures are not automatically retried. Two rejected proposals preserve the turn; there is no scripted fallback. Generation requests use a bounded in-memory queue: up to 32 waiting, up to four outstanding per account, and a ten-minute waiting deadline. Requests start in arrival order among eligible accounts; one account cannot run parallel generations even when server concurrency is two. The default remains one active generation for the RX 6750 XT. Model execution has a separate timeout starting at dispatch. Overload, expired waits, stale worlds or revoked authorization still return actionable errors. A failed generation releases the slot. Restart clears waiting requests; it does not automatically replay chats or turns. Wild Map normally needs just one director request per turn; no per-nation planning or advisor request is required.

## Diplomacy and turn context

The turn director now receives recent completed NPC negotiations from current human seats: at most 48 messages across the current and two preceding rounds, with 600-character excerpts. Human DMs, advisor exchanges, former-seat conversations and account identifiers are excluded. Optional diplomacy excerpts shrink under context pressure without changing current orders or the ownership map. Chat/advisor requests retain their existing participant filters.

Negotiations may influence consequences but do not force compliance or execute immediate changes. Transcript text is not added to public chat/history. The director is instructed to describe public consequences without quoting private exchanges; generated prose is not a cryptographic secrecy boundary, and public consequences may reveal an arrangement. The Ollama operator sees supplied context. Finish ongoing conversations before advancing: an unfinished reply is rejected if resolution has begun.
