import * as THREE from 'three';
import { OrbitControls } from './vendor/OrbitControls.js';
import { GLTFLoader } from './vendor/loaders/GLTFLoader.js';
import { RGBELoader } from './vendor/loaders/RGBELoader.js';
import { EffectComposer } from './vendor/postprocessing/EffectComposer.js';
import { RenderPass } from './vendor/postprocessing/RenderPass.js';
import { UnrealBloomPass } from './vendor/postprocessing/UnrealBloomPass.js';
import { OutputPass } from './vendor/postprocessing/OutputPass.js';

const $ = s => document.querySelector(s);
const lb = $('#lb');
const prog = v => { lb.style.width = v + '%'; };

// ---------- renderer / scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
const small = matchMedia('(max-width:900px)').matches;
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
let activeView=true, selectedBlock='A', selectedPlan='A-103';
renderer.setPixelRatio(Math.min(devicePixelRatio, small ? 1.5 : 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = .82;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
const HORIZON = new THREE.Color('#dfe6e8');
scene.fog = new THREE.FogExp2(HORIZON, 0.00028);
const camera = new THREE.PerspectiveCamera(48, innerWidth / innerHeight, 1, 30000);

// sky dome: deep blue to warm horizon
const sky = new THREE.Mesh(new THREE.SphereGeometry(20000, 32, 16), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false,
  uniforms: { top: { value: new THREE.Color('#2f5d9c') }, mid: { value: new THREE.Color('#9cc3e6') }, hor: { value: HORIZON } },
  vertexShader: 'varying vec3 p;void main(){p=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader: 'varying vec3 p;uniform vec3 top,mid,hor;void main(){float h=max(p.y,0.);vec3 c=mix(hor,mid,smoothstep(0.,.18,h));c=mix(c,top,smoothstep(.15,.75,h));gl_FragColor=vec4(c,1.);}'
}));
scene.add(sky);

scene.add(new THREE.HemisphereLight('#cfe3ff', '#8a7a55', 0.4));
// real sky light for reflections on glass, railings and water
const pm = new THREE.PMREMGenerator(renderer);
new RGBELoader().load('env.hdr', t => { scene.environment = pm.fromEquirectangular(t).texture; t.dispose(); });
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(innerWidth, innerHeight, { type: THREE.HalfFloatType, samples: small ? 0 : 2 }));
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), small ? .12 : .22, .6, 1.9);
composer.addPass(bloom); composer.addPass(new OutputPass());
const sun = new THREE.DirectionalLight('#ffe3b8', 2.2);
sun.position.set(-260, 210, 180);
sun.castShadow = true;
sun.shadow.mapSize.set(small ? 1024 : 2048, small ? 1024 : 2048);
const sc = sun.shadow.camera; sc.left = -170; sc.right = 170; sc.top = 170; sc.bottom = -170; sc.near = 50; sc.far = 900;
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.6;
scene.add(sun); sun.target.position.set(-90, 0, 25); scene.add(sun.target);

// ---------- map imagery, graded greener and softer ----------
function loadImg(src) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; }); }
function grade(img, size, tint) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0, size, size);
  const d = x.getImageData(0, 0, size, size), p = d.data;
  for (let i = 0; i < p.length; i += 4) {
    let r = p[i], g = p[i + 1], b = p[i + 2];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), sat = mx ? (mx - mn) / mx : 0;
    if (sat > 0.1 && r >= g && b < g + 12) { // dry scrub and bare earth: push towards fresh green
      const k = tint;
      g += (r - g) * k + 16; r = r * (1 - 0.28 * k); b *= 0.84;
    } else if (g > r && g > b) { g *= 1.14; r *= 0.96; } // existing vegetation: richer
    p[i] = Math.min(255, r * 1.06); p[i + 1] = Math.min(255, g * 1.06); p[i + 2] = Math.min(255, b * 1.04);
  }
  x.putImageData(d, 0, 0);
  return { canvas: c, data: p, size };
}
function tex(canvas, aniso = true) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = aniso ? renderer.capabilities.getMaxAnisotropy() : 1;
  return t;
}

