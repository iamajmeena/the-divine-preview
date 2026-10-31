# Blender 5.x: photoreal (Cycles) fly-in over the real site imagery down to The Divine.
# Run: blender --background --python render_scene.py -- <first_frame> <last_frame> [step] [res_x]
# Output: D:/claude/Real state deal/blender_render/f/NNNN.png
import bpy, bmesh, math, os, random, sys
from mathutils import Vector, Matrix, Euler
import json

args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
F0 = int(args[0]) if args else 1; F1 = int(args[1]) if len(args) > 1 else 1
STEP = int(args[2]) if len(args) > 2 else 1; RX = int(args[3]) if len(args) > 3 else 1280
ROOT = r'D:\claude\Real state deal'; HERE = os.path.join(ROOT, 'the-divine-demo', 'explore'); R = os.path.join(ROOT, 'blender_render')
NF = int(args[4]) if len(args) > 4 else 90
random.seed(11)
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene

# ---------- render settings ----------
sc.render.engine = 'CYCLES'
cy = sc.cycles; cy.samples = 40; cy.use_adaptive_sampling = True; cy.adaptive_threshold = .02
cy.use_denoising = True; cy.denoiser = 'OPENIMAGEDENOISE'; cy.max_bounces = 6; cy.diffuse_bounces = 3; cy.glossy_bounces = 4; cy.transparent_max_bounces = 8
try:
    p = bpy.context.preferences.addons['cycles'].preferences
    for t in ('OPTIX', 'CUDA'):
        try:
            p.compute_device_type = t; p.get_devices()
            if any(d.type == t for d in p.devices):
                for d in p.devices: d.use = d.type == t
                cy.device = 'GPU'; print('GPU', t); break
        except Exception as e: print('no', t, e)
except Exception as e: print('gpu setup failed', e)
sc.render.resolution_x = RX; sc.render.resolution_y = round(RX * 9 / 16); sc.render.resolution_percentage = 100
sc.render.image_settings.file_format = 'PNG'
sc.view_settings.view_transform = 'AgX'; BLUE = os.environ.get('BLUE') == '1'
ELEV = 3.5 if BLUE else 17
sc.view_settings.exposure = -0.6 if BLUE else -1.7

# ---------- sky (golden hour) + a little atmospheric haze ----------
w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True; nt = w.node_tree; nt.nodes.clear()
sky = nt.nodes.new('ShaderNodeTexSky'); sky.sky_type = 'MULTIPLE_SCATTERING'; sky.sun_elevation = math.radians(ELEV); sky.sun_rotation = math.radians(250)
sky.sun_size = math.radians(.6); sky.sun_intensity = 1.0; sky.air_density = 1.4; sky.altitude = 0
bg = nt.nodes.new('ShaderNodeBackground'); out = nt.nodes.new('ShaderNodeOutputWorld')
nt.links.new(sky.outputs[0], bg.inputs[0]); nt.links.new(bg.outputs[0], out.inputs[0])
vol = nt.nodes.new('ShaderNodeVolumeScatter'); vol.inputs['Density'].default_value = 0.00022; vol.inputs['Color'].default_value = (.85, .9, 1, 1)
#nt.links.new(vol.outputs[0], out.inputs['Volume'])
print('SKY', sky.sky_type, sky.sun_elevation, [o.name for o in sky.outputs])
sunl = bpy.data.lights.new('sun', 'SUN'); sunl.energy = 0.9 if BLUE else 2.6; sunl.angle = math.radians(.6); sunl.color = (1, .55, .32) if BLUE else (1, .86, .68)
suno = bpy.data.objects.new('sun', sunl); sc.collection.objects.link(suno); suno.rotation_euler = (math.radians(90 - ELEV), 0, math.radians(250 + 180))
bg.inputs['Strength'].default_value = 1.0

def principled(name, col, rough=.7, **kw):
    m = bpy.data.materials.new(name); m.use_nodes = True; b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = col; b.inputs['Roughness'].default_value = rough
    for k, v in kw.items(): b.inputs[k].default_value = v
    return m
