import { check } from './engine.mjs';

// Byte-fallback/BPE tokenizers (including Qwen) cannot normally produce more
// text tokens than UTF-8 bytes. This deliberately conservative bound avoids
// relying on English-only characters-per-token estimates. Chat-template framing
// is accounted for separately; this is not an exact model tokenizer.
export const textTokenBound = text => Buffer.byteLength(text, 'utf8');
export function requestTokenBound(messages, format) {
  return messages.reduce((sum, m) => sum + textTokenBound(m.content) + 32, 0) + (format ? textTokenBound(JSON.stringify(format)) : 0);
}
const clip = (text, length) => [...String(text || '')].slice(0, length).join('');
const importance = text => /attack|offensive|occup|territor|peace|war|treaty|alliance|policy|research|revolt|coup/i.test(text) ? 2 : 1;
function selected(items, max) {
  return items.map((value, index) => ({ value, index, score: importance(value.text) }))
    .sort((a, b) => b.score - a.score || b.index - a.index).slice(0, max)
    .sort((a, b) => a.index - b.index).map(x => x.value);
}
function mergeBlocks(blocks) {
  const result = [];
  for (let i = 0; i < blocks.length; i += 2) {
    const a = blocks[i], b = blocks[i + 1];
    result.push(b ? { from: a.from, through: b.through, highlights: selected([...a.highlights, ...b.highlights], 3) } : a);
  }
  return result;
}
export function campaignMemory(history, maxBlocks = 16) {
  let blocks = history.map(h => ({ from: h.round, through: h.round, highlights: selected(h.events.map(e => ({ round: h.round, date: h.date, text: clip(e.title, 160) + ': ' + clip(e.body, 200) })), 3) }));
  while (blocks.length > maxBlocks) blocks = mergeBlocks(blocks);
  return blocks;
}
// Only current-seat NPC exchanges inform resolution. Never include human DMs,
// advisor messages, credentials or account identifiers in this shared context.
export function turnDiplomacy(room) {
 const seats=new Map(room.players.map(p=>[p.accountId,p.country]));
 const human=new Set(room.players.map(p=>p.country));
 return (room.messages||[]).filter(m=>m.to!=='all'&&m.round>=room.round-2&&m.round<=room.round&&m.audience?.length===1&&
  seats.has(m.audience[0])&&((m.from===seats.get(m.audience[0])&&!human.has(m.to))||(m.to===seats.get(m.audience[0])&&!human.has(m.from))))
  .slice(-48).map(({from,to,round,text})=>({from,to,round,text:clip(text,600)}));
}
export function worldContext(room, player, nearby) {
  if(room.world.mapMode==='wild')return{
    mapMode:'wild',protectPlayers:room.world.protectPlayers,premise:room.world.premise,date:room.world.date,round:room.round,
    countryColumns:['id','name','color','capital','human'],countries:room.world.countries.map(c=>[c.id,c.name,c.color,c.capital,(room.players||[]).some(p=>p.country===c.id)]),
    treaties:room.world.treaties,
    diplomaticColumns:['id','treasury','government','ideology','leader','status'],diplomaticNations:room.world.countries.map(c=>[c.id,c.treasury,c.government,c.ideology,c.leader,c.status]),
    territoryColumns:['id','name','owner'],territories:room.world.regions.map(r=>[r.id,r.name,r.owner]),
    ...(player?{player:{id:player.id,country:player.country,nearby}}:{})
  };
  return {
    mapMode:room.world.mapMode,protectPlayers:room.world.protectPlayers, premise: room.world.premise, date: room.world.date, round: room.round,
    countryColumns: ['id', 'name', 'treasury', 'economy', 'military', 'stability', 'government', 'ideology', 'leader', 'capital', 'status'],
    countries: room.world.countries.map(c => [c.id, c.name, c.treasury, c.economy, c.military, c.stability, c.government, c.ideology, c.leader, c.capital, c.status]),
    territoryColumns: ['id', 'name', 'owner', 'neighbors'],
    territories: room.world.regions.map(r => [r.id, r.name, r.owner, r.neighbors]),
    treaties: room.world.treaties,
    unitColumns: ['id', 'name', 'country', 'province', 'strength'], units: room.world.units.map(u=>[u.id,u.name,u.country,u.province,u.strength]),
    ...(player ? { player: { id: player.id, country: player.country, nearby } } : {})
  };
}