const SITE = 1266;   // metres covered by site.jpg
const CITY = 10854;  // metres covered by city.jpg
const px2w = (px, py) => [(px - 1024) / 2048 * SITE, (py - 1024) / 2048 * SITE];

// soft radial alpha so the sharp site tile melts into the wide city tile
function radialAlpha() {
  const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d');
  const g = x.createRadialGradient(128, 128, 60, 128, 128, 128);
  g.addColorStop(0, '#fff'); g.addColorStop(.72, '#fff'); g.addColorStop(1, '#000');
  x.fillStyle = g; x.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
}

// ---------- facade textures drawn in code ----------
function facadeTexture(kind) {
  const W = 512, H = 256, c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  const wall = x.createLinearGradient(0, 0, 0, H); wall.addColorStop(0, '#efece4'); wall.addColorStop(1, '#e2ddd2');
  x.fillStyle = wall; x.fillRect(0, 0, W, H);
  const bays = kind === 'end' ? 2 : 3, bw = W / bays;
  // slab and balcony edge
  x.fillStyle = '#cfc8b8'; x.fillRect(0, H - 26, W, 26);
  x.fillStyle = '#b79a6a'; x.fillRect(0, H - 30, W, 4);
  for (let i = 0; i < bays; i++) {
    const bx = i * bw;
    const balcony = kind !== 'end';
    // glass opening
    const gx = bx + bw * 0.14, gw = bw * 0.72, gy = 26, gh = H - 26 - 60;
    const gl = x.createLinearGradient(gx, gy, gx + gw, gy + gh);
    gl.addColorStop(0, '#5b8bb4'); gl.addColorStop(.5, '#2d4f73'); gl.addColorStop(1, '#8fb5d4');
    x.fillStyle = gl; x.fillRect(gx, gy, gw, gh);
    x.fillStyle = '#ffd89a33'; x.fillRect(gx + gw * .1, gy + gh * .55, gw * .8, gh * .4); // warm room glow
    x.fillStyle = '#2b2a28'; x.fillRect(gx + gw / 2 - 2, gy, 4, gh); x.fillRect(gx, gy, gw, 3); // mullions
    x.fillStyle = '#f7f5ef'; x.fillRect(bx - 5, 0, 10, H - 26); // fin
    if (balcony) {
      x.fillStyle = '#bfe0f066'; x.fillRect(bx + bw * .04, H - 94, bw * .92, 64); // glass railing
      x.strokeStyle = '#ffffffaa'; x.lineWidth = 2; x.strokeRect(bx + bw * .04, H - 94, bw * .92, 64);
      x.fillStyle = '#9a7a4e'; x.fillRect(bx + bw * .04, H - 36, bw * .92, 8); // planter edge
      for (let k = 0; k < 7; k++) { x.fillStyle = k % 2 ? '#3d8a3f' : '#5aa24a'; x.beginPath(); x.arc(bx + bw * (.12 + k * .13), H - 40, 11 + (k % 3) * 3, 0, 7); x.fill(); }
    }
  }
  const t = tex(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}

// ---------- the towers ----------
const towers = new THREE.Group();
const ROT = 1.03;
const [TX, TZ] = px2w(870, 1060);
towers.position.set(TX, 0, TZ); towers.rotation.y = ROT; scene.add(towers);

const FLOORS = 14, FH = 3.2, BASE = 6.4, LEN = 48, DEP = 24, GAP = 34;
const fLong = facadeTexture('long'); fLong.repeat.set(LEN / 21, FLOORS);
const fEnd = facadeTexture('end'); fEnd.repeat.set(DEP / 14 * 2, FLOORS);
const wallMat = new THREE.MeshStandardMaterial({ color: '#e8e3d8', roughness: .85 });
const longMat = new THREE.MeshStandardMaterial({ map: fLong, roughness: .55, metalness: .05, emissive: '#ffcf8a', emissiveMap: fLong, emissiveIntensity: .12 });
const endMat = new THREE.MeshStandardMaterial({ map: fEnd, roughness: .6, emissive: '#ffcf8a', emissiveMap: fEnd, emissiveIntensity: .1 });
const baseMat = new THREE.MeshStandardMaterial({ color: '#8d6f4b', roughness: .7 });
const glassMat = new THREE.MeshStandardMaterial({ color: '#7fb4d6', roughness: .08, metalness: .6, transparent: true, opacity: .85 });

function tower(zOff) {
  const g = new THREE.Group(); g.position.z = zOff;
  const body = new THREE.Mesh(new THREE.BoxGeometry(LEN, FLOORS * FH, DEP), [endMat, endMat, wallMat, wallMat, longMat, longMat]);
  body.position.y = BASE + FLOORS * FH / 2; body.castShadow = body.receiveShadow = true; g.add(body);
  const base = new THREE.Mesh(new THREE.BoxGeometry(LEN + 2, BASE, DEP + 2), baseMat); base.position.y = BASE / 2; base.castShadow = base.receiveShadow = true; g.add(base);
  const lobby = new THREE.Mesh(new THREE.BoxGeometry(14, BASE - .6, DEP + 2.4), glassMat); lobby.position.set(0, BASE / 2, 0); g.add(lobby);
  // crown: stepped parapet, rooftop garden, lift core and a lit band
  const top = BASE + FLOORS * FH;
  const crown = new THREE.Mesh(new THREE.BoxGeometry(LEN + 1.6, 1.4, DEP + 1.6), wallMat); crown.position.y = top + .7; crown.castShadow = true; g.add(crown);
  const lawn = new THREE.Mesh(new THREE.BoxGeometry(LEN - 6, .4, DEP - 6), new THREE.MeshStandardMaterial({ color: '#4f9a4a', roughness: 1 })); lawn.position.y = top + 1.5; g.add(lawn);
  const core = new THREE.Mesh(new THREE.BoxGeometry(8, 4.2, 8), wallMat); core.position.set(LEN / 2 - 9, top + 3.4, 0); core.castShadow = true; g.add(core);
  const band = new THREE.Mesh(new THREE.BoxGeometry(LEN + 1.7, .35, DEP + 1.7), new THREE.MeshBasicMaterial({ color: '#ffd9a0' })); band.position.y = top + 1.5; g.add(band);
  for (let i = 0; i < 9; i++) { const s = new THREE.Mesh(new THREE.IcosahedronGeometry(1.6 + (i % 3) * .5, 1), new THREE.MeshStandardMaterial({ color: '#2f7a3a', roughness: 1 })); s.position.set(-LEN / 2 + 6 + i * 4.6, top + 2.9, (i % 2 ? 4 : -4)); g.add(s); }
  return g;
}
// two blocks come from the Blender model (build_tower.py); fronts face outward
const glb = await new GLTFLoader().loadAsync('tower.glb');
function block(zOff, flip) {
  const w = new THREE.Group(); const m = glb.scene.clone(true); m.position.z = 2.5; w.add(m);
  m.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; if (o.material.opacity < 1) { o.material.transparent = true; o.material.depthWrite = false; o.castShadow = false; } } });
  w.position.z = zOff; if (flip) w.rotation.y = Math.PI; return w;
}
towers.add(block(-GAP / 2 - DEP / 2, true), block(GAP / 2 + DEP / 2, false));
const bridge = new THREE.Mesh(new THREE.BoxGeometry(11, 5.2, GAP + 8), glassMat); bridge.position.set(0, BASE + 12 * FH, 0); bridge.castShadow = true; towers.add(bridge);
const bridgeFrame = new THREE.Mesh(new THREE.BoxGeometry(11.6, .7, GAP + 8.4), wallMat); bridgeFrame.position.set(0, BASE + 12 * FH + 2.9, 0); towers.add(bridgeFrame);

