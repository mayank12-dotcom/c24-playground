"""Render eight actual character views as a compact reference inspection sheet.

blender -b -t 4 --python scripts/render-characters.py -- <json> <output.png>

Each model is rendered from its exported camera, target, and ortho scale.
This verifies silhouettes and deformed geometry, not browser/event behavior.
"""
import json
import math
import os
import sys

import bpy
from mathutils import Vector


args = sys.argv[sys.argv.index('--') + 1:]
source = os.path.abspath(args[0] if args else 'artifacts/character-preview.json')
output = os.path.abspath(args[1] if len(args) > 1 else 'artifacts/reference-character-preview.png')
with open(source, encoding='utf8') as handle:
    data = json.load(handle)
layout = data.get('layout', {})
os.makedirs(os.path.dirname(output), exist_ok=True)
render_dir = os.path.join(os.path.dirname(output), os.path.splitext(os.path.basename(output))[0] + '-views')
os.makedirs(render_dir, exist_ok=True)

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = int(layout.get('samples', 40))
# Managed Blender packages may omit OpenImageDenoise; use deterministic CPU
# samples so this inspection utility needs no optional native libraries.
scene.cycles.use_denoising = False
scene.cycles.max_bounces = 3
scene.cycles.transparent_max_bounces = 8
scene.render.resolution_x = int(layout.get('width', 320))
scene.render.resolution_y = int(layout.get('height', 400))
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.render.film_transparent = False
scene.view_settings.view_transform = 'Standard'
scene.view_settings.look = 'None'
scene.view_settings.exposure = 0
scene.view_settings.gamma = 1
scene.world.use_nodes = True
world_nodes, world_links = scene.world.node_tree.nodes, scene.world.node_tree.links
ambient = world_nodes.get('Background')
ambient.inputs['Color'].default_value = (.930110858, .930110858, .930110858, 1)
ambient.inputs['Strength'].default_value = .45
# The neutral background stays unchanged while lower-row diffuse lighting is
# deliberately modest, so the real three-dimensional form remains visible.
camera_background = world_nodes.new('ShaderNodeBackground')
camera_background.inputs['Color'].default_value = (.930110858, .930110858, .930110858, 1)
camera_background.inputs['Strength'].default_value = 1
world_path = world_nodes.new('ShaderNodeLightPath')
world_mix = world_nodes.new('ShaderNodeMixShader')
world_links.new(world_path.outputs['Is Camera Ray'], world_mix.inputs[0])
world_links.new(ambient.outputs[0], world_mix.inputs[1])
world_links.new(camera_background.outputs[0], world_mix.inputs[2])
world_links.new(world_mix.outputs[0], world_nodes.get('World Output').inputs['Surface'])

# Import the actual expanded/skinned backface hull instead of adding offline
# contour strokes. Interior mesh triangles therefore never acquire outlines.
scene.render.use_freestyle = False


def srgb_linear(value):
    return value / 12.92 if value <= .04045 else ((value + .055) / 1.055) ** 2.4


materials = {}
reference_flat = False


