// Contact details for the buttons. Digits only with country code, e.g. '919876543210'. Left empty, the buttons stay hidden.
const CONFIG = { whatsapp: '', phone: '' };

// Flat data from the brochure: type, carpet, sale area, balcony (sq ft)
const FLATS = {
  A: [['A-101',4,1373.03,2529.25,264.91],['A-102',3,1002.57,1689.90,107.86],['A-103',3,1032.97,1746.33,107.70],['A-104',4,1316.29,2321.08,203.14],
      ['A-105',4,1468.28,2494.10,139.55],['A-106',3,1007.55,1832.81,196.90],['A-107',3,1007.55,1832.81,196.90],['A-108',4,1538.68,2718.26,250.06]],
  B: [['B-101',4,1532.42,2713.71,237.15],['B-102',3,1095.90,1958.08,198.82],['B-103',3,1145.96,1978.68,131.59],['B-104',3,1002.79,1797.36,181.41],
      ['B-105',3,1009.65,1693.02,83.92],['B-106',3,1009.06,1750.83,140.58],['B-107',3,1035.01,1881.46,161.07],['B-108',3,1095.43,1953.08,197.98]],
};
const FRAMES = { rise: 656, orbit: 121, tour: 483, shell: 151 };
// Phones, small screens and Data Saver get the lighter 1280-wide frames; everyone else gets the full 1920-wide set.
const TIER = (matchMedia('(max-width: 900px)').matches || (navigator.connection && navigator.connection.saveData)) ? 'lq' : 'hq';
const fmt = n => n.toLocaleString('en-IN', { minimumFractionDigits: 2 });
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

// Image sequence on a canvas. Smooth: the position eases toward the scroll target and
// neighbouring frames are blended, so there is no stepping. Frames near the position load first.
const seqs = [];
function sequence(canvas, name, count, fit, onLoad) {
  const ctx = canvas.getContext('2d');
  const imgs = new Array(count), st = new Uint8Array(count); // 0 none, 1 loading, 2 ready
  let target = 0, shown = 0, dirty = true, loaded = 0, near = true, started = false, inflight = 0, next = 0;
  const url = i => `frames/${TIER}/${name}/${String(i + 1).padStart(3, '0')}.webp`;
  const order = [];
  for (let s = 16; s >= 1; s >>= 1) for (let i = 0; i < count; i += s) if (s === 16 || (i / s) % 2 === 1) order.push(i);

  function req(i) {
    if (i < 0 || i >= count || st[i]) return;
    st[i] = 1; inflight++;
    const im = new Image(); im.decoding = 'async';
    im.onload = () => { st[i] = 2; loaded++; inflight--; dirty = true; if (onLoad) onLoad(loaded); pump(); };
    im.onerror = () => { st[i] = 3; inflight--; pump(); };
    im.src = url(i); imgs[i] = im;
  }
  function pump() {
    while (started && inflight < 6 && next < order.length) { const i = order[next++]; if (!st[i]) req(i); }
  }
  function want(c) { for (let d = 0; d <= 36; d++) { req(c + d); if (d <= 14) req(c - d); } }
  function nearest(i) {
    for (let d = 0; d < count; d++) {
      if (i - d >= 0 && st[i - d] === 2) return i - d;
      if (i + d < count && st[i + d] === 2) return i + d;
    }
    return -1;
  }
  function paint(i, alpha) {
    const j = nearest(i); if (j < 0) return;
    const im = imgs[j], cw = canvas.width, ch = canvas.height;
    const s = fit ? Math.min(cw / im.naturalWidth, ch / im.naturalHeight) : Math.max(cw / im.naturalWidth, ch / im.naturalHeight);
    const w = im.naturalWidth * s, h = im.naturalHeight * s;
    ctx.globalAlpha = alpha;
    ctx.drawImage(im, (cw - w) / 2, (ch - h) / 2, w, h);
  }
  function render() {
    const a = Math.floor(shown), f = shown - a;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    paint(a, 1);
    if (f > .03 && a + 1 < count) paint(a + 1, f);
    ctx.globalAlpha = 1;
  }
  function resize() {
    const d = Math.min(devicePixelRatio, 1.5);
    canvas.width = Math.round(canvas.clientWidth * d); canvas.height = Math.round(canvas.clientHeight * d); dirty = true;
  }
  const api = {
    set(p) { target = Math.max(0, Math.min(1, p)) * (count - 1); want(Math.round(target)); },
    tick() {
      if (!near) return;
      const d = target - shown;
      if (Math.abs(d) > .01) { shown += d * .16; dirty = true; }
      else if (shown !== target) { shown = target; dirty = true; }
      if (dirty) { render(); dirty = false; }
    },
  };
  new IntersectionObserver(e => { near = e[0].isIntersecting; if (near && !started) { started = true; pump(); } dirty = true; }, { rootMargin: '100% 0px' }).observe(canvas);
  addEventListener('resize', resize); resize();
  want(0);
  seqs.push(api);
  return api;
}

