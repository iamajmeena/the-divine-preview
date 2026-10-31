# Blender 5.x script: builds one Divine tower block and exports explore/tower.glb
# Run: blender --background --python build_tower.py
import bpy, bmesh, math, random, os
from mathutils import Vector, Matrix

random.seed(7)
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'tower.glb')
bpy.ops.wm.read_factory_settings(use_empty=True)

# ---------- materials ----------
def mat(name, color, rough=.6, metal=0, emit=None, emit_k=0, alpha=1):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*color, 1)
    b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal
    if emit: b.inputs['Emission Color'].default_value = (*emit, 1); b.inputs['Emission Strength'].default_value = emit_k
    if alpha < 1: b.inputs['Alpha'].default_value = alpha
    return m
srgb = lambda h: tuple(((int(h[i:i + 2], 16) / 255) ** 2.2) for i in (1, 3, 5))
M = {
    'wall': mat('wall', srgb('#ece8de'), .85),
    'slab': mat('slab', srgb('#f6f3ec'), .7),
    'under': mat('under', srgb('#b98f5a'), .6),
    'fin': mat('fin', srgb('#fbf9f4'), .6),
    'glass': mat('glass', srgb('#27445f'), .12, .4, emit=srgb('#ffb35c'), emit_k=.55),
    'glassdim': mat('glassdim', srgb('#1d3248'), .1, .5, emit=srgb('#ffcf8a'), emit_k=.12),
    'rail': mat('rail', srgb('#c9e6f4'), .05, .2, alpha=.35),
    'frame': mat('frame', srgb('#2a2927'), .5, .6),
    'plant': mat('plant', srgb('#2f7d3a'), .95),
    'plant2': mat('plant2', srgb('#4fa24a'), .95),
    'pot': mat('pot', srgb('#8b6a45'), .8),
    'wood': mat('wood', srgb('#8a5a33'), .55),
    'stone': mat('stone', srgb('#a89a84'), .85),
    'led': mat('led', srgb('#fff0d0'), .4, emit=srgb('#ffd9a0'), emit_k=4),
    'roof': mat('roof', srgb('#6f7a73'), .9),
}
B = {k: bmesh.new() for k in M}

def box(k, c, s, rz=0):
    bm = B[k]; r = bmesh.ops.create_cube(bm, size=1.0)
    verts = r['verts']
    bmesh.ops.scale(bm, vec=Vector(s), verts=verts)
    if rz: bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=Matrix.Rotation(rz, 3, 'Z'), verts=verts)
    bmesh.ops.translate(bm, vec=Vector(c), verts=verts)

def sphere(k, c, r, squash=1):
    bm = B[k]; res = bmesh.ops.create_icosphere(bm, subdivisions=1, radius=r)
    bmesh.ops.scale(bm, vec=Vector((1, 1, squash)), verts=res['verts'])
    bmesh.ops.translate(bm, vec=Vector(c), verts=res['verts'])

def prism(k, pts, z0, z1):
    """extrude a 2D polygon (counter-clockwise list of (x,y)) from z0 to z1"""
    bm = B[k]
    vs = [bm.verts.new((x, y, z0)) for x, y in pts]
    f = bm.faces.new(vs)
    ex = bmesh.ops.extrude_face_region(bm, geom=[f])
    nv = [e for e in ex['geom'] if isinstance(e, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, vec=Vector((0, 0, z1 - z0)), verts=nv)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))

def rounded_slab(x0, x1, yb, yf, r, z0, z1, k='slab'):
    """slab from back y=yb to front y=yf (yf < yb, front is -Y), front corners rounded with radius r"""
    pts = [(x0, yb), (x0, yf + r)]
    for i in range(1, 9):
        a = math.pi / 2 * i / 8
        pts.append((x0 + r - r * math.cos(a), yf + r - r * math.sin(a)))
    for i in range(0, 9):
        a = math.pi / 2 * i / 8
        pts.append((x1 - r + r * math.sin(a), yf + r - r * math.cos(a)))
    pts.append((x1, yb))
    pts = [pts[0]] + pts[1:]
    prism(k, pts, z0, z1)

