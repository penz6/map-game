import {randomBytes} from 'node:crypto';
import {check} from './rules.mjs';
// Changes operate on a clone; swapping preserves one account and one nation per seat.
export function assignCampaignSeat(room,user,country,{swap=false}={}){
 check(room.phase==='planning'&&!room.closed,'Change assignments between turns in an open campaign.',409);
 check(user&&!user.disabled,'Choose an active account.');
 check(room.world.countries.some(c=>c.id===country&&!['merged','annexed'].includes(c.status))&&room.world.regions.some(p=>p.owner===country),'Choose an active nation with territory.');
 const next=structuredClone(room),seat=next.players.find(p=>p.accountId===user.id),occupied=next.players.find(p=>p.country===country);
 check(!occupied||occupied===seat||swap&&seat,'That nation is occupied. Select swap for two existing players.',409);
 check(seat||next.players.length<12,'Campaign is full (12 players).');
 check(!seat||seat.country!==country,'This player already controls that nation.',409);
 const changed=new Set([user.id]);
 const move=(p,to)=>{const old=p.id;p.id=randomBytes(12).toString('hex');p.country=to;p.orders=[];p.ready=false;if(next.hostId===old)next.hostId=p.id;changed.add(p.accountId);};
 if(occupied&&occupied!==seat)move(occupied,seat.country);
 if(seat)move(seat,country);else next.players.push({id:randomBytes(12).toString('hex'),accountId:user.id,name:user.display_name,country,orders:[],ready:false});
 // Seat changes never inherit another government's private conversation or jobs.
 next.messages=next.messages.filter(m=>m.to==='all'||!m.audience?.some(id=>changed.has(id)));
 next.advisorMessages=(next.advisorMessages||[]).filter(m=>!changed.has(m.accountId));
 for(const p of next.players)p.ready=false;
 next.revision=(next.revision||0)+1;
 if(next.victory)next.victory.assessment=null;
 return next;
}
