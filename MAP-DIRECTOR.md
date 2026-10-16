# Wild Map director

Wild Map is the default when creating a campaign. Choose Ollama mode and your model in Host settings. Players can submit freeform Policy orders or simply ready up; the host advances the shared turn. No advisor or separate nation agents are required.

The single director receives the current map, human seats, all submitted orders, compacted public history and recent completed NPC negotiation excerpts. Negotiations can influence its decisions, but promises do not force outcomes. Human DMs and advisor exchanges are excluded. Its editable turn prompt encourages playful alternate history, breakaway microstates, strange unions and plans that sometimes backfire. Host settings can change that tone. A fixed server contract still requires real, validated effects.

## What changes

Every successful AI turn must include at least one actual province ownership change. Up to eight map operations are allowed:

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

Small turns use one AI request, with at most one correction. Version 3.6 splits large turns into bounded policy passes and one final world pass, each under 32,768 total context; this takes more sequential calls, not independent AI nation agents. Private diplomacy only calls AI when requested. Wild Map sends a smaller ownership-focused snapshot rather than planning armies and economic actions for each nation. The single-generation RX 6750 XT profile and local history compaction remain in force; actual GPU memory, speed and model creativity have not been measured here. See AI.md.

Strategy mode remains available in campaign creation/Host settings for the earlier bounded nation-order simulation. Whole-turn checkpoints can undo either mode. This is an original simplified map sandbox, not full Pax Historia feature parity.


Version 3.4 adds optional agreements for NPC treaty/union consent or breaking a treaty. They use normal costs, identity checks and reciprocal human consent. They do not add independent NPC military/economic planning. AI execution uses immediate background-job responses and short result polls; queued follow-ups see earlier committed dialogue. Strategy mode cannot use director map patches to bypass its order/combat rules.

## Composable territorial settlements (3.6)

A `secede` operation can declare `ref: "$tea"`; each `collapse.parts` entry can declare its own ref. Later operations in that same response can use the ref as `country` or `targetCountry`. Declarations must precede use, must be unique, and must match `$` followed by 1–24 lowercase letters/digits/underscores starting with a letter. Refs never persist or work in diplomatic `agreements`; the next world snapshot supplies real IDs.

For example, this creates one state from land in two countries and gives it a government:

```json
[
  {"type":"secede","country":"GB","provinces":["GB1"],"name":"Tea Federation","color":"#cc4499","ref":"$tea"},
  {"type":"transfer","country":"IE","targetCountry":"$tea","provinces":["IE1"]},
  {"type":"regime","country":"$tea","government":"council","ideology":"socialist","leader":"Tea committee"}
]
```

Ownership is checked after preceding operations. Duplicate/unknown/forward refs or invalid later operations reject the whole response without partial changes. History records actual created/recipient IDs, and the UI already renders their ownership, color and labels. No model-selected stable IDs or executable tools are involved.

The director now receives exact province adjacency as undirected territory-row pairs. Its default prompt favors connected settlements, responds to policy/diplomacy, preserves continuity, spreads attention across players, and allows intentional island/enclave surprises. Geography guides the model; it is not a hard ban on disconnected countries. Map polygon shapes remain fixed; this changes ownership and state identities rather than generating new geometry.