// ---------- landscaped compound ----------
const CW = 150, CD = 120;
function noiseCanvas(base, spots) {
  const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d');
  x.fillStyle = base; x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2600; i++) { x.fillStyle = spots[i % spots.length] + '55'; x.fillRect(Math.random() * 256, Math.random() * 256, 2 + Math.random() * 4, 2 + Math.random() * 4); }
  const t = tex(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
const lawnT = noiseCanvas('#5fa24c', ['#4c8f3e', '#76b85a', '#3f7d36']); lawnT.repeat.set(CW / 10, CD / 10);
const compound = new THREE.Mesh(new THREE.PlaneGeometry(CW, CD), new THREE.MeshStandardMaterial({ map: lawnT, roughness: 1, envMapIntensity: .25 }));
compound.rotation.x = -Math.PI / 2; compound.position.y = .12; compound.receiveShadow = true; towers.add(compound);
const deck = new THREE.Mesh(new THREE.BoxGeometry(LEN + 12, .3, GAP + DEP * 2 + 12), new THREE.MeshStandardMaterial({ color: '#cbbfa6', roughness: .9 })); deck.position.y = .2; deck.receiveShadow = true; towers.add(deck);
// driveway and paths
const road = new THREE.MeshStandardMaterial({ color: '#4a4a4c', roughness: .95 });
const drive = new THREE.Mesh(new THREE.BoxGeometry(9, .25, 62), road); drive.position.set(8, .22, DEP + GAP / 2 + 34); towers.add(drive);
const ring = new THREE.Mesh(new THREE.BoxGeometry(LEN + 24, .25, 8), road); ring.position.set(0, .22, DEP + GAP / 2 + 12 + 3); towers.add(ring);
// pool and deck, clubhouse
const poolDeck = new THREE.Mesh(new THREE.BoxGeometry(34, .3, 22), new THREE.MeshStandardMaterial({ color: '#d9cdb4', roughness: .9 })); poolDeck.position.set(-LEN / 2 - 26, .22, -4); poolDeck.receiveShadow = true; towers.add(poolDeck);
const pool = new THREE.Mesh(new THREE.BoxGeometry(26, .2, 11), new THREE.MeshStandardMaterial({ color: '#2aa7d9', roughness: .05, metalness: .5, emissive: '#0b5f86', emissiveIntensity: .35 })); pool.position.set(-LEN / 2 - 26, .4, -4); towers.add(pool);
const club = new THREE.Mesh(new THREE.BoxGeometry(24, 7, 14), [wallMat, wallMat, baseMat, wallMat, glassMat, wallMat]); club.position.set(-LEN / 2 - 26, 3.7, -24); club.castShadow = club.receiveShadow = true; towers.add(club);
// boundary wall and gate
const wallM = new THREE.MeshStandardMaterial({ color: '#d7cdb8', roughness: .9 });
[[0, -CD / 2, CW, .8], [0, CD / 2, CW, .8], [-CW / 2, 0, .8, CD], [CW / 2, 0, .8, CD]].forEach(([x, z, w, d]) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, 2.4, d), wallM); m.position.set(x, 1.2, z); m.castShadow = true; towers.add(m); });
const gate = new THREE.Mesh(new THREE.BoxGeometry(14, 5, 1.6), baseMat); gate.position.set(8, 2.5, CD / 2); towers.add(gate);
const gateGap = new THREE.Mesh(new THREE.BoxGeometry(9, 4.4, 1.8), new THREE.MeshBasicMaterial({ color: '#000' })); gateGap.visible = false;

