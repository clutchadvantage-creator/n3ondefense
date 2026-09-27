"""Rebuild authored RWG boss components with Blender --background --python.

One scene per pivot-centered component, orthographic RGBA renders. Game units:
40 pixels per Blender unit; runtime sprites use a 160px square. No runtime 3D.
"""
import bpy
import math
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'public/assets/bosses'
SOURCE = ROOT / 'assets-source/bosses'
OUT.mkdir(parents=True, exist_ok=True)
SOURCE.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)

def material(name, color, metallic=0.7, emission=0):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    p = m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Metallic'].default_value = metallic
    p.inputs['Roughness'].default_value = 0.34
    p.inputs['Emission Color'].default_value = (*color, 1)
    p.inputs['Emission Strength'].default_value = emission
    return m

steel = material('Titanium edges', (0.14, 0.22, 0.31))
dark = material('Recessed machinery', (0.026, 0.047, 0.070))
armor = material('Blue graphite armor', (0.085, 0.15, 0.21))
white = material('RWG ceramic', (0.63, 0.76, 0.8))
orange = material('Siege enamel', (0.28, 0.063, 0.008))
violet = material('Sovereign enamel', (0.10, 0.018, 0.25))
pink = material('Mauler enamel', (0.25, 0.011, 0.060))
glows = [material(n, c, 0.25, 2.5) for n, c in [
    ('Orange flux', (1, .23, .015)), ('Violet plasma', (.43, .12, 1)), ('Rose flux', (1, .025, .22))]]

def finish(obj, name, mat, bevel=0):
    obj.name = name
    obj.data.materials.append(mat)
    if bevel:
        m = obj.modifiers.new('Machined chamfer', 'BEVEL'); m.width = bevel; m.segments = 2
        obj.modifiers.new('Weighted normals', 'WEIGHTED_NORMAL')
    return obj

def box(name, loc, size, mat=armor, bevel=.04, angle=0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.object; o.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    o.rotation_euler.z = angle
    return finish(o, name, mat, bevel)

def cyl(name, loc, radius, depth, mat=steel, vertices=16):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=loc)
    return finish(bpy.context.object, name, mat, .015)

def strut(name, a, b, radius=.055, mat=steel):
    a, b = Vector(a), Vector(b)
    o = cyl(name, (a+b)/2, radius, (b-a).length, mat, 12)
    o.rotation_euler = (b-a).to_track_quat('Z', 'Y').to_euler()
    return o

def bolts(x, y, w, h, z):
    for sx in [-1, 1]:
        for sy in [-1, 1]: cyl('Captive hex bolt', (x+sx*w/2, y+sy*h/2, z), .032, .028, white, 6)

def panel(name, x, y, w, h, z, paint, glow):
    box(name+' rim', (x,y,z), (w,h,.16), steel)
    box(name+' enamel', (x,y,z+.095), (w-.07,h-.07,.07), paint, .025)
    bolts(x,y,w-.15,h-.15,z+.15)
    box(name+' seam', (x,y,z+.14), (max(.04,w-.23),.026,.015), glow, .005)
    # Recessed segmented armor and service fasteners remain readable in a small sprite.
    if w > .4 and h > .5:
        for j in range(3):
            box(name+' diagonal vent', (x-.12+j*.085,y+h*.28,z+.145), (.034,.16,.025), dark, .006, -.3)
        box(name+' lower inset', (x,y-h*.28,z+.145), (w*.55,.075,.018), dark, .009)
        box(name+' lower rim', (x,y-h*.28-.034,z+.16), (w*.55,.015,.014), steel, .003)

