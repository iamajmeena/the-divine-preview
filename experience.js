import {FLATS,FRAMES,findFlat,selection,selectionLabel,normalizeMobile,visitDates,MARKERS} from './model.mjs';
import {sequence} from './frames.mjs';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const config=window.DIVINE_CONFIG||{}, systemMotion=matchMedia('(prefers-reduced-motion: reduce)');
let chosenMotion=null;try{chosenMotion=sessionStorage.getItem('divine-motion');}catch{}
// Cinematic by default, whatever the OS animation setting says; visitors can still pick calm viewing.
const motion={matches:chosenMotion==='calm'};
const lenis=(!motion.matches&&window.Lenis)?new Lenis():null;
const light=matchMedia('(max-width:900px)').matches||navigator.connection?.saveData||/2g/.test(navigator.connection?.effectiveType||'');
const tier=light?'lq':'hq';
let state=selection(),bhk=0,comparisons=[],lastFocus=null,activeOverlay=null,currentModule='tower',hubSeq=null;
try {state=selection(JSON.parse(sessionStorage.getItem('divine-selection')||'{}'));} catch {}
const fmt=n=>n.toLocaleString('en-IN',{maximumFractionDigits:2,minimumFractionDigits:2});
const jump=(id,p=0)=>{const el=$(id);if(!el)return;const y=el.offsetTop+Math.max(0,el.offsetHeight-innerHeight)*p;if(lenis)lenis.scrollTo(y,{duration:id==='#tour'?3:1.6});else window.scrollTo({top:y,behavior:'instant'});};
function save(patch){state=selection({...state,...patch});try{sessionStorage.setItem('divine-selection',JSON.stringify(state));}catch{}sync();}
function send3d(data){const f=$('#frame3d');if(f?.contentWindow&&f.getAttribute('src'))f.contentWindow.postMessage({divine:'selection',...state,...data},location.origin);}
function sync(){
 $('#frange').value=state.floor;$('#fnum').textContent=String(state.floor).padStart(2,'0');
 $('#pickFloor').value=state.floor;$('#blockSelect').value=state.block;
 $('#selectionSummary').textContent=selectionLabel(state);$('#explorerSelection').textContent=selectionLabel(state);
 $('#floorPlanName').textContent=`Block ${state.block} · typical floor plan`;$('#floorImg').src=`assets/floor_${state.block.toLowerCase()}.jpg`;
 $$('[data-block]').forEach(b=>{b.setAttribute('aria-pressed',String(b.dataset.block===state.block));b.classList.toggle('on',b.dataset.block===state.block);});
 $$('[data-bhk]').forEach(b=>{b.classList.toggle('on',+b.dataset.bhk===bhk);b.setAttribute('aria-pressed',String(+b.dataset.bhk===bhk));});
 const list=FLATS[state.block].filter(f=>!bhk||f[1]===bhk);
 $('#units').innerHTML=list.map(f=>`<button class="unit ${f[0]===state.plan?'on':''}" data-unit="${f[0]}" aria-pressed="${f[0]===state.plan}">${f[0]}<small>${f[1]} BHK · plan</small></button>`).join('')||'<p>No matching plan in this block.</p>';
 const f=findFlat(state.plan);
 $('#detail').innerHTML=`<p class="eyebrow">Your selected home plan</p><h3>${f[0]} <small>${f[1]} BHK</small></h3><p class="small">Floor ${state.floor} · Concept selection</p><dl><dt>Carpet area</dt><dd>${fmt(f[2])} sq ft</dd><dt>Balcony area</dt><dd>${fmt(f[4])} sq ft</dd><dt>Sale area</dt><dd>${fmt(f[3])} sq ft</dd></dl><div class="row"><button class="btn" data-visit>Enquire</button><button class="btn ghost" data-compare>${comparisons.includes(f[0])?'Remove comparison':'Compare plan'}</button></div><button class="text-button" data-open-module="plan">Locate on floor plan →</button>${f[0]==='A-103'?'<button class="text-button" data-open-module="inside">Step inside A-103 →</button>':'<p class="small">Discover our sample A-103 home in the explorer.</p>'}`;
 $('#planMarkers').innerHTML=FLATS[state.block].map((f,i)=>`<button class="plan-marker ${f[0]===state.plan?'selected':''}" style="left:${MARKERS[state.block][i][0]}%;top:${MARKERS[state.block][i][1]}%" data-unit="${f[0]}" aria-label="Select plan ${f[0]}" aria-pressed="${f[0]===state.plan}">${f[0]}</button>`).join('');
 renderComparison();send3d();if(activeOverlay===$('#view3d')&&currentModule==='plan')showModule('plan');
}
function renderComparison(){
 const host=$('#comparison');host.hidden=comparisons.length===0;
 host.innerHTML=`<div class="row"><h3>Compare up to two plans</h3><button class="text-button" data-clear-compare>Clear</button></div><div class="table-scroll"><table><caption>Brochure areas · availability and prices unconfirmed</caption><thead><tr><th>Plan</th>${comparisons.map(id=>`<th>${id}</th>`).join('')}</tr></thead><tbody>${[['BHK',1],['Carpet (sq ft)',2],['Sale area (sq ft)',3],['Balcony (sq ft)',4]].map(([label,i])=>`<tr><th>${label}</th>${comparisons.map(id=>`<td>${i===1?findFlat(id)[i]:fmt(findFlat(id)[i])}</td>`).join('')}</tr>`).join('')}</tbody></table></div><p class="small">${comparisons.length===1?'Choose another plan and tap Compare plan.':'To compare a different plan, remove one of these first.'}</p>`;
}
$('#frange').oninput=e=>save({floor:e.target.value});$('#pickFloor').onchange=e=>save({floor:e.target.value});
$('#blockSelect').onchange=e=>{bhk=0;save({plan:FLATS[e.target.value][0][0]});};
$('#stepIn').onclick=()=>{jump('#picker');$('#pickFloor').focus({preventScroll:true});};
document.addEventListener('click',e=>{
 const b=e.target.closest('button,a');if(!b)return;
 if(b.dataset.unit){save({plan:b.dataset.unit});return;}
 if(b.dataset.block){bhk=0;save({plan:FLATS[b.dataset.block][0][0]});return;}
 if(b.dataset.bhk!==undefined){bhk=+b.dataset.bhk;const list=FLATS[state.block].filter(f=>!bhk||f[1]===bhk);if(list.length&&!list.some(f=>f[0]===state.plan))save({plan:list[0][0]});else sync();return;}
 if(b.hasAttribute('data-compare')){if(comparisons.includes(state.plan))comparisons=comparisons.filter(id=>id!==state.plan);else if(comparisons.length<2)comparisons.push(state.plan);else{$('#selectionStatus').textContent='Two plans selected. Remove one before adding another.';return;}sync();return;}
 if(b.hasAttribute('data-clear-compare')){comparisons=[];sync();return;}
 if(b.hasAttribute('data-visit')){openVisit(b.dataset.interest);return;}
 if(b.dataset.openModule){openExplorer(b.dataset.openModule);return;}
 if(b.dataset.module){showModule(b.dataset.module);return;}
 if(b.dataset.room){if(activeOverlay)closeOverlay();jump('#tour',+b.dataset.room);return;}
 if(b.matches('a[href^="#"]')){e.preventDefault();jump(b.getAttribute('href'));}
});
// Optional cinematic route: no full-film preload or blocking splash screen.
document.documentElement.classList.toggle('reduce-motion',motion.matches);
$('#motionToggle').textContent=motion.matches?'Enable cinematic scrolling':'Use calm viewing';
$('#motionToggle').onclick=()=>{try{sessionStorage.setItem('divine-motion',motion.matches?'cinematic':'calm');}catch{}location.reload();};
const scenes=[];
for(const [id,name] of [['story','rise'],['tour','tour'],['shell','shell']]){
 const section=$('#'+id);if(!section)continue;const canvas=section.querySelector('canvas');
 canvas.style.backgroundImage=`url('assets/${id==='tour'||id==='shell'?'living':'top'}.jpg')`;
 const seq=sequence(canvas,name,FRAMES[name],{tier,reduced:motion.matches});
 scenes.push({section,seq,name,chapters:[...section.querySelectorAll('.chapter,.step')]});
}
const orbit=sequence($('#orbit'),'orbit',FRAMES.orbit,{tier,fit:true,reduced:motion.matches});
let angle=0,drag=null;
$('#viewer').onpointerdown=e=>{drag=e.clientX;$('#viewer').setPointerCapture(e.pointerId);};
$('#viewer').onpointermove=e=>{if(drag===null)return;angle=Math.max(0,Math.min(1,angle+(drag-e.clientX)/Math.max(250,$('#viewer').clientWidth)));drag=e.clientX;orbit.set(angle);$('#dragHint').hidden=true;};
$('#viewer').onpointerup=$('#viewer').onpointercancel=()=>{drag=null;};
$('#rotateLeft').onclick=()=>{angle=Math.max(0,angle-.08);orbit.set(angle);};
$('#rotateRight').onclick=()=>{angle=Math.min(1,angle+.08);orbit.set(angle);};
$('#viewer').onkeydown=e=>{if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();angle=Math.max(0,Math.min(1,angle+(e.key==='ArrowRight'?.04:-.04)));orbit.set(angle);}};
let updateNeeded=true;
addEventListener('scroll',()=>updateNeeded=true,{passive:true});lenis?.on('scroll',()=>updateNeeded=true);addEventListener('resize',()=>updateNeeded=true);
function tick(t){
 lenis?.raf(t);
 if(updateNeeded){scenes.forEach(({section,seq,chapters,name})=>{
  const r=section.getBoundingClientRect(),p=Math.max(0,Math.min(1,-r.top/Math.max(1,section.offsetHeight-innerHeight)));
  seq.set(motion.matches?(name==='rise'?.9:name==='tour'?.45:.3):p);
  chapters.forEach((c,i)=>{const on=motion.matches?i===0:p>=+c.dataset.from&&p<=+c.dataset.to;c.classList.toggle('on',on);c.inert=!on;});
  if(name==='rise'){$('#floorPick').classList.toggle('on',motion.matches||p>.66);$('#floorPick').inert=!(motion.matches||p>.66);}
  if(name==='tour'){$('#roomsNav').classList.add('on');$('#unitCard').classList.add('on');}
 });updateNeeded=false;}
 scenes.forEach(s=>s.seq.tick());orbit.tick();hubSeq?.tick();requestAnimationFrame(tick);
}tick();
window.divineDiagnostics=()=>({tier,selection:{...state},frames:[...scenes.map(s=>s.seq.metrics),orbit.metrics]});
const reveal=new IntersectionObserver(entries=>entries.forEach(e=>{if(e.isIntersecting){e.target.classList.add('in');reveal.unobserve(e.target);}}),{threshold:.05});$$('.reveal,.stagger').forEach(el=>reveal.observe(el));
const navObserver=new IntersectionObserver(entries=>entries.forEach(e=>{if(e.isIntersecting)$$('.nav a').forEach(a=>a.classList.toggle('on',a.hash==='#'+e.target.id));}),{rootMargin:'-20% 0px -60% 0px'});$$('section[id]').forEach(s=>navObserver.observe(s));
// Shared explorer: preserve the selection and never silently substitute a flat.
const hub=$('#view3d'),frame=$('#frame3d');
function openOverlay(el){if(activeOverlay)closeOverlay(false);lastFocus=document.activeElement;activeOverlay=el;el.hidden=false;document.body.style.overflow='hidden';lenis?.stop();$$('body > :not(.modal):not(.view3d):not(script)').forEach(n=>n.inert=true);el.querySelector('button')?.focus();}
function closeOverlay(restore=true){if(!activeOverlay)return;activeOverlay.hidden=true;activeOverlay=null;hubSeq?.dispose();hubSeq=null;document.body.style.overflow='';lenis?.start();$$('body > [inert]').forEach(n=>n.inert=false);send3d({active:false});if(restore)lastFocus?.focus();}
function openExplorer(module='tower'){openOverlay(hub);showModule(module);}
function showModule(module){
 currentModule=module;hubSeq?.dispose();hubSeq=null;
 $$('[data-module]').forEach(b=>{const on=b.dataset.module===module||(module==='spatial'&&b.dataset.module==='tower');b.classList.toggle('on',on);b.setAttribute('aria-pressed',String(on));});
 const pane=$('#hubContent');pane.replaceChildren();frame.hidden=module!=='spatial';pane.hidden=module==='spatial';
 if(module==='spatial'){if(!frame.getAttribute('src'))frame.src='explore/index.html';send3d({active:true});return;}
 send3d({active:false});
 if(module==='tower'){
  pane.innerHTML=`<p class="eyebrow">Two towers. One address.</p><h2>Find your place above it all.</h2><div class="hub-viewer tower-preview"><canvas id="hubCanvas" aria-label="The Divine tower concept"></canvas></div><div class="selection-controls"><label>Floor<select id="hubFloor">${Array.from({length:14},(_,i)=>`<option value="${i+1}" ${state.floor===i+1?'selected':''}>${String(i+1).padStart(2,'0')}</option>`).join('')}</select></label><div class="row"><button class="btn" data-module="plan">Choose your home</button><button class="btn ghost" data-module="spatial">Interactive site model</button></div></div><label class="scrub-label">From blueprint to skyline<input id="towerScrub" type="range" min="0" max="1000" value="820"></label><p class="small">Concept preview · floor range and surroundings are illustrative.</p>`;
  hubSeq=sequence($('#hubCanvas'),'rise',FRAMES.rise,{tier,reduced:motion.matches});hubSeq.set(.82);$('#towerScrub').oninput=e=>hubSeq.set(+e.target.value/1000);$('#hubFloor').onchange=e=>save({floor:e.target.value});
 } else if(module==='plan'){
  const copy=$('#planFigure').cloneNode(true);copy.removeAttribute('id');copy.querySelectorAll('[id]').forEach(n=>n.removeAttribute('id'));pane.append(copy);
  const go=document.createElement('button');go.className='btn';go.textContent='Change floor or compare plans';go.onclick=()=>{closeOverlay();jump('#picker');};pane.append(go);
 } else if(module==='inside'||module==='dollhouse'){
  const sample=state.plan==='A-103';
  pane.innerHTML=`<p class="eyebrow">A-103 · 3 BHK · Concept preview</p><h2>${module==='inside'?'Step inside.':'A home, from every angle.'}</h2>${sample?'':`<p>Your selection ${state.plan} is saved. Previewing sample home A-103.</p>`}<div class="hub-viewer"><canvas id="hubCanvas" aria-label="A-103 ${module==='inside'?'room tour':'rotating concept'}"></canvas></div><div class="row" id="hubRoomButtons"></div><label class="scrub-label">${module==='inside'?'Explore the rooms':'Rotate the home'}<input id="hubScrub" type="range" min="0" max="1000" value="${module==='inside'?450:0}"></label><div class="row"><button class="btn" data-visit data-interest="A-103">Enquire about A-103</button><button class="btn ghost" data-module="plan">View floor plan</button></div><p class="small">Artist’s impression. Final layouts and finishes will follow the approved plans.</p>`;
  const name=module==='inside'?'tour':'orbit';hubSeq=sequence($('#hubCanvas'),name,FRAMES[name],{tier,fit:module==='dollhouse',reduced:motion.matches});hubSeq.set(module==='inside'?.45:0);
  $('#hubScrub').oninput=e=>hubSeq.set(+e.target.value/1000);
  if(module==='inside'){for(const [label,value] of [['Entrance',150],['Living / dining',450],['Bedroom 1',720],['Bedroom 2',940]]){const b=document.createElement('button');b.className='chip';b.textContent=label;b.onclick=()=>{$('#hubScrub').value=value;hubSeq.set(value/1000);};$('#hubRoomButtons').append(b);}}
  else {let x=null;const c=$('#hubCanvas');c.onpointerdown=e=>{x=e.clientX;c.setPointerCapture(e.pointerId);};c.onpointermove=e=>{if(x===null)return;const slider=$('#hubScrub');slider.value=Math.max(0,Math.min(1000,+slider.value+(x-e.clientX)*2));x=e.clientX;hubSeq.set(+slider.value/1000);};c.onpointerup=c.onpointercancel=()=>x=null;}
 } else if(module==='amenities'){
  pane.innerHTML='<p class="eyebrow">From the brochure</p><h2>Room for more.</h2>';pane.append($('#spaces .cards').cloneNode(true),$('#spaces .amen').cloneNode(true));pane.querySelector('.cards').classList.add('in');
 } else {
  pane.innerHTML='<p class="eyebrow">Atun, Bhilwara</p><h2>200 Feet Ring Road</h2><p>Near CA Circle. Explore the neighbourhood on the brochure map.</p>';pane.append($('#location .map').cloneNode(true));
 }
}
$('#open3d').onclick=()=>openExplorer();$('#close3d').onclick=()=>closeOverlay();
frame.onload=()=>send3d({active:activeOverlay===hub&&currentModule==='spatial'});
addEventListener('message',e=>{if(e.origin!==location.origin||e.source!==frame.contentWindow)return;if(e.data?.divine==='ready')send3d({active:activeOverlay===hub&&currentModule==='spatial'});if(e.data?.divine==='floor')save({floor:e.data.floor});if(e.data?.divine==='enter')showModule('inside');if(e.data?.divine==='close')closeOverlay();});
// Preview by default; success only after a configured server acknowledges receipt.
const modal=$('#modal'),form=$('#vf');
$('#interest').innerHTML=Object.values(FLATS).flat().map(f=>`<option value="${f[0]}">${f[0]} · ${f[1]} BHK brochure plan</option>`).join('');
$('#visitDay').innerHTML=visitDates().map(d=>`<option value="${d.value}">${d.label}</option>`).join('');
const live=!!config.enquiryEndpoint;
$('#submitVisit').textContent=live?'Send enquiry':'Preview enquiry';
$('#enquiryMode').textContent=live?'Your details will be sent to the sales team. Requested time is subject to confirmation.':'Demo enquiry · preview only, no details are sent.';
function openVisit(interest){$('#mform').hidden=false;$('#mok').hidden=true;$('#interest').value=findFlat(interest)?.[0]||state.plan;$('#enquirySelection').textContent=`Floor ${state.floor} · Concept selection`;openOverlay(modal);form.elements.name.focus();}
$('#mx').onclick=()=>closeOverlay();modal.onclick=e=>{if(e.target===modal)closeOverlay();};
addEventListener('keydown',e=>{
 if(!activeOverlay)return;
 if(e.key==='Escape'){e.preventDefault();closeOverlay();return;}
 if(e.key==='Tab'){const items=[...activeOverlay.querySelectorAll('button,a[href],input,select,textarea,iframe')].filter(el=>!el.disabled&&el.getClientRects().length);const first=items[0],last=items.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}
});
form.elements.mobile.oninput=()=>form.elements.mobile.setCustomValidity('');
form.onsubmit=async e=>{
 e.preventDefault();const data=new FormData(form),mobile=normalizeMobile(data.get('mobile'));
 if(!mobile){form.elements.mobile.setCustomValidity('Enter a valid Indian mobile number, with optional +91.');form.elements.mobile.reportValidity();return;}
 const button=$('#submitVisit');button.disabled=true;$('#formError').textContent='';
 const payload={name:String(data.get('name')).trim(),mobile,selection:{...state,plan:data.get('interest'),block:data.get('interest')[0]},day:data.get('when'),time:data.get('slot'),timeZone:'Asia/Kolkata',consent:true};
 try{
  if(!payload.name)throw new Error('Please enter your name.');let reference='';
  if(live){const endpoint=new URL(config.enquiryEndpoint,location.href);if(endpoint.origin!==location.origin)throw new Error('Enquiry service must be configured on this site.');const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);let response;try{response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:controller.signal});}finally{clearTimeout(timer);}const result=await response.json();if(!response.ok||result.ok!==true)throw new Error('Enquiry was not confirmed. Please retry or contact the sales team.');reference=result.reference?` Reference: ${String(result.reference)}.`:'';}
  $('#okTitle').textContent=live?'Enquiry received':'Enquiry preview';
  $('#okMsg').textContent=`${payload.name}, ${payload.selection.plan}, demo floor ${payload.selection.floor}. Preferred visit: ${payload.day}, ${payload.time} (IST). ${live?'The team will confirm availability and the visit time.'+reference:'Nothing was sent. No visit has been booked.'}`;
  $('#mform').hidden=true;$('#mok').hidden=false;$('#okTitle').focus();
 }catch(error){$('#formError').textContent=error.name==='AbortError'?'Request timed out. Delivery is not confirmed; contact sales before retrying.':error.message;}
 finally{button.disabled=false;}
};
$('#editEnquiry').onclick=()=>{$('#mok').hidden=true;$('#mform').hidden=false;form.elements.name.focus();};
$$('[data-wa]').forEach(a=>{if(/^\d{10,15}$/.test(config.whatsapp)){a.hidden=false;a.href=`https://wa.me/${config.whatsapp}?text=${encodeURIComponent('Hello, I would like details about The Divine.')}`;}});
$$('[data-call]').forEach(a=>{if(/^\d{10,15}$/.test(config.phone)){a.hidden=false;a.href='tel:+'+config.phone;}});
sync();
