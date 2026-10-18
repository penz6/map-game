const paths={actions:'M4 16l1-4L14 3l4 4-9 9-5 1z M12 5l4 4',chat:'M4 4h16v12H9l-5 4V4z',advisor:'M9 18h6 M10 21h4 M8 14a6 6 0 1 1 8 0c-1 1-1 2-1 2H9s0-1-1-2',timeline:'M12 8v5l3 2 M21 12a9 9 0 1 1-3-7 M21 3v5h-5',menu:'M4 6h16 M4 12h16 M4 18h16',close:'M6 6l12 12 M18 6L6 18'};
const icon=name=>`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[name]}"/></svg>`;
export function arrangeGameLayout({room,player,host,flag,esc}){
 const $=s=>document.querySelector(s),shell=$('.shell'),panel=$('#orders-panel'),editor=$('#order-editor'),orders=$('#orders');
 shell.classList.add('pax-shell','atlas-shell');panel.classList.add('hidden');
 $('.topbar').outerHTML=`<header class="game-topbar"><div class="game-identity"><span class="game-brand">HISTORIA</span><button data-action="toggle-campaign" aria-controls="campaign-drawer" aria-expanded="false">${flag(player.country)}${esc(room.world.countries.find(c=>c.id===player.country).name)}</button><span class="game-campaign">${esc(room.name)}</span></div><details class="game-menu"><summary aria-label="Game menu">${icon('menu')}</summary><div class="game-menu-content">${host?'<button data-action="invite">Invite players</button>':''}<button data-auth-action="account">Account</button><button data-action="settings">Settings</button>${host?'<button data-action="timer-settings">Turn timer</button>':''}<button data-action="structured-orders">Structured orders</button><button data-action="rules">How to play</button><button data-action="exit">Leave campaign</button><div id="map-change-count" class="menu-status"></div></div></details></header>`;
 // The old counter is in the toolbar; keep only the new menu instance.
 const counters=document.querySelectorAll('#map-change-count');if(counters.length>1)counters[1].remove();
 const search=$('#map-country'),toolbar=$('.map-toolbar');
 const date=$('#date'),round=$('#round'),phase=$('#phase'),status=$('#turn-status'),ready=$('#ready'),advance=$('#advance'),clock=$('#turn-countdown');
 status.setAttribute('role','status');
 const footer=document.createElement('footer');footer.className='game-footer';
 footer.innerHTML=`<div class="footer-navigation"><button data-action="toggle-history" aria-controls="history-drawer" aria-expanded="false">${icon('timeline')}<span>Timeline</span></button><span class="footer-phase"></span></div><button class="timeline-date" data-action="toggle-history" aria-label="Open world timeline"></button><div class="jump-controls">${host?`<select id="jump-months" aria-label="Time to jump">${[1,3,6].map(n=>`<option value="${n}" ${room.months===n?'selected':''}>${n} month${n===1?'':'s'}</option>`).join('')}</select>`:''}</div>`;
 footer.querySelector('.footer-phase').append(phase,clock);footer.querySelector('.timeline-date').append(date,round);footer.querySelector('.jump-controls').append(ready,advance);
 const statusRow=document.createElement('div');statusRow.className='footer-status';statusRow.append(status);footer.querySelector('.jump-controls').append(statusRow);$('#app').append(footer);
 toolbar.replaceChildren(search);toolbar.className='nation-search';
 $('.rightbar').className='game-panels';
 $('.game-panels .tabs').outerHTML=`<nav class="command-rail" aria-label="Game navigation"><button data-tab="orders" aria-label="Actions" title="Actions">${icon('actions')}</button><button data-action="toggle-history" aria-label="Timeline" title="Timeline">${icon('timeline')}</button><button data-tab="diplomacy" aria-label="Chats" title="Chats">${icon('chat')}</button><button data-tab="advisor" aria-label="Advisor" title="Advisor">${icon('advisor')}</button></nav>`;
 const header=document.createElement('header');header.className='actions-header';header.innerHTML=`<div><h1>Actions</h1><p>Your decisions for ${esc(room.world.countries.find(c=>c.id===player.country).name)}</p></div><button class="icon-button" data-action="collapse-actions" aria-label="Hide actions">${icon('close')}</button>`;
 const list=document.createElement('div');list.className='submitted-actions';list.innerHTML='<div class="submitted-caption">Submitted this turn</div>';list.append(orders,$('#order-cost'));
 const composer=document.createElement('div');composer.className='action-composer';composer.append(editor);const brainstorm=document.createElement('button');brainstorm.className='brainstorm-button';brainstorm.dataset.action='suggestions';brainstorm.textContent='Help brainstorm actions';composer.append(brainstorm);
 const save=$('#save-orders'),legacy=$('.ready-box');save.classList.add('hidden');const utility=document.createElement('div');utility.className='hidden';utility.append(save,legacy);$('#app').append(utility);
 panel.replaceChildren(header,list,composer);$('#policy').placeholder='What would you like your nation to do?';$('#policy').setAttribute('aria-label','New action');$('[data-action="add-order"]').textContent='Submit action';
 for(const [id,title]of[['diplomacy','Chats'],['advisor','Advisor']]){const node=$('#'+id+'-panel'),heading=node.querySelector('.panel-title');heading.outerHTML=`<header class="secondary-header"><h2>${title}</h2><button class="icon-button" data-action="close-secondary" aria-label="Close ${title.toLowerCase()}">${icon('close')}</button></header>`;}
 $('#map-country').setAttribute('aria-label','Find a nation');
 const tools=$('.map-tools');tools.insertAdjacentHTML('afterbegin','<button class="small" data-action="map-layers" title="Switch political / physical map">Physical map</button><button class="small" data-action="map-projection" title="Switch globe / flat atlas">Globe</button>');
 const select=document.createElement('div');select.className='map-keyboard-access';select.innerHTML='<label for="map-region">Inspect a province</label><select id="map-region" aria-label="Inspect a province"></select>';tools.before(select);
 const progress=document.createElement('div');progress.id='ai-progress';progress.className='atlas-ai-progress hidden';progress.setAttribute('role','status');tools.before(progress);
 const guide=document.createElement('div');guide.className='atlas-guide';guide.textContent='Scroll to zoom · Drag to explore · Select a country';tools.before(guide);

 $('#policy').addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();$('[data-action="add-order"]').click();}});
 return {date,round};
}