def hexc(h, g=True):
    c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]; return tuple(x ** 2.2 for x in c) + (1,)

def image_plane(name, path, size, z):
    bpy.ops.mesh.primitive_plane_add(size=size, location=(0, 0, z)); o = bpy.context.active_object; o.name = name
    m = bpy.data.materials.new(name); m.use_nodes = True; t = m.node_tree; b = t.nodes['Principled BSDF']
    im = t.nodes.new('ShaderNodeTexImage'); im.image = bpy.data.images.load(path); im.extension = 'CLIP'
    t.links.new(im.outputs[0], b.inputs['Base Color']); b.inputs['Roughness'].default_value = 1; b.inputs['Specular IOR Level'].default_value = 0
    o.data.materials.append(m); return o, m, t, b
city, cm, ct, cb = image_plane('city', os.path.join(R, 'city_g.jpg'), 10854, -.6)
site, sm, st, sb = image_plane('site', os.path.join(R, 'site_g.jpg'), 1266, 0)
# fine ground detail so the aerial photo does not smear up close
nz = st.nodes.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 2600; nz.inputs['Detail'].default_value = 10; nz.inputs['Roughness'].default_value = .65
mixd = st.nodes.new('ShaderNodeMix'); mixd.data_type = 'RGBA'; mixd.blend_type = 'OVERLAY'; mixd.inputs[0].default_value = .45
st.links.new(tc_pre.outputs['UV'], nz.inputs['Vector']) if False else None
imn = [n for n in st.nodes if n.type == 'TEX_IMAGE'][0]
st.links.new(imn.outputs[0], mixd.inputs[6]); st.links.new(nz.outputs['Color'], mixd.inputs[7]); st.links.new(mixd.outputs[2], sb.inputs['Base Color'])
# soft edge: site tile melts into the city tile
tc = st.nodes.new('ShaderNodeTexCoord'); vm = st.nodes.new('ShaderNodeVectorMath'); vm.operation = 'DISTANCE'; vm.inputs[1].default_value = (.5, .5, 0)
mr = st.nodes.new('ShaderNodeMapRange'); mr.inputs[1].default_value = .36; mr.inputs[2].default_value = .5; mr.inputs[3].default_value = 1; mr.inputs[4].default_value = 0
tr = st.nodes.new('ShaderNodeBsdfTransparent'); mix = st.nodes.new('ShaderNodeMixShader'); so = st.nodes['Material Output']
st.links.new(tc.outputs['UV'], vm.inputs[0]); st.links.new(vm.outputs['Value'], mr.inputs[0]); st.links.new(mr.outputs[0], mix.inputs[0])
st.links.new(tr.outputs[0], mix.inputs[1]); st.links.new(sb.outputs[0], mix.inputs[2]); st.links.new(mix.outputs[0], so.inputs['Surface'])

# ---------- towers (from tower.glb), compound, pool ----------
SITE = 1266; px2w = lambda px, py: ((px - 1024) / 2048 * SITE, (py - 1024) / 2048 * SITE)
TX, TZ = px2w(870, 1060); ROT = 1.03
tw = bpy.data.objects.new('towers', None); sc.collection.objects.link(tw); tw.location = (TX, -TZ, 0); tw.rotation_euler = (0, 0, ROT)
def import_glb(path):
    before = set(bpy.data.objects); bpy.ops.import_scene.gltf(filepath=path)
    return [o for o in bpy.data.objects if o not in before]
tower_objs = import_glb(os.path.join(HERE, 'tower.glb'))
def mesh_of(objs): return [o for o in objs if o.type == 'MESH']
base = mesh_of(tower_objs)[0]
for o in tower_objs:
    if o.type == 'EMPTY' or o.parent is None and o is not base: pass
def place(src, loc, rotz, parent, name):
    o = src.copy(); o.data = src.data; o.name = name; sc.collection.objects.link(o); o.parent = parent; o.location = loc; o.rotation_euler = (0, 0, rotz); return o
# flatten any import hierarchy so the mesh carries world-space geometry
for o in tower_objs: o.parent = None if o.type == 'MESH' else o.parent
base.matrix_world = Matrix.Identity(4)
bpy.context.view_layer.update()