// Smooth scroll
gsap.registerPlugin(ScrollTrigger);
const lenis = new Lenis();
lenis.on('scroll', () => ScrollTrigger.update());
gsap.ticker.add(t => { lenis.raf(t * 1000); seqs.forEach(s => s.tick()); });
gsap.ticker.lagSmoothing(0);

// Preloader: wait for the opening frames, with a limit so a slow network still gets in
const loaderEl = $('#loader');
const hideLoader = () => loaderEl.classList.add('done');
setTimeout(hideLoader, 8000);

// Fade up and arrive: elements ease in once, the first time they scroll into view
// Demo only: the OS "reduce motion" setting is ignored so the effect always shows. Honour it before a public launch.
const io = new IntersectionObserver(entries => entries.forEach(e => {
  if (!e.isIntersecting) return;
  [...e.target.children].forEach((c, i) => c.style.setProperty('--i', i));
  e.target.classList.add('in'); io.unobserve(e.target);
}), { threshold: .15, rootMargin: '0px 0px -8% 0px' });
$$('.reveal, .stagger').forEach(el => io.observe(el));

// Floating section nav
const navLinks = $$('.nav a');
navLinks.forEach(a => {
  const sec = $(a.getAttribute('href'));
  a.onclick = e => { e.preventDefault(); lenis.scrollTo(sec, { immediate: true }); };
  new IntersectionObserver(en => { if (en[0].isIntersecting) navLinks.forEach(n => n.classList.toggle('on', n === a)); }, { rootMargin: '-50% 0px -50% 0px' }).observe(sec);
});
$$('a[href^="#"]:not(.nav a)').forEach(a => a.onclick = e => { const s = $(a.getAttribute('href')); if (s) { e.preventDefault(); lenis.scrollTo(s, { immediate: true }); } });

// Scroll scenes: the tower rising, then straight into the flat
function scene(sectionId, canvasId, name, count, onLoad, onProg) {
  const seq = sequence($(canvasId), name, count, false, onLoad);
  const chapters = $$(`${sectionId} .chapter, ${sectionId} .step`);
  const update = p => { seq.set(p); chapters.forEach(c => c.classList.toggle('on', p >= +c.dataset.from && p <= +c.dataset.to)); if (onProg) onProg(p); };
  ScrollTrigger.create({ trigger: sectionId, start: 'top top', end: 'bottom bottom', scrub: true, onUpdate: s => update(s.progress) });
  update(0);
}
// Where each scene's progress is scrolled to
const sceneY = (id, p) => { const s = $(id); return s.offsetTop + (s.offsetHeight - innerHeight) * p; };