export function compactRequest({ room, messages, format, contextLength, outputTokens }) {
  const budget = contextLength - outputTokens - 512; // template/system framing safety margin
  check(budget > 0, 'AI context is too small for the configured output reserve.');
  const input = JSON.parse(messages[1].content);
  // Each conversation was already filtered by account and recipient in server.mjs.
  // Never include room.messages here: that would expose other private exchanges.
  const conversation = (input.conversation || []).map(({ from, to, date, text }) => ({ from, to, date, text }));
  const user = { ...input };
  delete user.history; delete user.olderHeadlines; delete user.conversation; delete user.diplomacy;
  let diplomacy=(input.diplomacy||[]).map(m=>({...m}));
  let recent = room.history.slice(-3).map(h => ({ round: h.round, date: h.date, events: h.events.map(e => ({ title: e.title, body: e.body })) }));
  let memory = campaignMemory(room.history.slice(0, room.history.length - recent.length));
  let dialogue = conversation.slice(-6), dialogueMemory = selected(conversation.slice(0, -6).map(m => ({ ...m, text: clip(m.text, 180) })), 12);
  let trimmed = conversation.length > dialogue.length + dialogueMemory.length;
  const serialize = () => {
    const data = { ...user, history: recent, campaignMemory: memory,
      ...(input.diplomacy ? {diplomacy} : {}),
      ...(conversation.length ? { conversation: dialogue, conversationMemory: dialogueMemory } : {}),
      contextCompaction: { method: 'extractive; partial highlights, not a complete record', archivedTurns: room.history.length, recentTurns: recent.length, olderTurns: room.history.length - recent.length, compacted: trimmed || memory.length > 0 || dialogueMemory.length > 0, currentWorldIsAuthoritative: true } };
    return [messages[0], { role: 'user', content: JSON.stringify(data) }];
  };
  let packed = serialize();
  const fits = () => requestTokenBound(packed, format) <= budget;
  const update = () => { trimmed = true; packed = serialize(); };
  // Compress optional context before ever considering a change to essential data.
  while (!fits() && recent.length > 1) {
    recent.shift();
    memory = campaignMemory(room.history.slice(0, room.history.length - recent.length));
    update();
  }
  for (const length of [500, 180]) {
    if (fits()) break;
    recent = recent.map(h => ({ ...h, events: h.events.map(e => ({ title: e.title, body: clip(e.body, length) })) })); update();
  }
  while (!fits() && memory.length > 1) { memory = mergeBlocks(memory); update(); }
  if (!fits() && memory.length) { memory = []; update(); }
  while (!fits() && diplomacy.length>4) { diplomacy.shift(); update(); }
  while (!fits() && dialogueMemory.length) { dialogueMemory.shift(); update(); }
  while (!fits() && dialogue.length > 2) {
    const m = dialogue.shift(); dialogueMemory.push({ ...m, text: clip(m.text, 120) });
    if (dialogueMemory.length > 2) dialogueMemory.shift(); update();
  }
  while (!fits() && dialogueMemory.length) { dialogueMemory.shift(); update(); }
  // Previous conversation and public history are optional. The current message,
  // prompt, premise, world, submitted orders and schema are never truncated.
  while (!fits() && dialogue.length) { dialogue.shift(); update(); }
  while (!fits() && diplomacy.length) { diplomacy.shift(); update(); }
  if (!fits() && recent.length) { recent = []; update(); }
  check(fits(), 'Essential AI input exceeds the context budget. Shorten the system prompt, world premise, message or submitted policies, or increase AI_CONTEXT_LENGTH. No orders or world changes were applied.', 413);
  return { messages: packed, inputBound: requestTokenBound(packed, format), inputBudget: budget, outputTokens, compacted: JSON.parse(packed[1].content).contextCompaction.compacted };
}