PH = os.path.join(R, 'ph')
def textured(name, folder, scale=.25, tint=None, rough_mul=1.0, bevel=.03):
    m = bpy.data.materials.get(name)
    if not m or not m.use_nodes: return
    t = m.node_tree; b = t.nodes['Principled BSDF']
    tc = t.nodes.new('ShaderNodeTexCoord'); mp = t.nodes.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (scale, scale, scale)
    t.links.new(tc.outputs['Object'], mp.inputs['Vector'])
    def img(fn, cs):
        n = t.nodes.new('ShaderNodeTexImage'); n.image = bpy.data.images.load(os.path.join(PH, folder, fn)); n.image.colorspace_settings.name = cs
        n.projection = 'BOX'; n.projection_blend = .2; t.links.new(mp.outputs[0], n.inputs[0]); return n
    d = img('Diffuse.jpg', 'sRGB'); r = img('Rough.jpg', 'Non-Color'); nm = img('nor_gl.jpg', 'Non-Color')
    if tint:
        mx = t.nodes.new('ShaderNodeMix'); mx.data_type = 'RGBA'; mx.blend_type = 'MULTIPLY'; mx.inputs[0].default_value = 1; mx.inputs[7].default_value = tint
        t.links.new(d.outputs[0], mx.inputs[6]); t.links.new(mx.outputs[2], b.inputs['Base Color'])
    else: t.links.new(d.outputs[0], b.inputs['Base Color'])
    t.links.new(r.outputs[0], b.inputs['Roughness'])
    nmap = t.nodes.new('ShaderNodeNormalMap'); t.links.new(nm.outputs[0], nmap.inputs['Color'])
    bv = t.nodes.new('ShaderNodeBevel'); bv.inputs['Radius'].default_value = bevel; t.links.new(nmap.outputs[0], bv.inputs['Normal']); t.links.new(bv.outputs[0], b.inputs['Normal'])
for n, c in (('wall', (1.5, 1.46, 1.38, 1)), ('slab', (1.7, 1.66, 1.58, 1)), ('fin', (1.8, 1.76, 1.68, 1))): textured(n, 'grey_plaster_02', .2, c)
textured('stone', 'concrete_wall_008', .12, (.85, .8, .72, 1))

# realistic glass and façade materials (override what the glTF carried)
def tune(name, **kw):
    m = bpy.data.materials.get(name)
    if not m or not m.use_nodes: return
    b = m.node_tree.nodes.get('Principled BSDF')
    for k, v in kw.items():
        if k in b.inputs: b.inputs[k].default_value = v
for n, es in (('glass', 2.2 if BLUE else .22), ('glassdim', .5 if BLUE else .02)):
    tune(n, **{'Base Color': (.012, .03, .055, 1), 'Metallic': .9, 'Roughness': .035, 'Emission Strength': es, 'Emission Color': (1, .72, .38, 1)})
tune('under', **{'Base Color': (.5, .46, .4, 1), 'Roughness': .8})
tune('rail', **{'Base Color': (.5, .7, .8, 1), 'Roughness': .02, 'Alpha': .22})

blockB = place(base, (0, -31.5, 0), 0, tw, 'blockB'); blockA = place(base, (0, 31.5, 0), math.pi, tw, 'blockA')
bpy.data.objects.remove(base)
def box(name, loc, size, mat, parent=tw):
    bpy.ops.mesh.primitive_cube_add(size=1); o = bpy.context.active_object; o.name = name; o.scale = size; o.parent = parent; o.location = loc; o.data.materials.append(mat); return o
