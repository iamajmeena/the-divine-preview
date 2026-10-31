# Blender 5.x: builds a few low-poly but organic trees (noisy lobed canopies, vertex colours) -> explore/trees.glb
# Run: blender --background --python build_trees.py
import bpy, bmesh, math, random, os
from mathutils import Vector, noise

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'trees.glb')
bpy.ops.wm.read_factory_settings(use_empty=True)
mat = bpy.data.materials.new('leaf'); mat.use_nodes = True
mat.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = .9

def hsv(h, s, v):
    import colorsys; r, g, b = colorsys.hsv_to_rgb(h, s, v); return (r ** 2.2, g ** 2.2, b ** 2.2, 1)

def make(name, seed, lobes, spread, size, hue, trunk_h, palm=False):
    random.seed(seed); bm = bmesh.new(); col = None
    cols = []
    def add_blob(c, r, hue_j, squash=.8):
        res = bmesh.ops.create_icosphere(bm, subdivisions=2, radius=r)
        for v in res['verts']:
            n = noise.noise(v.co * .9 + Vector((seed, seed, seed)))
            v.co *= (1 + n * .38)
            v.co.z *= squash
            v.co += c
        for v in res['verts']:
            cols.append((v.index, c, r, hue_j))
    # trunk
    r1, r2 = .38, .16
    cone = bmesh.ops.create_cone(bm, cap_ends=True, segments=7, radius1=r1, radius2=r2, depth=trunk_h)
    bmesh.ops.translate(bm, vec=Vector((0, 0, trunk_h / 2)), verts=cone['verts'])
    trunk_ids = {v.index for v in cone['verts']}
    if palm:
        for i in range(9):
            a = i / 9 * math.tau
            fr = bmesh.ops.create_cone(bm, cap_ends=False, segments=3, radius1=.5, radius2=.02, depth=4.6)
            for v in fr['verts']:
                v.co.x *= .25
                v.co.z -= 2.3
            rot = __import__('mathutils').Matrix.Rotation(1.15, 3, 'Y') @ __import__('mathutils').Matrix.Identity(3)
            for v in fr['verts']:
                v.co = __import__('mathutils').Matrix.Rotation(a, 3, 'Z') @ (rot @ v.co) + Vector((0, 0, trunk_h))
                trunk_ids.add(v.index)
                cols.append((v.index, Vector((0, 0, trunk_h)), 2.5, random.random()))
    else:
        for i in range(lobes):
            a = random.random() * math.tau; d = random.random() * spread
            c = Vector((math.cos(a) * d, math.sin(a) * d, trunk_h + size * (.55 + random.random() * .55) - d * .15))
            add_blob(c, size * (.55 + random.random() * .3), random.random())
    bm.verts.ensure_lookup_table()
    layer = bm.loops.layers.color.new('Color')
    colmap = {i: (c, r, hj) for i, c, r, hj in cols}
    for f in bm.faces:
        for l in f.loops:
            vi = l.vert.index
            if vi in colmap and not (vi in trunk_ids and not palm):
                c, r, hj = colmap[vi]
                h = (l.vert.co.z - (c.z - r)) / (2 * r + .001)            # 0 underside .. 1 top
                l[layer] = hsv(hue + (hj - .5) * .05, .66 - h * .14, .36 + h * .42)
            else:
                l[layer] = hsv(.07, .45, .34)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    me.materials.append(mat)
    me.color_attributes.active_color = me.color_attributes[0]; me.color_attributes.render_color_index = 0
    for p in me.polygons: p.use_smooth = True
    ob = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(ob); return ob

make('tree_a', 3, 7, 2.4, 2.6, .30, 3.0)
make('tree_b', 11, 6, 2.9, 2.3, .26, 2.4)
make('tree_c', 21, 8, 1.9, 2.2, .33, 3.8)
make('palm', 5, 0, 0, 0, .27, 7.0, palm=True)
# lay them side by side so the exporter keeps separate nodes
for i, o in enumerate(bpy.data.objects): o.location.x = i * 20
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_apply=True, export_yup=True, export_materials='EXPORT', export_vertex_color='ACTIVE')
print('EXPORTED', OUT, os.path.getsize(OUT) // 1024, 'KB')
