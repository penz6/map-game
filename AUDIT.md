# Audit closure — Historia Local 3.4

Reviewed October 16, 2026. The earlier review identified eight concrete findings. All eight have been addressed in the implementation; that does not imply absence of other defects or constitute independent penetration testing. Version 3.4 changes AI requests to background jobs and adds validated diplomatic agreement responses to Wild Map.

| Original finding | Resolution | Evidence |
| --- | --- | --- |
| P1: delayed join overwrites completed turn | Parse the request body before loading/authorizing mutable state; reject saves against a stale predecessor | Delayed-body join preserves round 2/history and joins the current world, including the persisted file |
| P1: all proxy clients share long rate limits | Account/username/invitation limits plus short global POST burst protection; forwarding headers ignored | 3.3 regressions isolate accounts, allow 31 unrelated attempts without locking another user, and register 11 independent invitations behind one proxy |
| P1: long AI requests exceed proxy timeout | Immediate HTTP 202 jobs with short private polling requests; queue and generation happen outside the initiating connection | Submit returns before a deliberately blocked model finishes; idempotent replay returns the same job; no second generation |
| P2: revoked account finishes a partial-body mutation | Authenticate after body parsing; recheck sessions after asynchronous password hashing and before/after queued work | Disable/revoke/remove-seat regressions prevent commits after body completion or during hashing |
| P2: Wild Map NPC treaty impossible | Optional agreements support validated, affordable NPC treaty/merge/break responses, including reciprocal consent | NPC alliance and human/NPC unification execute; human impersonation and military actions through agreements are rejected |
| P2: Strategy patches bypass orders/combat/treaties | Strategy schema permits no map changes and validation rejects patches | Attempt to transfer human land while nonaggression is active is rejected before commit |
| P2: queued follow-up lacks preceding reply | Queue the whole AI operation through validation/commit, then construct fresh context when admitted | Follow-up model payload contains the preceding offer and committed reply; a newly human-controlled recipient is rejected before generation |
| P2: rewind leaves guest selecting removed nation | Reconcile selected nation/province and world revision in browser state; guard against late responses replacing a different campaign view | Two-context Chromium selects a successor, rewinds before its creation and verifies correct map/details/history without false connection loss |

The complete resolution is also simulated before accepting a model proposal. Conflicts between a valid-looking patch and structured orders, such as duplicate resulting nation names, enter the same bounded correction path rather than failing only during commit.

## Background-job boundaries

AI advance/NPC chat/advisor requests return 202 with an opaque job ID. GET /api/jobs/:id is authenticated and account/seat scoped. Pending jobs are limited to four per account and active-generation plus 32 waiting slots globally. Completed job cache is bounded to 512 entries, retained up to one hour subject to eviction. Cached results hold a room reference or bounded answer, rather than complete duplicated campaign snapshots.

Idempotency-Key replay is supported while the job remains cached; a different body with the same key is rejected. Job state is in memory: restart, expiry or eviction requires refreshing the authoritative campaign before retrying. Interrupted turn resolution reopens planning after restart with saved orders. The browser currently has no job cancellation/recovery dashboard. There is no promise of exactly-once execution across a process restart.

## Validation

- 105 automated tests pass together, including the new regressions and job privacy/admission/expiry tests.
- The previous PR head's GitHub Actions run 38909272680 passed tests and Docker build/smoke, closing the earlier 3.3 infrastructure-blocked smoke check. That result is not a substitute for checking the new head.
- Current browser/container evidence, including the repair for late turn results clearing next-round drafts, is recorded in VALIDATION.md.
- Model responses are controlled fixtures. No physical RX 6750 XT, real-model output-quality benchmark, live Pangolin/Traefik route, independent penetration test or arm64 execution was performed.

## Remaining product limitations

The feature matrix is in FEATURES.md. The game is not full Pax Historia parity. Global maps, visual scenario editing, generic map objects, per-event intervention, branching scenes, group diplomacy and custom workflow execution remain unimplemented. Detailed naval/air/logistics/economic simulation is absent.

Context is capped at 32,768 total in 3.6. Large groups and long policies use sequential bounded passes; all full policies are read in a batch or an explicit source-compression pass and remain saved. The final world pass sees lossy intent summaries. Extremely large/custom scenarios and prompts are rejected if essential state still cannot fit. Staged turns take more model calls and still have no real-model quality/latency benchmark. Compaction may drop optional old negotiations; private model narration is instructed not to quote them, but is not a cryptographic secrecy boundary. Public consequences can reveal arrangements. The server/Ollama operator is trusted.

Pangolin/Traefik remains responsible for external HTTPS/network routing by the user's deployment choice. App Host/Origin checks, Secure cookies and authentication remain enforced without a proxy-IP allowlist. Username throttling can temporarily block a targeted username; it no longer creates a 15-minute lockout shared by every proxy user.


Version 3.5 adds the strict 20K ceiling, scoped policy snapshots and bounded staged planning. Ownership/identity and applicable resource/action checks remain authoritative, combined results are validated before one commit, and setup/future-world capacity is checked before saving. No context increase is used as a fallback.


## Version 3.6 update

The earlier 3.5 measurements describe the prior 20K release. Current default and maximum total context are 32,768, with output/schema/framing reserves and compaction retained. Wild Map supports eight sequential operations and transaction-local new-state refs; invalid refs, ownership, human protections and final capacity reject the entire proposal. Exact adjacency is supplied as reference data. No new tool/network/account authority is granted. See AI.md for current measurements and memory limitations.