// ---------- trees ----------
const canopyGeo = new THREE.IcosahedronGeometry(1, 1), trunkGeo = new THREE.CylinderGeometry(.12, .18, 1, 6);
const canopyMat = new THREE.MeshStandardMaterial({ roughness: 1, envMapIntensity: .25 });
const trunkMat = new THREE.MeshStandardMaterial({ color: '#5a4630', roughness: 1 });
const treeGlb = await new GLTFLoader().loadAsync('trees.glb');
const treeGeo = {}; treeGlb.scene.traverse(o => { if (o.isMesh) treeGeo[o.name] = o; });
const treeKeys = Object.keys(treeGeo).filter(k => k.startsWith('tree'));
function plantReal(list) {
  const buckets = treeKeys.map(() => []); list.forEach(t => buckets[Math.floor(Math.random() * treeKeys.length)].push(t));
  buckets.forEach((b, k) => {
    const src = treeGeo[treeKeys[k]];
    const mat = src.material.clone(); mat.roughness = .9; mat.envMapIntensity = .25; mat.color.set('#ffffff');
    const im = new THREE.InstancedMesh(src.geometry, mat, b.length), m = new THREE.Matrix4(), q = new THREE.Quaternion();
    b.forEach(([x, z, h], i) => { q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * 6.28); const s = h / 8.5; m.compose(new THREE.Vector3(x, 0, z), q, new THREE.Vector3(s, s * (.9 + Math.random() * .25), s)); im.setMatrixAt(i, m); });
    im.castShadow = true; im.receiveShadow = true; scene.add(im);
  });
}
function plant(list, label) {
  const n = list.length;
  const can = new THREE.InstancedMesh(canopyGeo, canopyMat, n), trk = new THREE.InstancedMesh(trunkGeo, trunkMat, n);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), col = new THREE.Color();
  list.forEach(([x, z, h], i) => {
    const w = h * (.38 + Math.random() * .12);
    m.compose(new THREE.Vector3(x, h * .38 + h * .3, z), q, new THREE.Vector3(w, h * .34, w)); can.setMatrixAt(i, m);
    col.setHSL(.29 + Math.random() * .06, .55 + Math.random() * .2, .2 + Math.random() * .1); can.setColorAt(i, col);
    m.compose(new THREE.Vector3(x, h * .2, z), q, new THREE.Vector3(1, h * .42, 1)); trk.setMatrixAt(i, m);
  });
  can.castShadow = trk.castShadow = true; can.receiveShadow = true; scene.add(can, trk);
}
const rnd = (a, b) => a + Math.random() * (b - a);

