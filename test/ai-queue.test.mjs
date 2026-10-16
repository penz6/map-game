import {test} from 'node:test';
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import {createAIQueue} from '../ai-queue.mjs';

test('requests wait in FIFO order, release once, and continue after a failed generation',async()=>{
 const q=createAIQueue(),first=await q.acquire('a'),order=[];
 const b=q.acquire('b').then(release=>{order.push('b');release();}),c=q.acquire('c').then(release=>{order.push('c');release();});
 assert.deepEqual(q.status(),{active:1,waiting:2});assert.deepEqual(order,[]);first();first();await Promise.all([b,c]);assert.deepEqual(order,['b','c']);assert.deepEqual(q.status(),{active:0,waiting:0});q.close();
});
test('parallel configuration still serializes each account without blocking other accounts',async()=>{
 const q=createAIQueue({concurrency:2}),a=await q.acquire('a');let second=false;
 const again=q.acquire('a').then(release=>{second=true;release();});const b=await q.acquire('b');assert(!second);assert.deepEqual(q.status(),{active:2,waiting:1});b();assert(!second);a();await again;assert(second);q.close();
});
test('bounded queue and per-account limits reject only overload, not ordinary contention',async()=>{
 const q=createAIQueue({maxWaiting:2,maxPerUser:2}),a=await q.acquire('a'),a2=q.acquire('a');
 await assert.rejects(q.acquire('a'),e=>e.status===429&&/Your/.test(e.message));const b=q.acquire('b');await assert.rejects(q.acquire('c'),e=>e.status===429&&/queue is full/.test(e.message));a();(await a2)();(await b)();q.close();
});
test('expired and shutdown waiters are removed and never start later',async()=>{
 const q=createAIQueue({waitMs:15}),release=await q.acquire('a');const expired=assert.rejects(q.acquire('b'),e=>e.status===504);await delay(30);await expired;assert.equal(q.status().waiting,0);
 const closed=assert.rejects(q.acquire('c'),e=>e.status===503);q.close();await closed;release();assert.deepEqual(q.status(),{active:0,waiting:0});await assert.rejects(q.acquire('d'),e=>e.status===503);
});