def new_scene(key):
    scene = bpy.data.scenes.new(key)
    bpy.context.window.scene = scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 16
    scene.cycles.use_denoising = True
    scene.render.resolution_x = scene.render.resolution_y = 384
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA'
    scene.view_settings.view_transform = 'Standard'
    world = bpy.data.worlds.new(key+' world'); world.use_nodes = True
    world.node_tree.nodes['Background'].inputs[0].default_value = (.3,.4,.55,1)
    world.node_tree.nodes['Background'].inputs[1].default_value = .35
    scene.world = world
    bpy.ops.object.camera_add(location=(0,0,8))
    scene.camera = bpy.context.object; scene.camera.data.type = 'ORTHO'; scene.camera.data.ortho_scale = 4
    for loc, power, size in [((-3,4,6),430,4), ((3,-2,4),190,3)]:
        bpy.ops.object.light_add(type='AREA', location=loc)
        o = bpy.context.object; o.data.energy = power; o.data.shape = 'DISK'; o.data.size = size
        o.rotation_euler = (Vector((0,0,0))-o.location).to_track_quat('-Z','Y').to_euler()
    scene.render.filepath = str(OUT / (key+'.png'))
    return scene

for kind, paint, glow in [('artillery',orange,glows[0]), ('storm-mage',violet,glows[1]), ('void-brawler',pink,glows[2])]:
    new_scene(kind+'-chassis')
    cyl('Drive bearing', (0,0,.12), .64, .24, dark)
    if kind == 'storm-mage':
        cyl('Generator housing', (0,0,.29), .62,.22,steel,12)
        cyl('Generator well', (0,0,.43), .48,.12,dark)
        cyl('Contained plasma', (0,0,.51), .28,.12,glow,20)
        for i in range(6):
            a=i*math.tau/6
            panel('Capacitor', math.cos(a)*.55,math.sin(a)*.55,.22,.35,.52,paint,glow)
            strut('Feed cable',(math.cos(a)*.32,math.sin(a)*.32,.50),(math.cos(a)*.54,math.sin(a)*.54,.55),.025,white)
        box('Forward emitter',(.63,0,.31),(.42,.29,.24),steel)
        box('Emitter aperture',(.85,0,.42),(.055,.2,.035),glow)
    else:
        panel('Back armor',-.25,0,.72,1.22,.35,paint,glow)
        panel('Front armor',.32,0,.48,.9,.43,paint,glow)
        box('Sensor visor',(.57,0,.51),(.085,.43,.13),dark)
        box('Sensor slit',(.60,0,.59),(.055,.35,.035),glow,.012)
        for sy in [-1,1]:
            box('Engine block',(-.42,sy*.59,.25),(.5,.23,.25),dark)
            for j in range(5): box('Cooling fin',(-.60+j*.085,sy*.59,.40),(.035,.20,.06),steel,.008)
        cyl('Service hatch',(-.28,0,.54),.2,.05,dark,12)
        cyl('Reactor monitor',(-.28,0,.58),.115,.035,glow,12)
    bpy.ops.render.render(write_still=True)

    new_scene(kind+'-leg')
    # Articulated shoulder, knee, twin piston and wide armored ground claw.
    cyl('Shoulder swivel',(0,0,.21),.16,.24,dark)
    cyl('Swivel cap',(0,0,.35),.11,.06,paint,8)
    strut('Femur',(0,0,.23),(.5,.13,.19),.10,dark)
    box('Femur armor',(.27,.06,.30),(.50,.21,.12),paint,.04,.22)
    cyl('Knee',(.54,.13,.21),.13,.21,steel)
    cyl('Knee locking hub',(.54,.13,.325),.095,.025,dark,12)
    cyl('Knee axle bolt',(.54,.13,.345),.042,.025,white,6)
    strut('Lower actuator',(.54,.13,.16),(.9,-.05,.10),.085,dark)
    strut('Exposed piston',(.16,-.07,.31),(.71,-.13,.20),.034,white)
    box('Stabilizer foot',(.95,-.05,.09),(.32,.28,.16),steel)
    box('Claw cap',(.97,-.05,.18),(.26,.21,.055),paint,.02)
    box('Foot running light',(1.06,-.05,.22),(.045,.17,.025),glow,.008)
    bpy.ops.render.render(write_still=True)

new_scene('artillery-gun')
cyl('Turret bearing',(0,0,.35),.37,.15,dark)
panel('Breech',.08,0,.66,.57,.5,orange,glows[0])
for y in [-.19,.19]:
    strut('Barrel jacket',(.30,y,.53),(1.04,y,.53),.10,steel)
    strut('Orange induction rail',(.38,y,.64),(.96,y,.64),.026,glows[0])
    box('Muzzle brake',(1.04,y,.55),(.23,.22,.24),dark)
    box('Muzzle top',(1.04,y,.68),(.16,.15,.035),steel,.01)
    for i in range(3): box('Muzzle vent',(1+i*.045,y,.71),(.02,.13,.015),dark,.002)
