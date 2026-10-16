# Security model and deployment boundaries

Version 3.7 supports a single trusted server operator with public account registration and invitation-gated campaigns. The application enforces authentication and permission checks; the operator must provide a patched operating system/Node runtime, correctly configured HTTPS ingress, secret storage, firewall rules and backup handling. It has not undergone an independent penetration test or formal OWASP ASVS assessment.

## Enforced controls

| Area | Implementation |
| --- | --- |
| Password storage | Node's scrypt, N=32768 / r=8 / p=3, a random 128-bit salt and 256-bit result; asynchronous derivation with a two-hash concurrency cap. This parameter set is one of OWASP's documented scrypt alternatives. No plaintext/password-encryption storage. |
| Password policy | 15–128 Unicode characters, 1 KiB byte cap, spaces supported, no composition rules, and a small common-password denylist. This is not a comprehensive breached-password database. |
| Administrator setup | Console only, no defaults or browser-first-admin race. All administrator accounts are console-created and use passwords; public registrations cannot set roles. |
| Sessions | 256-bit random session IDs; SHA-256 digests stored server-side; HttpOnly, SameSite=Strict cookies; Secure and __Host- prefix in HTTPS mode. No authentication credentials in localStorage or game access files. Login and reauthentication rotate sessions. |
| Expiry | Administrator: 15-minute idle, 4-hour absolute. Player: 30-minute idle, 8-hour absolute. Password changes and account disable revoke sessions. Sensitive admin operations require authentication within ten minutes. |
| Access control | Server administrator, campaign host, and member checks on every applicable route. Server-admin metadata access does not grant automatic gameplay/private-message access. New users cannot choose elevated roles. |
| Registration/joining | Open registration with member role only. Hashed, reusable seven-day campaign links; expiry or rotation invalidates them. Joining still requires a signed-in account and an available seat. |
| CSRF/browser boundaries | Every mutation requires the exact same Origin; authenticated mutations also require a per-session verification token. Cross-site Fetch Metadata is refused. No CORS allowance. Loopback HTTP rejects foreign Host names. |
| Login abuse | Persistent username/global-signup and per-account counters, a short global POST burst guard, bounded request bodies, request/header timeouts, bounded sessions and expensive-hash concurrency limits. Forwarded client IPs are ignored. |
| XSS/embedding | Escaped user/AI text, fixed static asset routes, CSP without inline JavaScript/eval, frame-ancestors 'none', X-Frame-Options DENY, nosniff, same-origin resource policy, restrictive permissions policy and no-referrer. Inline styles remain allowed for the map's dynamic colors. |
| AI/SSRF | Server-operator endpoint allowlist checked at configuration and request time; campaign hosts cannot supply arbitrary destinations. Redirects disabled, response-size cap, timeouts, one active generation per account and two globally. The operator must allowlist only trusted endpoints and domain owners. |
| Game authority | AI output never executes code/SQL/shell. It passes schemas, known-ID checks, policy-effect bounds and budget/adjacency validation. Failed turns do not spend resources. |
| Persistence | Private data directory; owner-only file permissions on Unix; parameterized SQLite queries and transactions for identity/invitations; atomic room JSON replacement; exclusive single-process lock. |
| Audit | Capped security-event history for registration, login failures/successes, password/recovery changes, admin actions and campaign operations. Events omit passwords, invitation values, raw sessions and private chat/order content. |

Source guidance: [OWASP Password Storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html), [Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html), [CSRF Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html), and [SSRF Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html). These sources informed individual controls; this is not a claim of complete compliance.

## Public HTTPS configuration

Use `PUBLIC_ORIGIN=https://your-real-domain` . The app accepts backend HTTP from any source address without proxy-IP trust or forwarded-header checks. Pangolin/Traefik provides public HTTPS and the only network route. The public Host and mutation Origin must still match `PUBLIC_ORIGIN`; cookies remain Secure/HttpOnly/SameSite. Forwarding headers grant no permissions and do not determine rate-limit keys.

App limits are account-based for authenticated requests, username-based for login and username/global-budget-based for registration. A short global POST burst guard bounds overload without the previous 15-minute shared proxy-IP login lockout. See DOCKER.md for exact values. Loopback-only HTTP remains available for local development without PUBLIC_ORIGIN.

## Trust and remaining limits

- The filesystem/console owner is trusted and can read game data, recover accounts and create administrators. Private chat is not encrypted against the server operator. Password hashes remain sensitive; keep backups private and encrypted using your backup system.
- A stolen active cookie can grant access until expiry or revocation. HttpOnly reduces script-readable theft, but a future same-origin XSS bug could still perform actions. TLS, patching and browser security remain required.
- MFA is not implemented, as requested. Password recovery is console-only; there are no emailed reset links or single sign-on. The operator must authenticate a person before performing a requested console recovery.
- Public signup has rate limits but no CAPTCHA, email verification, moderation queue or payment system. There is no scalable multi-process/distributed session store. SQLite plus room files support one server per data directory.
- The Ollama service is part of the trusted deployment. Its outputs can be inaccurate or prompt-influenced even when structurally valid. No model tool can run application code, query identity tables, change permissions or access unapproved network services.
- No live public deployment, independent security audit, large-scale load test, or real-model validation is claimed by this release. Passing tests do not replace a review of the actual domain, TLS proxy, exposure, filesystem permissions and secrets before general use.