glass = principled('bglass', hexc('#7fb4d6'), .05, **{'Metallic': .3, 'Alpha': .6})
wallm = principled('wall', hexc('#e8e3d8'), .85); roadm = principled('road', hexc('#4a4a4c'), .95); deckm = principled('deck', hexc('#cbbfa6'), .9)
stone = principled('cstone', hexc('#d7cdb8'), .9)
textured('cstone', 'concrete_wall_008', .1); textured('road', 'asphalt_floor', .12, (.55, .55, .55, 1), bevel=.0); textured('deck', 'grey_plaster_02', .15, (1.1, 1.05, .95, 1)); textured('wall.001', 'beige_wall_001', .22)
box('bridge', (0, 0, 44.8), (11, 42, 5.2), glass); box('bridgeframe', (0, 0, 47.7), (11.6, 42.4, .7), wallm)
BASEH = 6.4
# lawn with a bit of colour noise
lawn = box('lawn', (0, 0, .12), (150, 120, .1), principled('lawn', hexc('#5fa24c'), 1))
lm = lawn.data.materials[0]; ln = lm.node_tree; nz = ln.nodes.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = .5; nz.inputs['Detail'].default_value = 8
ramp = ln.nodes.new('ShaderNodeValToRGB'); ramp.color_ramp.elements[0].color = hexc('#4d7a3c'); ramp.color_ramp.elements[1].color = hexc('#82a860')
ln.links.new(nz.outputs[0], ramp.inputs[0]); ln.links.new(ramp.outputs[0], ln.nodes['Principled BSDF'].inputs['Base Color'])
box('deck', (0, 0, .2), (60, 94, .3), deckm)
box('drive', (8, -75, .22), (9, 62, .25), roadm); box('ringroad', (0, -56, .22), (72, 8, .25), roadm)
box('pooldeck', (-50, 4, .22), (34, 22, .3), principled('pd', hexc('#d9cdb4'), .9))
water = principled('water', hexc('#2aa7d9'), .02, **{'Specular IOR Level': 1, 'Emission Strength': .25}); water.node_tree.nodes['Principled BSDF'].inputs['Emission Color'].default_value = hexc('#0b8fc4')
box('pool', (-50, 4, .4), (26, 11, .2), water)
club = box('club', (-50, 24, 3.7), (24, 14, 7), wallm)
for nm, (x, y, sx, sy) in dict(wN=(0, 60, 150, .6), wS=(0, -60, 150, .6), wW=(-75, 0, .6, 120), wE=(75, 0, .6, 120)).items(): box(nm, (x, y, .8), (sx, sy, 1.6), stone)

# ---------- trees ----------
tree_objs = import_glb(os.path.join(HERE, 'trees.glb'))
tmesh = [o for o in tree_objs if o.type == 'MESH' and o.name.startswith('tree')]
for o in tmesh: o.parent = None; o.matrix_world = Matrix.Identity(4); o.hide_render = True; o.hide_viewport = True
for o in tree_objs:
    if o.type == 'MESH' and o.name.startswith('palm'): o.hide_render = True
# make leaf materials respect vertex colour (Principled base colour from the colour attribute)
for o in tmesh:
    for m in o.data.materials:
        if m and m.use_nodes:
            t = m.node_tree; b = t.nodes.get('Principled BSDF')
            if b and not b.inputs['Base Color'].is_linked:
                ca = t.nodes.new('ShaderNodeVertexColor'); ca.layer_name = o.data.color_attributes[0].name if o.data.color_attributes else 'Color'
                t.links.new(ca.outputs[0], b.inputs['Base Color'])
            if b: b.inputs['Roughness'].default_value = .9
PHT = []
def load_ph(name):
    before = set(bpy.data.objects); bpy.ops.import_scene.gltf(filepath=os.path.join(R, 'ph', name, name + '.gltf'))
    new = [o for o in bpy.data.objects if o not in before]; ms = [o for o in new if o.type == 'MESH']
    bpy.context.view_layer.update()
    for o in ms:
        mw = o.matrix_world.copy(); o.parent = None; o.matrix_world = mw
    for o in new:
        if o.type != 'MESH': bpy.data.objects.remove(o)
    bpy.ops.object.select_all(action='DESELECT')
    for o in ms: o.select_set(True)
    bpy.context.view_layer.objects.active = ms[0]
    if len(ms) > 1: bpy.ops.object.join()
    o = bpy.context.active_object; o.location = (0, 0, 0); o.rotation_euler = (0, 0, 0)
    bpy.context.view_layer.update(); o.hide_render = True; o.hide_viewport = True
    PHT.append((o, o.dimensions.z or 8))