bpy.ops.render.render(write_still=True)

new_scene('storm-mage-rotor')
for i in range(3):
    a=i*math.tau/3
    x,y=math.cos(a)*.65,math.sin(a)*.65
    strut('Radial conductor',(0,0,.25),(x,y,.3),.055,steel)
    cyl('Coil cage',(x,y,.34),.17,.2,dark,8)
    cyl('Coil emitter',(x,y,.47),.11,.08,glows[1],8)
    for j in range(3): box('Coil fin',(x-.12+j*.12,y,.51),(.035,.29,.055),white,.008)
bpy.ops.render.render(write_still=True)

new_scene('void-brawler-hammer')
cyl('Arm pivot',(0,0,.28),.18,.2,steel)
strut('Hammer arm',(0,0,.3),(.66,0,.3),.095,dark)
strut('Hydraulic ram',(.08,.1,.4),(.68,.1,.4),.04,white)
box('Hammer spine',(.77,0,.29),(.42,.24,.25),steel)
panel('Impact mass',1.06,0,.47,.85,.38,pink,glows[2])
for sy in [-1,1]:
    box('Hammer striking face',(1.06,sy*.47,.4),(.55,.16,.38),steel)
    box('Impact energy strip',(1.06,sy*.48,.61),(.42,.10,.025),glows[2],.01)
bpy.ops.render.render(write_still=True)

new_scene('void-brawler-shield')
strut('Shield forearm',(0,0,.25),(.47,0,.30),.095,steel)
cyl('Elbow servo',(.33,0,.34),.14,.15,dark)
panel('Shield left',.70,-.25,.45,.44,.42,pink,glows[2])
panel('Shield right',.70,.25,.45,.44,.42,pink,glows[2])
box('Shield spine',(.77,0,.51),(.2,1.12,.16),steel)
box('Shield ridge',(.88,0,.61),(.055,.85,.05),glows[2],.01)
bpy.ops.render.render(write_still=True)

# Locomotion variants retain the original design, separating its actual joints.
# Crop the transparent canvases so an articulated rig does not submit huge quads.
for kind in ['artillery', 'storm-mage', 'void-brawler']:
    original = bpy.data.scenes[kind+'-leg']
    for part, prefixes, pivot, angle, center, span, resolution in [
        ('upper', ['Femur'], (0,0), -math.atan2(.13,.54), .26, 1.2, (256,128)),
        ('lower', ['Lower actuator'], (.54,.13), -math.atan2(-.18,.41), .22, 1.2, (256,128)),
        ('joint', ['Knee'], (.54,.13), 0, 0, .6, (128,128)),
        ('foot', ['Stabilizer foot','Claw cap','Foot running light'], (.95,-.05), 0, 0, .6, (128,128))
    ]:
        scene = new_scene(kind+'-leg-'+part)
        scene.render.resolution_x, scene.render.resolution_y = resolution
        scene.camera.location.x = center
        scene.camera.data.ortho_scale = span
        bpy.ops.object.empty_add(type='PLAIN_AXES')
        root=bpy.context.object;root.name='Render pivot / '+part
        root.rotation_euler.z=angle
        for source in original.objects:
            if source.type!='MESH' or not any(source.name.startswith(p) for p in prefixes): continue
            obj=source.copy();obj.data=source.data.copy();scene.collection.objects.link(obj)
            obj.location.x-=pivot[0];obj.location.y-=pivot[1];obj.parent=root
        if part=='upper':
            o=strut('Upper hydraulic rod',(.02,-.1,.36),(.48,.02,.25),.025,white);o.parent=root
        if part=='lower':
            o=strut('Lower hydraulic rod',(.02,.08,.28),(.36,-.10,.18),.025,white);o.parent=root
        bpy.ops.render.render(write_still=True)

bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE / 'rwg-boss-components.blend'))
print('RWG_BOSS_ASSETS_COMPLETE', OUT)