# ---------- dimensions (metres, Z up, front faces -Y) ----------
FH, BASE, FL = 3.2, 6.4, 14
YB, YW = 11.0, -6.0          # back wall y, front wall y (windows sit here)
wings = [  # name, x0, x1, floors, projection (balcony depth beyond YW), round radius, bay count
    ('L', -23.0, -8.0, 12, 2.2, 0.0, 4),
    ('C', -8.0, 8.0, 14, 2.4, 0.0, 4),
    ('R', 8.0, 23.0, 14, 3.4, 2.4, 4),
]
TOP = BASE + FL * FH

# podium
box('stone', (0, 2.5, BASE / 2), (47, 25.5, BASE))
box('wood', (0, -10.5, BASE / 2 - .4), (40, .6, BASE - 1.2))
for x in range(-18, 19, 4): box('frame', (x, -10.9, BASE / 2 - .6), (.3, .3, BASE - 1.8))
box('glass', (0, -10.7, BASE / 2 - .5), (38, .15, BASE - 2.2))
box('slab', (0, -12.5, BASE - .3), (16, 5.5, .6))                      # entrance portico
for x in (-6.5, 6.5): box('fin', (x, -14.5, BASE / 2 - .3), (.8, .8, BASE - .6))
box('led', (0, -15.2, BASE - .65), (16, .1, .12))

for name, x0, x1, nf, proj, rad, bays in wings:
    w = x1 - x0; cx = (x0 + x1) / 2
    top_h = BASE + nf * FH
    box('wall', (cx, (YB + YW) / 2, (BASE + top_h) / 2), (w, YB - YW, top_h - BASE))
    bw = w / bays
    for f in range(nf):
        z = BASE + f * FH
        # cantilevered balcony slab
        yf = YW - proj
        if rad > 0: rounded_slab(x0 + .3, x1 - .3, YW + .1, yf, rad, z, z + .32)
        else: box('slab', (cx, (YW + .1 + yf) / 2, z + .16), (w - .6, proj + .1, .32))
        box('under', (cx, (YW + yf) / 2 + .3, z - .02), (w - 1.4, proj - .6, .06))
        # glass railing (front + sides) and top rail
        if rad > 0:
            for i in range(9):
                a = math.pi / 2 * i / 8
                for sx in (-1, 1):
                    px = (x1 - .3 - rad + rad * math.sin(a)) if sx > 0 else (x0 + .3 + rad - rad * math.sin(a))
                    py = yf + rad - rad * math.cos(a)
                    box('rail', (px, py + .15, z + .32 + .5), (rad * math.pi / 16 + .05, .05, 1.0), rz=(-a if sx > 0 else a))
            box('rail', (cx, yf + .15, z + .82), (w - 2 * rad, .05, 1.0))
        else:
            box('rail', (cx, yf + .1, z + .82), (w - .8, .05, 1.0))
            box('rail', (x0 + .4, (YW + yf) / 2, z + .82), (.05, proj, 1.0)); box('rail', (x1 - .4, (YW + yf) / 2, z + .82), (.05, proj, 1.0))
        box('fin', (cx, yf + .1, z + 1.35), (w - .8, .08, .08))
        # windows / sliding doors in each bay + vertical fins
        for b in range(bays):
            bx = x0 + bw * (b + .5)
            lit = random.random() < .62
            box('glass' if lit else 'glassdim', (bx, YW - .04, z + FH / 2 + .1), (bw * .62, .08, 2.3))
            box('frame', (bx, YW - .1, z + FH / 2 + .1), (.07, .06, 2.3))
            box('frame', (bx, YW - .1, z + .35 + .1), (bw * .62 + .06, .06, .07)); box('frame', (bx, YW - .1, z + 2.55 + .1), (bw * .62 + .06, .06, .07))
            if name == 'L' and random.random() < .8:     # planters with greenery on the left wing
                px = bx + (random.random() - .5) * bw * .4
                box('pot', (px, yf + .55, z + .62), (bw * .55, .5, .6))
                for q in range(4): sphere('plant' if q % 2 else 'plant2', (px + (q - 1.5) * bw * .13, yf + .55 + (random.random() - .5) * .15, z + 1.15 + random.random() * .12), .42 + random.random() * .12, .75)
        for b in range(bays + 1):
            fx = x0 + bw * b
            box('fin', (fx, (YW + yf) / 2 + .1, z + FH / 2 + .18), (.22, proj, FH - .4))
        # rear windows (smaller)
        for b in range(bays):
            bx = x0 + bw * (b + .5)
            box('glassdim', (bx, YB + .04, z + FH / 2 + .1), (bw * .4, .08, 1.6))
    # roof parapet band + rooftop planting
    box('wall', (cx, (YB + YW) / 2 - .5, top_h + .55), (w + .6, YB - YW + 4 + proj, 1.1)) if False else None
    if rad > 0:
        rounded_slab(x0 - .2, x1 + .2, YB + .4, YW - proj - .5, rad + .4, top_h, top_h + .6)   # swooping roof canopy slab
        box('led', (cx, YW - proj - .55, top_h + .3), (w - 2 * rad, .1, .14))
    else:
        box('slab', (cx, (YB + YW) / 2 - 1, top_h + .35), (w + .8, YB - YW + proj + 2.4, .7))
        box('led', (cx, YW - proj - .25, top_h + .35), (w + .6, .08, .12))
    box('plant2', (cx, (YB + YW) / 2 - 1, top_h + .85), (w - 3, YB - YW - 2, .5))
    for i in range(6): sphere('plant', (x0 + 2 + i * (w - 4) / 5, YW + 3 + (i % 2) * 6, top_h + 1.4), .9 + random.random() * .5, .8)

