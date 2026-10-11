---
locale: en
slug: water
title: A molecule with water — glass and GPU water simulation in three.js
description: 'A glass molecule of three lobes with water inside, computed on the GPU: waves bounce off the walls and the letters, slosh when it turns and spread from the cursor, while clear balls float on the surface. Every setting is tunable right on the page.'
client: Web graphics
industry: Widgets
categories:
  - webgl
categoryOrder:
  webgl: 10
position: 31
featured: false
status: published
navigation: false
period: "2026"
updated: 2026-10-11
engagement: completed
services:
  - GPU simulation of the water surface
  - Refractive glass in three.js
  - The molecule model in Blender
  - A parameter lab on the page
demo:
  widget: water
  alt: A glass water molecule with the letters H, O and H in its lobes; blue water sloshes in the lower lobes and clear balls float on it
  tunable: true
  model: /media/projects/water/molecule.glb
  params:
    rotationSpeed: 0.45
    scrollRotation: 6.52
    follow: 1.75
    maxAngularVel: 2.85
    maxAngularAccel: 1.4
    velResponse: 3.8
    accelSmoothing: 5
    hoverTilt: 0.4
    modelScale: 1
    glassOn: 1
    waterOn: 1
    ballsOn: 1
    lettersOn: 1
    highWater: 0
    glassThickness: 0.145
    glassIor: 1.46
    glassDispersion: 0.52
    glassClearcoat: 0.48
    glassRim: 0.19
    glassEdge: 0.41
    glassEdgePower: 3.2
    glassBody: 0.055
    glassBubbles: 0.73
    glassColor: '#d5e5f0'
    glassTint: '#80accb'
    glassEdgeColor: '#a1c4de'
    innerRim: 0.12
    innerRimPower: 3.5
    innerRoughness: 0.11
    innerRimColor: '#9fd8ff'
    waterDepth: 0.53
    ripple: 0.0092
    dropStrength: 0.1
    caustics: 0.25
    foam: 1.1
    waterLevel: -0.005
    refraction: 0.185
    absorption: 2.2
    waterShallow: '#5fc6f0'
    waterDeep: '#0a3f8f'
    highLevel: -0.04
    highWaves: 1
    highWobble: 1
    highCaustics: 0.35
    silt: 0.8
    siltSize: 0.009
    siltRise: 0.04
    siltDrift: 0.05
    siltInertia: 1
    spinUp: 2.5
    siltCursor: 0.6
    waveSpeed: 0.9
    waveDamping: 0.35
    viscosity: 2
    relax: 0.05
    spinResponse: 1
    cursorStrength: 1.2
    cursorRadius: 0.18
    cursorMaxSpeed: 3
    cursorVertical: 0.5
    ballWake: 0.6
    flowDamping: 0.6
    ballCore: 0.17
    ballRim: 0.33
    ballRoughness: 0.36
    ballAbove: 1
    ballRadius: 0.116
    buoyancy: 0.25
    flowFollow: 0.8
    forceResponse: 3.75
    ballWander: 0.01
    ballDrag: 1.4
    ballMaxSpeed: 0.4
    wallStiffness: 68
    wallRange: 1.6
    restitution: 0.63
    ballColor: '#36414a'
    ballRimColor: '#5dbff8'
    letterGlow: 0.12
    faceCamera: 1
    faceTilt: 0
    letterColor: '#f4faff'
    letterEmissive: '#e6f4ff'
    exposure: 1.1
    keyLight: 2.2
    rimLight: 30
    fillLight: 12
metrics:
  - value: GPU
    label: waves and flow computed on the graphics card, hundreds of steps a second
  - value: "77"
    label: parameters you can tune right on the page
  - value: "2"
    label: water modes — with floating balls, and high water with suspended particles
cover:
  src: /media/projects/water/water-cover.jpg
  alt: A glass molecule of three lobes with the letters H, O and H on a dark background, with blue water and clear balls in the lower lobes
  width: 1680
  height: 945
media: []
---

## The task

A glass object with liquid inside is one of the most rewarding subjects in 3D and one of the most awkward for a browser. In a render it is simple: the glass refracts, the water sloshes, a frame takes minutes. On a page the same frame has to be drawn sixty times a second, on a transparent background, and the water has to respond to what the visitor does.

We wanted to build such a scene entirely in real time: a water molecule of three glass lobes with thick walls: the letters H, O and H in the lobes, and actual water with floating balls inside. The molecule spins and turns further as the page scrolls, and the water lives along with it: it sloshes when the molecule turns, bounces off the walls and the letters, and ripples away from the cursor.

The model was made in Blender for this job: outer and inner shells of 7.5 thousand triangles each, the letters H·O·H in Moderustic with a bevel, five balls and a plane that sets the water level. The whole file is 383 KB.

## The work

- The water is not particles but a height field on the GPU: the shallow-water wave equation on a grid of about 480×150 cells, 240 steps a second. The grid lives in the molecule's own space, so the water turns with the glass, and the equation includes the forces of a rotating vessel — centrifugal and those from angular acceleration. That is why the water sloshes not on a timer but because the molecule was turned;
- the water's boundaries are the actual cross-section of the inner shell at the water level. Letters that dip into the water are obstacles, and moving ones: the letters always face the viewer, so in the water they turn. The cross-section of each letter at the water level is computed once, in the letter's own coordinates, and every frame the GPU lays it onto the mask at the current angle. Waves bounce off the glass and the letters and wrap around them, a light edge appears along the walls, and foam where the water moves fast. Cells behind the wall carry on the height of the neighbouring water — otherwise stepped marks were left on the glass;
- besides height, the simulation stores the flow. Its velocity under each ball is read back asynchronously — eight pixels, without stalling the GPU — and the balls drift with the current, push off the walls, the letters and each other, and leave a small wake. They bob with the water height right in the shader;
- the glass is a three.js physical material with transmission, but the wall thickness is computed from the length of the ray's path: in the middle the wall is thin and barely distorts, at the silhouette the path through the glass is long — stronger refraction and denser colour, as with thick glass. The walls hold air bubbles, and the edge has a glow — otherwise at grazing angles the wall showed dark;
- everything inside the glass is seen only through its refraction: the water, the balls and the letters are flagged opaque but blend themselves and write colour only to the transmission buffer. The water itself is one more pass: everything behind it is drawn to a texture with depth, and the water samples it offset by the slope of the waves and absorbed by its real thickness. Letters under water waver, and sink into blue the deeper they are;
- the cursor over the molecule is projected onto the water beneath it: the simulation receives the speed of its movement, and a resting cursor leaves the water alone. A click shakes the water;
- the second mode is high water up to the bottom edge of the top letter. A large body of water without a surface reads as tinted glass, so it carries suspended particles — bubbles that rise, drift and lag behind the walls on a turn while the water spins up after the molecule;
- performance: three quality presets by device — a phone skips the water refraction pass, uses a coarser grid and half the steps; caps on pixel density and buffer area, a frame-rate limit on 120–360 Hz displays, and rendering paused off-screen.

## The result

The scene runs on a transparent background and drops into a page like any of our widgets: the site sets the rotation speed and the scroll response, and the model is set in the case configuration. The panel under the molecule grew out of the one the scene was tuned with: 77 live parameters, from glass thickness and water colour to viscosity, ball bounciness and cursor strength. Layers can be switched off one by one to see what the picture is made of, and a single switch raises the water into the top lobe.