def material(hex_color, outline=False, opacity=1, vertex_colors=False):
    opacity = min(1, max(0, float(opacity)))
    key = (hex_color, outline, opacity, vertex_colors, reference_flat)
    if key not in materials:
        channels = [int(hex_color[index:index + 2], 16) / 255 for index in (1, 3, 5)]
        mat = bpy.data.materials.new(hex_color + (' backfaces' if outline else ''))
        mat.use_nodes = True
        node = mat.node_tree.nodes.get('Principled BSDF')
        node.inputs['Base Color'].default_value = (*map(srgb_linear, channels), 1)
        node.inputs['Roughness'].default_value = .85
        specular = node.inputs.get('Specular IOR Level') or node.inputs.get('Specular')
        if specular:
            specular.default_value = .1
        node.inputs['Alpha'].default_value = opacity
        mat.diffuse_color = (*channels, opacity)
        # The primary four views intentionally use the exported runtime mesh
        # with a flat material: light and shadow cannot disguise proportions.
        # The lower row adds a restrained 3D treatment of those same vertices.
        if not outline:
            nodes, links = mat.node_tree.nodes, mat.node_tree.links
            output = nodes.get('Material Output')
            emission = nodes.new('ShaderNodeEmission')
            emission.inputs['Color'].default_value = (*map(srgb_linear, channels), 1)
            if reference_flat:
                links.new(emission.outputs[0], output.inputs['Surface'])
            else:
                soft = nodes.new('ShaderNodeMixShader')
                soft.inputs[0].default_value = .30
                links.new(node.outputs[0], soft.inputs[1])
                links.new(emission.outputs[0], soft.inputs[2])
                links.new(soft.outputs[0], output.inputs['Surface'])
        color_output = None
        if vertex_colors:
            nodes, links = mat.node_tree.nodes, mat.node_tree.links
            attribute = nodes.new('ShaderNodeVertexColor')
            attribute.layer_name = 'CapturedColor'
            tint = nodes.new('ShaderNodeMixRGB')
            tint.blend_type = 'MULTIPLY'
            tint.inputs[0].default_value = 1
            tint.inputs[1].default_value = (*map(srgb_linear, channels), 1)
            links.new(attribute.outputs['Color'], tint.inputs[2])
            color_output = tint.outputs['Color']
            links.new(color_output, node.inputs['Base Color'])
        if outline:
            nodes, links = mat.node_tree.nodes, mat.node_tree.links
            output = nodes.get('Material Output')
            backfacing = nodes.new('ShaderNodeNewGeometry')
            light_path = nodes.new('ShaderNodeLightPath')
            camera_backfaces = nodes.new('ShaderNodeMath')
            camera_backfaces.operation = 'MULTIPLY'
            links.new(backfacing.outputs['Backfacing'], camera_backfaces.inputs[0])
            links.new(light_path.outputs['Is Camera Ray'], camera_backfaces.inputs[1])
            alpha = nodes.new('ShaderNodeMath')
            alpha.operation = 'MULTIPLY'
            alpha.inputs[1].default_value = opacity
            links.new(camera_backfaces.outputs[0], alpha.inputs[0])
            transparent = nodes.new('ShaderNodeBsdfTransparent')
            black = nodes.new('ShaderNodeEmission')
            black.inputs['Color'].default_value = (*map(srgb_linear, channels), 1)
            if color_output:
                links.new(color_output, black.inputs['Color'])
            mixed = nodes.new('ShaderNodeMixShader')
            links.new(alpha.outputs[0], mixed.inputs[0])
            links.new(transparent.outputs[0], mixed.inputs[1])
            links.new(black.outputs[0], mixed.inputs[2])
            links.new(mixed.outputs[0], output.inputs['Surface'])
        materials[key] = mat
    return materials[key]


bpy.ops.mesh.primitive_plane_add(size=200, location=(0, 0, -.009))
ground = bpy.context.object
ground.name = 'Neutral inspection floor'
ground_material = bpy.data.materials.new('Neutral flat background')
ground_material.use_nodes = True
ground_material.node_tree.nodes.clear()
background_emission = ground_material.node_tree.nodes.new('ShaderNodeEmission')
background_emission.inputs['Color'].default_value = (*[srgb_linear(247/255)] * 3, 1)
background_output = ground_material.node_tree.nodes.new('ShaderNodeOutputMaterial')
ground_material.node_tree.links.new(background_emission.outputs[0], background_output.inputs['Surface'])
ground.data.materials.append(ground_material)
ground.lineart.usage = 'EXCLUDE'

bpy.ops.object.light_add(type='AREA', location=(-3, -4, 7))
light = bpy.context.object
light.data.energy = 220
light.data.shape = 'DISK'
light.data.size = 5

bpy.ops.object.camera_add()
camera = bpy.context.object
camera.data.type = 'ORTHO'
camera.data.ortho_scale = 2.55
camera.data.lens = 55
scene.camera = camera