## Container additions (2.1)

The provided image runs as a non-root user; Compose makes the app root filesystem read-only, drops capabilities and enables no-new-privileges. Persistent state is separate from the image; no MFA secret is required. An advisory OS lock prevents shared-volume use by multiple containers and permits recovery after abrupt termination. A loopback-only readiness probe can bypass the public Host check and exposes only `{ok:true}`. It grants no identity or campaign access.

Hosts can edit AI persona prompts; fixed appended contracts are visible in the UI and engine/authentication checks remain independent of AI output. The AI has no tools or identity-store access. Server operators must still patch their host/proxy/Ollama, maintain backups and protect their configured endpoint. GitHub publishing uses pinned actions, restricted job permissions and the built-in job token; PRs run tests without package publication. See DOCKER.md for the exact deployment and remaining operational requirements.

## Context compaction (2.3)

Each AI request is budgeted before sending. Essential current world data, submitted orders and system instructions remain intact; optional public history and participant-filtered private dialogue are compressed or omitted to fit. Private highlights stay in the same request scope and are not stored as shared public memory. Context summaries are reference data and grant no tool or identity-store authority. The full underlying archives remain subject to the existing access rules and message-retention limit. This is a conservative byte-based text bound with template headroom, not an exact tokenizer for every possible configured model. See AI.md.


NPC diplomacy and queue boundary (3.2): recent completed player–NPC exchanges from current seats are supplied as bounded excerpts to the shared turn director. Human DMs, advisor text, former-seat messages and account IDs are excluded. They are not exposed through other players' message APIs. The model is instructed not to quote private negotiations, but public consequences and generated prose may reveal arrangements; do not treat model narration as a secrecy guarantee.

Generation admission is bounded to 32 waiting requests, four outstanding per account, a ten-minute wait deadline and the configured one/two active generations, at most one per account. Execution timeout begins after admission. Session/seat authorization and world revision/phase are rechecked before queued generation, and existing post-generation checks still apply. Queue state is volatile across restarts. This protects finite resources while letting ordinary concurrent play wait rather than fail.


## Audit hardening (3.4)

Request bodies are fully parsed before mutable campaign state and final authorization are acquired. Password-change/reauth flows also recheck the initiating session after asynchronous hashing. Campaign saves reject stale object replacement unless the current predecessor is supplied explicitly. Queued jobs revalidate sessions, seats, phase and revision; queued NPC replies also recheck that the recipient remains unclaimed. The generation slot remains held through result validation and state commit, so follow-up context sees preceding replies.

AI jobs return 202 with account-private opaque IDs; other accounts cannot retrieve them. The browser polls short authenticated requests. Matching idempotency keys replay the same cached job; mismatched bodies are rejected. Pending jobs are capped at four per account and the generation-plus-waiting capacity globally; completed jobs have one-hour retention subject to bounded cache eviction. Caches are in memory and no automatic replay occurs after restart. Refresh the authoritative campaign before retrying an unavailable job.

Strategy rejects director map patches; Wild Map diplomatic agreements are restricted to affordable NPC treaty/unification/break responses. Human actions require human orders. A dry-run of the full resolution catches post-order map conflicts before the bounded AI correction attempt. Guest rendering reconciles removed nation/province selections on updated world state.


Version 3.5 enforces a 20,000 context ceiling in configuration and in each request budget, including schema/output/framing. Oversized turns use bounded sequential passes with original identity/index validation, aggregate action-budget checks, no human impersonation and one final atomic commit. Model-derived summaries are labeled lossy reference data, never authority to change permissions. Scenario/prompt and proposed successor-world capacity checks reject impossible configurations before persistence.


## Version 3.6 update

The earlier 3.5 measurements describe the prior 20K release. Current default and maximum total context are 32,768, with output/schema/framing reserves and compaction retained. Wild Map supports eight sequential operations and transaction-local new-state refs; invalid refs, ownership, human protections and final capacity reject the entire proposal. Exact adjacency is supplied as reference data. No new tool/network/account authority is granted. See AI.md for current measurements and memory limitations.


## Open signup, seat control and victory (3.7)

Signup budgets are 30 attempts globally per minute and five per normalized username per 15 minutes, checked before expensive hashing, plus two concurrent hashes. They intentionally do not trust proxy or forwarded IPs. Public traffic shares the global signup budget; existing sign-ins use independent limits. Exact Origin, Secure cookies, CSRF, revocation and recent administrator password confirmation remain enforced.

Only server admins can directly assign/swap registered accounts, inspect operational campaign rosters and read/edit victory criteria. They do not gain API access to private campaign chat/orders. Assignment rotates affected seat IDs, clears affected private conversation/advisor records and saved orders, resets readiness, and increments revision so stale AI results cannot commit. A swap maintains one account per nation; only active accounts and nations with land are eligible.

Victory AI jobs are owner-private and admin-authorized at admission, queued execution, result fetch and commit. Evaluation uses a snapshot of world and public history, omitting private chats and submitted current orders. Criteria are reference data and confer no tool authority. Exact eligible winner IDs and JSON are validated, with at most one repair; stale criteria/world/roster or no-winner results cannot be published. The public announcement is entered separately; private criteria/recommendations are omitted from member views and exports. An admin-reviewed declaration finishes the campaign, while reopening is also an admin action. The model's subjective interpretation is not a proof of objective scoring correctness.