# central arched tall recess (the white vertical feature)
box('fin', (0, YW - 2.9, (BASE + TOP) / 2 + 1.5), (2.2, .5, TOP - BASE + 3))
box('glassdim', (0, YW - 3.2, (BASE + TOP) / 2 + 1.5), (1.4, .1, TOP - BASE - 1.2))
bm = B['fin']; cyl = bmesh.ops.create_cone(bm, cap_ends=True, segments=24, radius1=1.1, radius2=1.1, depth=.5)
bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi / 2, 3, 'X'), verts=cyl['verts'])
bmesh.ops.translate(bm, vec=Vector((0, YW - 2.9, TOP + 3.0)), verts=cyl['verts'])
for yy in (YW - 3.2,): box('led', (0, yy - .02, (BASE + TOP) / 2 + 1.5), (.12, .06, TOP - BASE - 1))
# lift core and water tank on roof
box('wall', (-2, YB - 4, TOP + 2.6), (7, 7, 5.2)); box('slab', (-2, YB - 4, TOP + 5.35), (7.6, 7.6, .3))
box('roof', (6, YB - 3, TOP + 1.7), (4, 4, 2.4))

# ---------- build the object and export ----------
obj_mesh = bpy.data.meshes.new('tower'); obj = bpy.data.objects.new('tower', obj_mesh)
bpy.context.collection.objects.link(obj)
# merge all bmeshes into one mesh with material slots
merged = bmesh.new(); slot = {}
for i, (k, bm) in enumerate(B.items()):
    obj.data.materials.append(M[k]); slot[k] = i
for k, bm in B.items():
    tmp = bpy.data.meshes.new('t'); bm.to_mesh(tmp)
    vm = {}
    for v in tmp.vertices: vm[v.index] = merged.verts.new(v.co)
    for p in tmp.polygons:
        try:
            f = merged.faces.new([vm[i] for i in p.vertices]); f.material_index = slot[k]; f.smooth = False
        except ValueError: pass
    bpy.data.meshes.remove(tmp)
merged.normal_update()
merged.to_mesh(obj_mesh); merged.free()
for bm in B.values(): bm.free()
bpy.context.view_layer.objects.active = obj; obj.select_set(True)
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_apply=True, export_yup=True, export_materials='EXPORT', export_cameras=False, export_lights=False)
print('EXPORTED', OUT, os.path.getsize(OUT) // 1024, 'KB', len(obj.data.polygons), 'faces')