// ---------- build everything once imagery is ready ----------
let ready;
(async function init() {
  prog(10);
  const [siteImg, cityImg] = await Promise.all([loadImg('site.jpg'), loadImg('city.jpg')]);
  prog(45);
  const site = grade(siteImg, 2048, 0), city = grade(cityImg, 2048, 0);
  prog(65);
  const cityMesh = new THREE.Mesh(new THREE.PlaneGeometry(CITY, CITY), new THREE.MeshBasicMaterial({ map: tex(city.canvas), fog: true }));
  cityMesh.rotation.x = -Math.PI / 2; cityMesh.position.y = -.6; scene.add(cityMesh);
  const siteMat = new THREE.MeshStandardMaterial({ map: tex(site.canvas), alphaMap: radialAlpha(), transparent: true, roughness: 1, metalness: 0, envMapIntensity: .2 });
  const siteMesh = new THREE.Mesh(new THREE.PlaneGeometry(SITE, SITE), siteMat);
  siteMesh.rotation.x = -Math.PI / 2; siteMesh.receiveShadow = true; scene.add(siteMesh);

  // trees: scattered on vegetation seen in the imagery near the site, plus formal planting in the compound
  const list = [], P = site.data;
  for (let t = 0; t < 9000 && list.length < (small ? 650 : 1600); t++) {
    const x = rnd(-560, 560), z = rnd(-560, 560);
    const ix = Math.floor(x / SITE * 2048 + 1024), iy = Math.floor(z / SITE * 2048 + 1024), o = (iy * 2048 + ix) * 4;
    const r = P[o], g = P[o + 1], b = P[o + 2];
    if (g > r * .98 && g > b * 1.1 && g < 170 && Math.hypot(x - TX, z - TZ) > 95) list.push([x, z, rnd(5.5, 10)]);
  }
  const nearT = list.filter(t => Math.hypot(t[0] - TX, t[1] - TZ) < 300), farT = list.filter(t => Math.hypot(t[0] - TX, t[1] - TZ) >= 300);
  plant(farT); plantReal(nearT);
  // compound trees in local frame -> world
  const cl = [], cs = Math.sin(ROT), cc = Math.cos(ROT), toW = (lx, lz) => [TX + lx * cc + lz * cs, TZ - lx * cs + lz * cc];
  for (let i = 0; i < 40; i++) { const lx = -CW / 2 + 6 + i * (CW - 12) / 39; [[lx, -CD / 2 + 5], [lx, CD / 2 - 5]].forEach(([a, b]) => { const w = toW(a, b); cl.push([w[0], w[1], rnd(7, 10)]); }); }
  for (let i = 0; i < 16; i++) { [[-CW / 2 + 5, -CD / 2 + 8 + i * 6.5], [CW / 2 - 5, -CD / 2 + 8 + i * 6.5]].forEach(([a, b]) => { const w = toW(a, b); cl.push([w[0], w[1], rnd(7, 10)]); }); }
  for (let i = 0; i < 70; i++) { const w = toW(rnd(-CW / 2 + 10, CW / 2 - 10), rnd(-CD / 2 + 10, CD / 2 - 10)); const lx = (w[0] - TX) * cc - (w[1] - TZ) * cs, lz = (w[0] - TX) * cs + (w[1] - TZ) * cc; if (Math.abs(lx) < LEN / 2 + 8 && Math.abs(lz) < GAP / 2 + DEP + 8) continue; cl.push([w[0], w[1], rnd(4, 7)]); }
  plantReal(cl);

  // soft clouds that you pass through on the way down
  const cc2 = document.createElement('canvas'); cc2.width = cc2.height = 256; const cx = cc2.getContext('2d');
  const gr = cx.createRadialGradient(128, 128, 0, 128, 128, 128); gr.addColorStop(0, '#fffffff0'); gr.addColorStop(.5, '#ffffff70'); gr.addColorStop(1, '#ffffff00'); cx.fillStyle = gr; cx.fillRect(0, 0, 256, 256);
  const cloudT = new THREE.CanvasTexture(cc2);
  window.clouds = new THREE.Group();
  for (let i = 0; i < 46; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudT, transparent: true, opacity: .85, depthWrite: false, fog: false }));
    const sz = rnd(500, 1300); s.scale.set(sz, sz * .45, 1); s.position.set(rnd(-2600, 2600), rnd(750, 1500), rnd(-2600, 2600)); clouds.add(s);
  }
  scene.add(clouds);

  prog(100);
  ready = true;
  setTimeout(() => { $('#load').style.opacity = 0; setTimeout(() => $('#load').remove(), 900); }, 250);
  go(reduced ? 'site' : 'tower');
  if(parent!==window)parent.postMessage({divine:'ready'},location.origin);
})().catch(error => { window.dispatchEvent(new CustomEvent('explorer-error',{detail:error.message})); });

