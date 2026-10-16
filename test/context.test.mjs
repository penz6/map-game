import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compactRequest, worldContext, requestTokenBound, campaignMemory } from '../context.mjs';
import { scenario } from '../scenario.mjs';
import { turnSchema } from '../engine.mjs';
import { systemPrompt } from '../prompts.mjs';
const makeRoom = () => ({ world: {...scenario(),mapMode:'strategy'}, round: 1, history: [] });
function pack(room, input = {}, settings = {}) {
  return compactRequest({ room, messages: [{ role: 'system', content: systemPrompt(room, settings.chat ? 'diplomacy' : 'turn',room.world.countries[0]) }, { role: 'user', content: JSON.stringify({ ...worldContext(room), ...input }) }], format: settings.chat ? undefined : turnSchema, contextLength: 20000, outputTokens: settings.chat ? 768 : 3072, ...settings });
}
const archived = i => ({ round: i + 1, date: '1936-01-01', events: [{ title: `Round ${i + 1}: diplomatic uncertainty`, body: 'Governments discuss their national priorities. '.repeat(50) }, { title: `Round ${i + 1}: policy outcome`, body: 'Research improved military capabilities. '.repeat(50) }], orders: [{ name: 'Former player', country: 'FR', orders: [{ type: 'policy', text: 'OLD ORDER TEXT' }] }] });

test('12GB profile fits essential starting world, schema, prompts and output reserve', () => {
  const room = makeRoom(), result = pack(room, { months: 1, players: [{ playerId: 'human', country: 'FR', orders: [{ type: 'policy', text: 'Fund industrial research.' }] }] });
  assert(result.inputBound <= result.inputBudget);assert.equal(result.inputBudget, 20000 - 3072 - 512);
  assert.equal(requestTokenBound(result.messages, turnSchema), result.inputBound);
  const ctx = JSON.parse(result.messages[1].content);
  assert.equal(ctx.countries.length, 28);assert.equal(ctx.territories.length, 84);
  const treasury = ctx.countryColumns.indexOf('treasury');assert.equal(ctx.countries[0][treasury], room.world.countries[0].treasury);
  assert(!ctx.countryColumns.includes('color'));assert(!ctx.countryColumns.includes('label'));
  assert.equal(ctx.players[0].orders[0].text, 'Fund industrial research.');
});

test('long campaign compaction fits budget, retains exact live state and leaves full archive untouched', () => {
  const room = makeRoom();room.history = Array.from({ length: 240 }, (_, i) => archived(i));room.round = 241;
  const before = JSON.stringify(room), result = pack(room, { players: [{ playerId: 'p', country: 'FR', orders: [{ type: 'policy', text: 'An EXACT current policy 🗺️' }] }] });
  assert(result.inputBound <= result.inputBudget);assert.equal(result.compacted, true);
  const data = JSON.parse(result.messages[1].content);assert.equal(data.players[0].orders[0].text, 'An EXACT current policy 🗺️');
  assert.deepEqual(data.countries, worldContext(room).countries);assert.deepEqual(data.territories, worldContext(room).territories);
  assert.equal(data.contextCompaction.archivedTurns, 240);assert.equal(data.contextCompaction.currentWorldIsAuthoritative, true);
  assert.equal(JSON.stringify(room), before);assert(!result.messages[1].content.includes('OLD ORDER TEXT'));
  assert(campaignMemory(room.history).length <= 16);
});

test('private dialogue compacts independently and never reads other room conversations', () => {
  const room = makeRoom();room.messages = [{ from: 'DE', to: 'IT', text: 'OTHER PLAYERS SECRET' }];
  const conversation = Array.from({ length: 45 }, (_, i) => ({ from: i % 2 ? 'IT' : 'FR', to: i % 2 ? 'FR' : 'IT', date: '1936-01-01', audience: ['private-account-id'], text: `Message ${i}: ` + 'A proposal for peaceful trade. '.repeat(30) }));
  const result = pack(room, { conversation, message: 'My exact current proposal.' }, { chat: true });
  const ctx = JSON.parse(result.messages[1].content);
  assert(result.inputBound <= result.inputBudget);assert(result.compacted);assert.equal(ctx.message, 'My exact current proposal.');
  assert(!result.messages[1].content.includes('OTHER PLAYERS SECRET'));assert(!result.messages[1].content.includes('private-account-id'));
  assert(ctx.conversation.length <= 6);assert(ctx.conversationMemory.length <= 12);
});

test('oversized essential input and multi-byte content fail explicitly without truncating orders or mutating state', () => {
  const room = makeRoom(), before = JSON.stringify(room);
  assert.throws(() => pack(room, { players: [{ orders: [{ type: 'policy', text: '🗺️'.repeat(8000) }] }] }), e => e.status === 413 && /Essential AI input/.test(e.message));
  assert.equal(JSON.stringify(room), before);
  const result = pack(room, { message: 'Negotiate peace.' }, { chat: true });assert(result.inputBound <= result.inputBudget);
});

test('context profile validates combined output reserve and memory controls',async()=>{
 const {securityConfig}=await import('../security.mjs');
 const profile=securityConfig({});assert.equal(profile.aiConcurrency,1);assert.equal(profile.aiContext,32768);assert.equal(profile.aiBatch,128);assert.equal(profile.aiTurnOutput,3072);assert.equal(profile.aiChatOutput,768);assert.equal(profile.aiKeepAlive,300);
 for(const bad of [{AI_BATCH_SIZE:'0'},{AI_CONTEXT_LENGTH:'32769'},{AI_KEEP_ALIVE_SECONDS:'-1'},{AI_TURN_OUTPUT_TOKENS:'99999'},{AI_CHAT_OUTPUT_TOKENS:'0'},{AI_CONTEXT_LENGTH:'4096',AI_TURN_OUTPUT_TOKENS:'4096'}])assert.throws(()=>securityConfig(bad));
});

test('turn diplomacy excludes former seats, human DMs, future and old rounds and compacts without changing orders',async()=>{
 const {turnDiplomacy}=await import('../context.mjs');const room=makeRoom();room.round=10;room.players=[{accountId:'a',country:'FR'},{accountId:'b',country:'DE'}];
 const message=(from,to,audience,round,text)=>({from,to,audience,round,text});room.messages=[message('FR','IT',['a'],10,'Current proposal'),message('IT','FR',['a'],10,'NPC reply'),message('FR','DE',['a','b'],10,'Human DM'),message('FR','IT',['former'],10,'Former seat'),message('FR','IT',['a'],11,'Future'),message('FR','IT',['a'],6,'Old'),message('FR','all',[],10,'Public')];
 assert.deepEqual(turnDiplomacy(room).map(m=>m.text),['Current proposal','NPC reply']);
 const input={diplomacy:Array.from({length:48},(_,i)=>({from:'FR',to:'IT',round:10,text:`Offer ${i} `+'x'.repeat(600)})),players:[{orders:[{type:'policy',text:'EXACT ORDER'}]}]};const result=pack(room,input),data=JSON.parse(result.messages[1].content);assert(result.compacted);assert(data.diplomacy.length<48);assert.equal(data.players[0].orders[0].text,'EXACT ORDER');assert.equal(input.diplomacy.length,48);
});