for n in ('jacaranda_tree', 'island_tree_01'): load_ph(n)
PHN = [0]
def add_tree(x, y, h, i=0):
    if math.hypot(x - TX, y + TZ) < 230 and PHN[0] < 190 and random.random() < .6:
        PHN[0] += 1
        src, dz = PHT[random.randrange(len(PHT))]; o = src.copy(); o.data = src.data; o.hide_render = False; o.hide_viewport = False
        s = max(h, 6.5) / dz * 1.05; o.location = (x, y, 0); o.rotation_euler = (0, 0, random.random() * 6.28); o.scale = (s, s, s); sc.collection.objects.link(o); return
    src = tmesh[random.randrange(len(tmesh))]; o = src.copy(); o.data = src.data; o.hide_render = False; o.hide_viewport = False
    s = h / 8.5; o.location = (x, y, 0); o.rotation_euler = (0, 0, random.random() * 6.28); o.scale = (s, s, s * (.9 + random.random() * .25)); sc.collection.objects.link(o)
for x, y, h in json.load(open(os.path.join(R, 'trees.json'))): add_tree(x, y, h)
cs, cc = math.sin(ROT), math.cos(ROT)
def toW(lx, lz): return (TX + lx * cc + lz * cs, TZ - lx * cs + lz * cc)   # three-frame, z south
CW, CD, LEN, DEP, GAP = 150, 120, 48, 24, 34
for i in range(40):
    lx = -CW / 2 + 6 + i * (CW - 12) / 39
    for lz in (-CD / 2 + 5, CD / 2 - 5):
        wx, wz = toW(lx, lz); add_tree(wx, -wz, random.uniform(7, 10), 0)
for i in range(16):
    for lx in (-CW / 2 + 5, CW / 2 - 5):
        wx, wz = toW(lx, -CD / 2 + 8 + i * 6.5); add_tree(wx, -wz, random.uniform(7, 10), 0)
for i in range(90):
    lx, lz = random.uniform(-CW / 2 + 10, CW / 2 - 10), random.uniform(-CD / 2 + 10, CD / 2 - 10)
    if abs(lx) < LEN / 2 + 10 and abs(lz) < GAP / 2 + DEP + 10: continue
    wx, wz = toW(lx, lz); add_tree(wx, -wz, random.uniform(4, 7), 0)

# ---------- real roads from OpenStreetMap ----------
WID = {'primary': 17, 'primary_link': 8, 'tertiary': 10, 'secondary': 12, 'unclassified': 6, 'residential': 6, 'service': 4}
roadmat = principled('asph', (.2, .2, .2, 1), .85); textured('asph', 'asphalt_floor', .12, (.32, .32, .33, 1), bevel=0)
markm = principled('mark', (.9, .9, .85, 1), .6)
rb = bmesh.new(); mb = bmesh.new()
def ribbon(bmx, pts, w, z):
    L, Rr = [], []
    for i, (x, y) in enumerate(pts):
        x0, y0 = pts[max(i - 1, 0)]; x1, y1 = pts[min(i + 1, len(pts) - 1)]
        dx, dy = x1 - x0, y1 - y0; d = math.hypot(dx, dy) or 1; nx, ny = -dy / d * w / 2, dx / d * w / 2
        L.append(bmx.verts.new((x + nx, y + ny, z))); Rr.append(bmx.verts.new((x - nx, y - ny, z)))
    for i in range(len(pts) - 1):
        try: bmx.faces.new((L[i], L[i + 1], Rr[i + 1], Rr[i]))
        except ValueError: pass
def in_compound(x, y):
    dx, dy = x - TX, y + TZ; lx = dx * math.cos(ROT) + dy * math.sin(ROT); ly = -dx * math.sin(ROT) + dy * math.cos(ROT)
    return abs(lx) < 80 and abs(ly) < 65