// ---------- camera, presets, drone path ----------
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.dampingFactor = .07;
controls.minDistance = 25; controls.maxDistance = 3500; controls.maxPolarAngle = 1.46;
controls.screenSpacePanning = false; controls.zoomSpeed = .9; controls.panSpeed = .8;
const centre = new THREE.Vector3(TX, 24, TZ);
const V = {
  city: { p: [TX + 900, 640, TZ + 1250], t: [TX, 0, TZ] },
  site: { p: [TX + 210, 120, TZ + 250], t: [TX, 26, TZ] },
  tower: { p: [TX + 62, 20, TZ + 98], t: [TX, 30, TZ] },
  top: { p: [TX + 1, 430, TZ + 4], t: [TX, 0, TZ] },
};
camera.position.set(...V.city.p); controls.target.set(...V.city.t);
let tween = null, mode = null, t0 = 0;
const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const bar = $('#bar');
function mark(v) { bar.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === v)); }
const fbox = $('#floorbox'), fr = $('#fr');
function floorView() {
  const fl = +fr.value, y = BASE + (fl - 1) * FH + 1.6;
  $('#fl').textContent = `Block ${selectedBlock} · Floor ${fl}`;
  const side=selectedBlock==='A'?-1:1;
  const p = towers.localToWorld(new THREE.Vector3(12, y, side*(GAP / 2 + DEP / 2 + 12.6))), t = towers.localToWorld(new THREE.Vector3(12, y - 1.5, side*(GAP / 2 + DEP / 2 + 160)));
  return { p: [p.x, p.y, p.z], t: [t.x, t.y, t.z] };
}
fr.addEventListener('input', () => { updateBand(); if(parent!==window)parent.postMessage({divine:'floor',floor:+fr.value},location.origin); if (mode === null && fbox.hidden === false) { const v = floorView(); camera.position.set(...v.p); controls.target.set(...v.t); tween = null; } });
function go(v) {
  mark(v); fbox.hidden = v !== 'floor'; controls.minDistance = v === 'floor' ? 1 : 25;
  if (v === 'floor') V.floor = floorView();
  if (v === 'drone' && reduced) v='site';
  if (v === 'drone') { mode = 'drone'; t0 = performance.now(); controls.enabled = false; return; }
  mode = null; controls.enabled = true;
  const to = V[v];
  tween = { t: 0, dur: reduced ? .001 : 1.4, p0: camera.position.clone(), t0: controls.target.clone(), p1: new THREE.Vector3(...to.p), t1: new THREE.Vector3(...to.t) };
}
bar.addEventListener('click', e => { const b = e.target.closest('button'); if (b && ready) go(b.dataset.v); });
function stop() { if (mode === 'drone' || tween) { mode = null; tween = null; controls.enabled = true; if (fbox.hidden) mark(''); } $('#hint').style.opacity = 0; }
renderer.domElement.addEventListener('pointerdown', stop); renderer.domElement.addEventListener('wheel', stop, { passive: true });