render_paths = []
for index, frame in enumerate(data['frames']):
    reference_flat = frame.get('flat', False)
    objects = []
    for mesh_index, entry in enumerate(frame['meshes']):
        mesh = bpy.data.meshes.new(entry['name'])
        mesh.from_pydata(entry['vertices'], [], entry['faces'])
        mesh.update()
        obj = bpy.data.objects.new(entry['name'], mesh)
        bpy.context.collection.objects.link(obj)
        vertex_colors = entry.get('vertexColors')
        if vertex_colors:
            if len(vertex_colors) != len(mesh.vertices):
                raise ValueError('Vertex color count differs from geometry: ' + entry['name'])
            attribute = mesh.color_attributes.new(name='CapturedColor', type='FLOAT_COLOR', domain='POINT')
            for item, color in zip(attribute.data, vertex_colors):
                item.color = (*color[:3], color[3] if len(color) > 3 else 1)
        opacities = entry.get('opacities', [])
        for color_index, color in enumerate(entry['colors']):
            opacity = opacities[color_index] if color_index < len(opacities) else 1
            mesh.materials.append(material(color, entry.get('outline', False), opacity, bool(vertex_colors)))
        if entry.get('outline', False) or not entry.get('castShadow', True):
            obj.visible_shadow = False
        for polygon, material_index in zip(mesh.polygons, entry['materialIndices']):
            polygon.material_index = material_index
            polygon.use_smooth = entry.get('smooth', True)
        objects.append(obj)
    camera.location = frame['camera']
    camera.data.ortho_scale = frame.get('orthoScale', 2.55)
    camera.rotation_euler = (Vector(frame.get('target', [0, 0, 1.03])) - camera.location).to_track_quat('-Z', 'Y').to_euler()
    scene.render.filepath = os.path.join(render_dir, f'{index + 1:02d}.png')
    bpy.ops.render.render(write_still=True)
    render_paths.append(scene.render.filepath)
    for obj in objects:
        mesh = obj.data
        bpy.data.objects.remove(obj, do_unlink=True)
        bpy.data.meshes.remove(mesh)

# Pillow is in the host Python rather than Blender's bundled Python. A separate
# host process composes and labels the rendered views; no model is synthesized.
import subprocess
compositor = r'''
import json, math, sys
from PIL import Image, ImageDraw, ImageFont
paths, labels, output = json.loads(sys.argv[1]), json.loads(sys.argv[2]), sys.argv[3]
layout = json.loads(sys.argv[4])
columns, width, height = int(layout.get('columns', 4)), int(layout.get('width', 320)), int(layout.get('height', 400))
label_height, header_height = 30, 64
rows = math.ceil(len(paths) / columns)
sheet = Image.new('RGB', (columns * width, header_height + rows * (height + label_height)), '#f7f7f4')
draw = ImageDraw.Draw(sheet)
try:
    bold = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 17)
    small = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 12)
    label_font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 13)
except OSError:
    bold = small = label_font = ImageFont.load_default()
draw.text((20, 12), layout.get('title', 'WHITE CHARACTER / ACTUAL 3D MESH'), fill='#242724', font=bold)
draw.text((20, 37), layout.get('subtitle', 'Top: flat, eye-level silhouettes. Bottom: posed 3D geometry. Offline review; browser interaction unverified.'), fill='#666963', font=small)
for index, (path, label) in enumerate(zip(paths, labels)):
    x, y = (index % columns) * width, header_height + (index // columns) * (height + label_height)
    image = Image.open(path).convert('RGB')
    if image.size != (width, height):
        raise ValueError('Unexpected character render dimensions: ' + str(image.size))
    sheet.paste(image, (x, y + label_height))
    draw.line((x, y, x + width, y), fill='#dedfd9', width=1)
    draw.text((x + 14, y + 7), label, fill='#242724', font=label_font)
# Palette compression keeps the review sheet lightweight in source archives.
# This only encodes actual rendered pixels; no geometry or silhouette is edited.
sheet.quantize(colors=192, method=Image.Quantize.MEDIANCUT).save(output, optimize=True)
print(output)
'''
subprocess.run(['/usr/bin/python3', '-c', compositor, json.dumps(render_paths),
                json.dumps([frame['label'] for frame in data['frames']]), output, json.dumps(layout)], check=True)
print('CONTACT_SHEET=' + output)
