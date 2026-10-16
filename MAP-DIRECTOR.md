# Wild Map director

Wild Map is the default when creating a campaign. Choose Ollama mode and your model in Host settings. Players can submit freeform Policy orders or simply ready up; the host advances the shared turn. No advisor or separate nation agents are required.

The single director receives the current map, human seats, all submitted orders, compacted public history and recent completed NPC negotiation excerpts. Negotiations can influence its decisions, but promises do not force outcomes. Human DMs and advisor exchanges are excluded. Its editable turn prompt encourages playful alternate history, breakaway microstates, strange unions and plans that sometimes backfire. Host settings can change that tone. A fixed server contract still requires real, validated effects.

## What changes

Every successful AI turn must include at least one actual province ownership change. Up to four map operations are allowed:

- Transfer provinces to an existing nation, including restoring a retired nation.
- Create a named, colored successor from selected provinces.
- Merge an unclaimed nation into another, optionally renaming/recoloring the union.
- Collapse an unclaimed nation into two to four successors covering its whole territory.
- Rename/recolor a nation or change its government and leader alongside real border changes.

The map uses existing province polygons; it does not generate new geographic shapes. Owners, colors, capitals, local army allegiance and active treaties update together. Changed provinces get a yellow dashed outline, and the chronicle lists engine-confirmed changes. Both players read the same persisted world.

By default the director must leave each human government at least one province. The host can disable this protection, allowing exile. Human government identities and accounts cannot be deleted by a merger/collapse. Structured player orders also retain validation and cost rules; the director cannot redraw provinces targeted by movement, attack, cession or release in that turn. Limits remain 64 nation identities and 12 armies per nation.

## Structured output, not executable tools

For example, an AI response can include:

```json
{"events":[{"title":"Tea independence","body":"A tiny tea republic declares independence."}],"policies":[],"mapChanges":[{"type":"secede","country":"GB","provinces":["GB1"],"name":"Tiny Tea Republic","color":"#ee44aa"}]}
```

The server allocates the new stable identity, checks references/ownership/protected seats and applies the complete transaction. Model text has no shell, filesystem, account or arbitrary code privileges. Invalid JSON/proposals receive one correction attempt. A second rejection preserves world, date, saved orders and timer state; headlines are not silently committed as map changes. Connection, timeout and output-length failures require host retry. Demo mode does not call AI or provide these director changes.

Normal turns use one AI request, with a maximum of two for a correction. Private diplomacy only calls AI when requested. Wild Map sends a smaller ownership-focused snapshot rather than planning armies and economic actions for each nation. The single-generation RX 6750 XT profile and local history compaction remain in force; actual GPU memory, speed and model creativity have not been measured here. See AI.md.

Strategy mode remains available in campaign creation/Host settings for the earlier bounded nation-order simulation. Whole-turn checkpoints can undo either mode. This is an original simplified map sandbox, not full Pax Historia feature parity.


Version 3.4 adds optional agreements for NPC treaty/union consent or breaking a treaty. They use normal costs, identity checks and reciprocal human consent. They do not add independent NPC military/economic planning. AI execution uses immediate background-job responses and short result polls; queued follow-ups see earlier committed dialogue. Strategy mode cannot use director map patches to bypass its order/combat rules.