// drone: from above the clouds, spiralling down to a slow orbit around the towers
const DUR = 13;
function drone(tm) {
  const s = Math.min(tm / DUR, 1), e = ease(s);
  const h = 2300 * Math.pow(1 - e, 2.2) + 95, rad = 1900 * Math.pow(1 - e, 1.8) + 215;
  const a = 2.2 - e * 2.6 + Math.max(0, tm - DUR) * .06;
  camera.position.set(TX + Math.cos(a) * rad, h, TZ + Math.sin(a) * rad);
  controls.target.set(TX, 22 * e, TZ);
  if (s >= 1) { controls.enabled = true; mode = null; mark('site'); }
}

// ---------- labels ----------
const labels = [
  ['Block A', TX, 62, TZ, 0], ['Block B', TX, 62, TZ, 1], ['Swimming pool', 0, 2, 0, 2], ['CA Circle', TX - 56, 12, TZ - 309, 3], ['200 Feet Ring Road', TX + 0, 8, TZ - 250, 4],
];
const lw = a => { const c = Math.cos(ROT), s = Math.sin(ROT); return [TX + a[0] * c + a[1] * s, TZ - a[0] * s + a[1] * c]; };
const lp = labels.map((l, i) => {
  const el = document.createElement('div'); el.className = 'tag'; el.textContent = l[0]; $('#tags').appendChild(el);
  let w = [l[1], l[2], l[3]];
  if (i === 0) w = [...lw([0, -GAP / 2 - DEP / 2]).flatMap((v, k) => k ? [62, v] : [v])].slice(0, 3); // fixed below
  return { el, l, i };
});
const wp = [
  () => { const p = lw([0, -GAP / 2 - DEP / 2]); return new THREE.Vector3(p[0], 62, p[1]); },
  () => { const p = lw([0, GAP / 2 + DEP / 2]); return new THREE.Vector3(p[0], 62, p[1]); },
  () => { const p = lw([-LEN / 2 - 26, -4]); return new THREE.Vector3(p[0], 6, p[1]); },
  () => new THREE.Vector3(TX - 56, 10, TZ - 309),
  () => new THREE.Vector3(TX + 20, 8, TZ - 250),
];
const tmpv = new THREE.Vector3();

