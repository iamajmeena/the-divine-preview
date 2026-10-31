// A shared request budget, a small moving cache, and no whole-film preload.
let active = 0;
const queue = [];
function dispatch() {
 while (active < 4 && queue.length) {
  const job = queue.shift();
  if (!job.valid()) { job.cancel(); continue; }
  active++;
  job.run().finally(() => { active--; dispatch(); });
 }
}
export function sequence(canvas, name, count, {tier='lq',fit=false,onReady=()=>{},reduced=false}={}) {
 const ctx = canvas.getContext('2d');
 const cache = new Map(), pending = new Set(), failures = new Set();
 let target=0, shown=0, near=false, dirty=true, epoch=0, disposed=false;
 const cap=tier==='lq'?18:24, radius=reduced?0:5;
 const metrics={name,requests:0,failed:0,get cached(){return cache.size;},get pending(){return pending.size;}};
 const url=i=>`frames/${tier}/${name}/${String(i+1).padStart(3,'0')}.webp`;
 function evict() {
  const far=[...cache.keys()].sort((a,b)=>Math.abs(b-target)-Math.abs(a-target));
  while(cache.size>cap) { const key=far.shift(); cache.get(key)?.close?.(); cache.delete(key); }
 }
 function request(i) {
  if(i<0||i>=count||cache.has(i)||pending.has(i)||failures.has(i)) return;
  pending.add(i); const version=epoch;
  queue.push({valid:()=>near&&version===epoch&&Math.abs(i-target)<=radius+2,cancel:()=>pending.delete(i),run:async()=>{
   metrics.requests++;
   try {
    const response=await fetch(url(i)); if(!response.ok) throw new Error('frame');
    const blob=await response.blob();
    let bitmap;
    if(typeof createImageBitmap==='function') bitmap=await createImageBitmap(blob);
    else { bitmap=new Image(); const objectURL=URL.createObjectURL(blob); try {bitmap.src=objectURL;await bitmap.decode();} finally{URL.revokeObjectURL(objectURL);} }
    if(!near||version!==epoch||Math.abs(i-target)>cap){bitmap.close?.();return;}
    cache.set(i,bitmap);evict();dirty=true;canvas.dataset.ready='true';onReady();
   } catch { failures.add(i);metrics.failed++; }
   finally {pending.delete(i);}
  }});
 }
 function want() { if(!near||disposed)return; const c=Math.round(target);request(c);for(let d=1;d<=radius;d++){request(c+d);request(c-d);}dispatch(); }
 function nearest(i) {let best=null,dist=Infinity;for(const [k,im] of cache){if(Math.abs(k-i)<dist){best=im;dist=Math.abs(k-i);}}return best;}
 function paint(im,alpha=1){if(!im||!ctx)return;const w=im.width||im.naturalWidth,h=im.height||im.naturalHeight,s=fit?Math.min(canvas.width/w,canvas.height/h):Math.max(canvas.width/w,canvas.height/h);ctx.globalAlpha=alpha;ctx.drawImage(im,(canvas.width-w*s)/2,(canvas.height-h*s)/2,w*s,h*s);}
 function resize(){const d=Math.min(devicePixelRatio,tier==='lq'?1:1.5);canvas.width=Math.round(canvas.clientWidth*d);canvas.height=Math.round(canvas.clientHeight*d);dirty=true;}
 const observer=new IntersectionObserver(([entry])=>{near=entry.isIntersecting;epoch++;if(near){resize();want();dirty=true;}else{for(const im of cache.values())im.close?.();cache.clear();}}, {rootMargin:'150px 0px'});observer.observe(canvas);
 const sizes=new ResizeObserver(resize);sizes.observe(canvas);
 return {metrics,set(p){const next=Math.max(0,Math.min(1,p))*(count-1);if(Math.abs(next-target)>radius+2)epoch++;target=next;want();},tick(){if(!near||document.hidden||disposed)return;want();shown=reduced?target:shown+(target-shown)*.25;if(Math.abs(target-shown)>.02)dirty=true;if(!dirty||!cache.size)return;ctx.clearRect(0,0,canvas.width,canvas.height);paint(nearest(Math.round(shown)));ctx.globalAlpha=1;dirty=false;},retry(){failures.clear();want();},dispose(){disposed=true;near=false;epoch++;observer.disconnect();sizes.disconnect();for(const im of cache.values())im.close?.();cache.clear();dispatch();}};
}