// Choose-your-floor panel at the end of the tower scene, room buttons and a unit card inside the flat
const floorPick = $('#floorPick'), frange = $('#frange'), fnum = $('#fnum');
frange.addEventListener('input', () => { fnum.textContent = String(frange.value).padStart(2, '0'); });
$('#stepIn').onclick = () => lenis.scrollTo(sceneY('#tour', .45), { duration: 6 });
const roomsNav = $('#roomsNav'), unitCard = $('#unitCard'), roomBtns = [...roomsNav.querySelectorAll('button')];
roomBtns.forEach(b => b.onclick = () => {
  if (b.dataset.p === 'back') lenis.scrollTo(sceneY('#story', .985), { duration: 2.6 });
  else lenis.scrollTo(sceneY('#tour', +b.dataset.p), { duration: 2 });
});
function tourUi(p) {
  const on = p > .06;
  roomsNav.classList.toggle('on', on); unitCard.classList.toggle('on', on);
  const k = p < .58 ? 1 : p < .86 ? 2 : 3;
  roomBtns.forEach((b, i) => b.classList.toggle('on', i === k));
}
const ss = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

scene('#story', '#rise', 'rise', FRAMES.rise, n => {
  loaderEl.querySelector('i').style.width = Math.min(100, n / 40 * 100) + '%';
  if (n >= 40) hideLoader();
}, p => floorPick.classList.toggle('on', p > .78));
scene('#tour', '#tourCanvas', 'tour', FRAMES.tour, undefined, tourUi);
scene('#shell', '#shellCanvas', 'shell', FRAMES.shell);

// Rotate the flat by dragging
const viewer = $('#viewer'), hint = $('#dragHint');
const orbit = sequence($('#orbit'), 'orbit', FRAMES.orbit, true);
let ang = 0, drag = null;
viewer.addEventListener('pointerdown', e => { drag = e.clientX; viewer.classList.add('dragging'); viewer.setPointerCapture(e.pointerId); hint.style.opacity = 0; });
viewer.addEventListener('pointermove', e => {
  if (drag === null) return;
  ang = Math.max(0, Math.min(1, ang + (drag - e.clientX) / (viewer.clientWidth * .8)));
  drag = e.clientX; orbit.set(ang);
});
const stop = () => { drag = null; viewer.classList.remove('dragging'); };
viewer.addEventListener('pointerup', stop); viewer.addEventListener('pointercancel', stop);

// Site visit form. Nothing is sent anywhere yet: connect it to the sales team's CRM or WhatsApp before launch.
const modal = $('#modal'), interestSel = $('#interest');
const opts = ['<option>Not sure yet</option>', '<option>3 BHK</option>', '<option>4 BHK</option>'];
for (const b of ['A', 'B']) opts.push(`<optgroup label="Block ${b}">${FLATS[b].map(f => `<option>${f[0]} (${f[1]} BHK)</option>`).join('')}</optgroup>`);
interestSel.innerHTML = opts.join('');
$$('[data-wa]').forEach(a => { if (CONFIG.whatsapp) { a.hidden = false; a.href = `https://wa.me/${CONFIG.whatsapp}?text=${encodeURIComponent('Hi, I am interested in The Divine, Atun. Please share details.')}`; } });
$$('[data-call]').forEach(a => { if (CONFIG.phone) { a.hidden = false; a.href = `tel:+${CONFIG.phone}`; } });
function openVisit(interest) {
  $('#mform').hidden = false; $('#mok').hidden = true;
  if (interest) { const o = [...interestSel.options].find(x => x.text.startsWith(interest)); if (o) interestSel.value = o.value; }
  modal.hidden = false; lenis.stop();
  setTimeout(() => modal.querySelector('input').focus(), 60);
}
function closeVisit() { modal.hidden = true; lenis.start(); }
$$('[data-visit]').forEach(b => b.addEventListener('click', e => { e.preventDefault(); openVisit(b.dataset.interest); }));
$('#mx').onclick = closeVisit;
modal.addEventListener('click', e => { if (e.target === modal) closeVisit(); });
addEventListener('keydown', e => { if (e.key === 'Escape' && !modal.hidden) closeVisit(); });
$('#vf').addEventListener('submit', e => {
  e.preventDefault();
  const fd = new FormData(e.target), name = (fd.get('name') || '').toString().trim().split(' ')[0];
  $('#okName').textContent = name ? ', ' + name : '';
  $('#okMsg').textContent = `The sales team will call you to confirm a visit for ${`${fd.get('when')}, ${fd.get('slot').toString().split(',')[0].toLowerCase()} (${fd.get('slot').toString().split(', ')[1]})`}. You asked about: ${fd.get('interest')}.`;
  $('#mform').hidden = true; $('#mok').hidden = false;
});