for r_ in json.load(open(os.path.join(R, 'osm.json'))):
    if not r_['k'].startswith('road:'): continue
    typ = r_['k'][5:]; w_ = WID.get(typ, 5); seg = []
    for pt in r_['p'] + [None]:
        if pt is not None and not in_compound(pt[0], pt[1]): seg.append((pt[0], pt[1])); continue
        if len(seg) > 1:
            ribbon(rb, seg, w_, .16 if w_ < 10 else .2)
            if typ in ('primary', 'tertiary'): ribbon(mb, seg, .35, .24)
        seg = []
for bmx, nm, mt in ((rb, 'roads', roadmat), (mb, 'marks', markm)):
    me = bpy.data.meshes.new(nm); bmx.to_mesh(me); bmx.free(); me.materials.append(mt)
    ob = bpy.data.objects.new(nm, me); sc.collection.objects.link(ob)

# ---------- the real neighbourhood: buildings traced from the satellite imagery ----------
TINTS = [(1, .95, .85, 1), (.82, .9, 1, 1), (1, .86, .86, 1), (.86, .86, .86, 1), (1, .9, .7, 1)]
bmats = []
for i, c in enumerate(TINTS):
    m = principled('nb%d' % i, (.8, .78, .74, 1), .85); textured('nb%d' % i, 'beige_wall_001', .22, c, bevel=.0); bmats.append(m)
roofm = principled('nroof', (.3, .3, .29, 1), .95)
bm = bmesh.new(); BL = json.load(open(os.path.join(R, 'bld.json')))
for b in BL:
    pts = b['p']
    if sum(pts[i][0] * pts[(i + 1) % len(pts)][1] - pts[(i + 1) % len(pts)][0] * pts[i][1] for i in range(len(pts))) < 0: pts = pts[::-1]
    try:
        vs = [bm.verts.new((x, y, 0)) for x, y in pts]; f = bm.faces.new(vs)
        ex = bmesh.ops.extrude_face_region(bm, geom=[f]); nv = [e for e in ex['geom'] if isinstance(e, bmesh.types.BMVert)]
        bmesh.ops.translate(bm, vec=Vector((0, 0, b['h'])), verts=nv)
        for g in ex['geom']:
            if isinstance(g, bmesh.types.BMFace): g.material_index = 5 if g.normal.z > .5 else b['t']
        bm.faces.ensure_lookup_table()
    except ValueError: pass
bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
nmesh = bpy.data.meshes.new('nbhd'); bm.to_mesh(nmesh); bm.free()
for m in bmats + [roofm]: nmesh.materials.append(m)
for pl in nmesh.polygons:
    if pl.normal.z > .5: pl.material_index = 5
nb = bpy.data.objects.new('nbhd', nmesh); sc.collection.objects.link(nb)
# the lowest face of each prism sits at z=0 and is hidden by the ground

# ---------- camera path ----------
cam_d = bpy.data.cameras.new('cam'); cam_d.lens = 26; cam_d.clip_start = 1; cam_d.clip_end = 40000
cam = bpy.data.objects.new('cam', cam_d); sc.collection.objects.link(cam); sc.camera = cam
tgt = bpy.data.objects.new('tgt', None); sc.collection.objects.link(tgt)
tr = cam.constraints.new('TRACK_TO'); tr.target = tgt; tr.track_axis = 'TRACK_NEGATIVE_Z'; tr.up_axis = 'UP_Y'
ease = lambda t: 4 * t * t * t if t < .5 else 1 - pow(-2 * t + 2, 3) / 2
def pose(f):
    s = (f - 1) / (NF - 1); e = ease(s)
    h = 2300 * (1 - e) ** 2.2 + 38 * (1 - e) + 70 + 42 * e; rad = 1900 * (1 - e) ** 1.8 + 215
    a = 3.4 - e * 2.86
    cam.location = (TX + math.cos(a) * rad, -(TZ + math.sin(a) * rad), h); tgt.location = (TX, -TZ, 24 * e)
for f in range(F0, F1 + 1, STEP):
    pose(f); bpy.context.view_layer.update()
    sc.render.filepath = os.path.join(R, 'fb' if BLUE else 'f240', '%04d.png' % f)
    bpy.ops.render.render(write_still=True); print('RENDERED', f, flush=True)