// ---------- loop ----------
const clock = new THREE.Clock();
let last = 0;
function frame() {
  requestAnimationFrame(frame);
  if(!activeView || document.hidden){clock.getDelta();return;}
  if (!ready) { renderer.render(scene, camera); return; }
  const dt = clock.getDelta();
  if (mode === 'drone') drone((performance.now() - t0) / 1000);
  if (tween) {
    tween.t += dt / tween.dur; const e = ease(Math.min(tween.t, 1));
    camera.position.lerpVectors(tween.p0, tween.p1, e); controls.target.lerpVectors(tween.t0, tween.t1, e);
    if (tween.t >= 1) tween = null;
  }
  // keep the view near the project and above ground
  if (fbox.hidden) {
    controls.target.x = Math.max(TX - 700, Math.min(TX + 700, controls.target.x));
    controls.target.z = Math.max(TZ - 700, Math.min(TZ + 700, controls.target.z));
    controls.target.y = Math.max(0, Math.min(60, controls.target.y));
  }
  if (camera.position.y < 4) camera.position.y = 4;
  if (!fbox.hidden) controls.maxDistance = 14; else controls.maxDistance = 3500;
  controls.update();
  // clouds fade as we drop below them
  if (window.clouds) window.clouds.children.forEach(s => { s.material.opacity = Math.max(0, Math.min(.85, (camera.position.y - 500) / 500)); s.position.x += dt * 6; if (s.position.x > 2700) s.position.x = -2700; });
  // labels
  const near = camera.position.distanceTo(centre) < 700;
  wp.forEach((f, i) => {
    const el = lp[i].el; const v = f().project(camera);
    const on = near && v.z < 1 && Math.abs(v.x) < 1.05 && Math.abs(v.y) < 1.05 && (i < 3 || (camera.position.y > 160 && camera.position.distanceTo(f()) < 900));
    el.style.opacity = on ? 1 : 0; el.style.left = (v.x * .5 + .5) * innerWidth + 'px'; el.style.top = (-v.y * .5 + .5) * innerHeight + 'px';
  });
  composer.render();
}
frame();

addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });
$('#enter').onclick = () => { if (parent !== window) parent.postMessage({ divine: 'enter' }, location.origin); else location.href = '../#picker'; };
const bandMesh=new THREE.Mesh(new THREE.BoxGeometry(LEN+2,.55,DEP+2),new THREE.MeshBasicMaterial({color:'#f2dcaa',transparent:true,opacity:.7,depthWrite:false}));towers.add(bandMesh);
function updateBand(){bandMesh.position.set(0,BASE+(+fr.value-.5)*FH,(selectedBlock==='A'?-1:1)*(GAP/2+DEP/2));$('#fl').textContent=`Block ${selectedBlock} · Floor ${fr.value}`;}
updateBand();
addEventListener('message',e=>{if(e.origin!==location.origin||e.source!==parent||e.data?.divine!=='selection')return;const d=e.data;selectedBlock=d.block==='B'?'B':'A';selectedPlan=typeof d.plan==='string'?d.plan:'A-103';fr.value=Math.min(14,Math.max(1,Number(d.floor)||1));if(typeof d.active==='boolean')activeView=d.active;updateBand();if(!fbox.hidden&&ready)go('floor');$('#enter').textContent='Explore home';});
addEventListener('keydown',e=>{if(e.key==='Escape'&&parent!==window)parent.postMessage({divine:'close'},location.origin);});
$('#lightMode').onchange=e=>{const night=e.target.value==='evening';sun.intensity=night?.45:2.2;renderer.toneMappingExposure=night?.65:.82;sky.material.uniforms.top.value.set(night?'#101b3b':'#2f5d9c');sky.material.uniforms.mid.value.set(night?'#566083':'#9cc3e6');sky.material.uniforms.hor.value.set(night?'#c8a187':'#dfe6e8');scene.fog.color.set(night?'#8a8192':'#dfe6e8');};

window.__r = { renderer, composer, camera, controls, go, towers, TX, TZ, scene, THREE };