// Picker
const unitsEl = $('#units'), detailEl = $('#detail');
let block = 'A', bhk = 0, current = 'A-103';
function showDetail(f) {
  current = f[0];
  const has = f[0] === 'A-103';
  detailEl.innerHTML = `<h3>${f[0]} <small>${f[1]} BHK</small></h3>
    <dl><dt>Carpet area</dt><dd>${fmt(f[2])} sq ft</dd><dt>Balcony area</dt><dd>${fmt(f[4])} sq ft</dd><dt>Sale area</dt><dd>${fmt(f[3])} sq ft</dd></dl>
    <div class="row"><button class="btn" data-enquire>Enquire about ${f[0]}</button>${has ? '<a class="btn ghost dk" href="#tour">See it in 3D</a>' : ''}</div>
    ${has ? '' : '<p class="small">3D view in this demo is ready for A-103.</p>'}`;
  detailEl.querySelector('[data-enquire]').onclick = () => openVisit(f[0]);
  const t = detailEl.querySelector('a[href="#tour"]'); if (t) t.onclick = e => { e.preventDefault(); lenis.scrollTo($('#tour'), { immediate: true }); };
  $$('.unit').forEach(u => u.classList.toggle('on', u.dataset.id === f[0]));
}
function renderUnits() {
  $$('.tab').forEach(t => t.classList.toggle('on', t.dataset.block === block));
  $$('.chip').forEach(c => c.classList.toggle('on', +c.dataset.bhk === bhk));
  $('#floorImg').src = `assets/floor_${block.toLowerCase()}.jpg`;
  unitsEl.innerHTML = '';
  const list = FLATS[block].filter(f => !bhk || f[1] === bhk);
  list.forEach(f => {
    const el = document.createElement('button');
    el.className = 'unit'; el.dataset.id = f[0];
    el.innerHTML = `${f[0]}<small>${f[1]} BHK</small>`;
    el.onclick = () => showDetail(f);
    unitsEl.append(el);
  });
  if (!list.length) { unitsEl.innerHTML = '<p class="small">No such home in this block.</p>'; return; }
  showDetail(list.find(f => f[0] === current) || list[0]);
}
$$('.tab').forEach(t => t.onclick = () => { block = t.dataset.block; renderUnits(); });
$$('.chip').forEach(c => c.onclick = () => { bhk = +c.dataset.bhk; renderUnits(); });
renderUnits();

// View in 3D: free-roam model in an overlay (loaded on first open)
const view3d = $('#view3d'), frame3d = $('#frame3d');
function open3d() {
  if (!frame3d.src) frame3d.src = 'explore/index.html';
  view3d.hidden = false; lenis.stop(); document.body.style.overflow = 'hidden';
}
function close3d() { view3d.hidden = true; lenis.start(); document.body.style.overflow = ''; }
$('#open3d').onclick = open3d; $('#close3d').onclick = close3d;
addEventListener('keydown', e => { if (e.key === 'Escape' && !view3d.hidden) close3d(); });
addEventListener('message', e => { if (e.data && e.data.divine === 'enter') { close3d(); lenis.scrollTo(sceneY('#tour', .02), { duration: 1.2 }); } });

// Visit days: the next 10 real dates, starting tomorrow
(() => {
  const sel = $('#visitDay'); if (!sel) return;
  const f = new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
  for (let i = 1; i <= 10; i++) { const d = new Date(); d.setDate(d.getDate() + i); const o = document.createElement('option'); o.textContent = f.format(d).replace(',', ''); sel.append(o); }
})();
