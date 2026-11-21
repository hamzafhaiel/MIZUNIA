import { memo, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { CanvasTexture, Color, InstancedMesh, Object3D, Path, Shape } from 'three'
import type { Texture } from 'three'
import { buildings, colors, dome, garden, gate, paths, siteBasins, terrain, trees } from './config.ts'
import type { BasinId, Vec3 } from './config.ts'
import { seeded } from './materials.tsx'

const stoneShades = ['#d3bc97', '#bba17d', '#e5cda6', '#cdad85']

type Solid = { position: Vec3; size: Vec3; color: string; rotation?: number }

export function Boxes({ items, shadows = true, roughness = .86 }: { items: Solid[]; shadows?: boolean; roughness?: number }) {
  const ref = useRef<InstancedMesh>(null)
  useLayoutEffect(() => {
    if (!ref.current || !items.length) return
    const object = new Object3D()
    const color = new Color()
    items.forEach(({ position, size, rotation, color: hex }, index) => {
      object.position.set(...position)
      object.scale.set(...size)
      object.rotation.y = rotation ?? 0
      object.updateMatrix()
      ref.current!.setMatrixAt(index, object.matrix)
      ref.current!.setColorAt(index, color.set(hex))
    })
    ref.current.instanceMatrix.needsUpdate = true
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true
    ref.current.computeBoundingSphere()
  }, [items])
  if (!items.length) return null
  return <instancedMesh ref={ref} args={[undefined, undefined, items.length]} castShadow={shadows} receiveShadow>
    <boxGeometry />
    <meshStandardMaterial roughness={roughness} />
  </instancedMesh>
}

export function Stone({ size, position, texture, color = '#ffffff', rotation = 0 }: {
  size: Vec3; position: Vec3; texture?: Texture; color?: string; rotation?: number
}) {
  return <mesh position={position} rotation-y={rotation} castShadow receiveShadow>
    <boxGeometry args={size} />
    <meshStandardMaterial map={texture} bumpMap={texture} bumpScale={.075} color={color} roughness={.91} />
  </mesh>
}

function outlinePath(path: Path, points: [number, number][]) {
  points.forEach(([x, z], index) => index === 0 ? path.moveTo(x, -z) : path.lineTo(x, -z))
  path.closePath()
}

function cisternHole(id: BasinId, cutaway: boolean, path = new Path()) {
  const { x, z, width, length } = siteBasins[id]
  const extension = cutaway ? 5 : 0
  outlinePath(path, [
    [x - width / 2, z - length / 2], [x + width / 2, z - length / 2],
    [x + width / 2 + extension * .54, z + length / 2 + extension],
    [x - width / 2, z + length / 2 + extension],
  ])
  return path
}

function pathBoxes(points: [number, number][], depth: number, color: string, y: number): Solid[] {
  return points.slice(1).map(([x, z], index) => {
    const [px, pz] = points[index]
    return { position: [(x + px) / 2, y, (z + pz) / 2], size: [Math.hypot(x - px, z - pz) + depth * .63, .055, depth], color, rotation: -Math.atan2(z - pz, x - px) }
  })
}

const pavement = [
  ...pathBoxes(paths.promenade, 1.55, '#d9bb93', .034),
  ...pathBoxes(paths.market, 1.45, '#bc9e79', .033),
  ...pathBoxes(paths.garden, 1.1, '#d5bc94', .034),
  ...pathBoxes(paths.catchment, .36, '#789482', .075),
]

const shoreBlocks: Solid[] = terrain.coast.slice(1).flatMap(([x, z], index) => {
  const [px, pz] = terrain.coast[index]
  const length = Math.hypot(x - px, z - pz)
  const rotation = -Math.atan2(z - pz, x - px)
  const base: Solid[] = [
    { position: [(x + px) / 2, -.16, (z + pz) / 2], size: [length + .4, 1.45, .65], color: '#aa8d67', rotation },
    { position: [(x + px) / 2, .6, (z + pz) / 2], size: [length + .4, .19, .94], color: '#dcc196', rotation },
  ]
  const count = Math.ceil(length * 2.2)
  for (let index = 0; index < count; index++) {
    const t = (index + .5) / count
    const nx = px + (x - px) * t
    const nz = pz + (z - pz) * t
    const step = index + Math.round(length * 15)
    for (let row = 0; row < 2; row++) {
      base.push({ position: [nx, -.47 + row * .47, nz], size: [.46, .40, .76], color: stoneShades[(step * 7 + row) % 4], rotation })
    }
    if (index % 3 === 0) base.push({ position: [nx + .35, -.65, nz + .54], size: [.52, .35, .65], color: '#947d60', rotation: seeded(step) * 3 })
  }
  return base
})

export function Terrain({ selectedCut, texture }: { selectedCut?: BasinId; texture: Texture }) {
  const shape = useMemo(() => {
    const ground = new Shape()
    outlinePath(ground, terrain.outline)
    ground.holes = [cisternHole('B-01', selectedCut === 'B-01'), cisternHole('B-02', selectedCut === 'B-02')]
    return ground
  }, [selectedCut])
  const extrusion = useMemo(() => ({ steps: 1, depth: terrain.foundation, bevelEnabled: false }), [])
  const cavityFloor = useMemo(() => selectedCut ? cisternHole(selectedCut, true, new Shape()) as Shape : null, [selectedCut])
  const retainedPaving = useMemo(() => selectedCut === 'B-01'
    ? pavement.filter(item => !(item.position[2] > 6.8 && item.position[2] < 10.5 && item.position[0] > -7.5 && item.position[0] < 2.5))
    : pavement, [selectedCut])
  return <>
    <mesh rotation-x={-Math.PI / 2} position-y={-terrain.foundation} receiveShadow>
      <extrudeGeometry args={[shape, extrusion]} />
      <meshStandardMaterial attach="material-0" color={colors.soil} roughness={1} />
      <meshStandardMaterial attach="material-1" color="#9b8060" map={texture} roughness={1} />
    </mesh>
    <Boxes items={shoreBlocks} />
    {selectedCut && cavityFloor && <mesh rotation-x={-Math.PI / 2} position-y={-siteBasins[selectedCut].depth - .34} receiveShadow>
      <shapeGeometry args={[cavityFloor]} />
      <meshStandardMaterial color="#8b7256" roughness={1} />
    </mesh>}
    <Boxes items={retainedPaving} shadows={false} />
  </>
}

const contacts = [
  ...buildings.map(([x, z, width, depth]) => ({ x, z, width: width * 1.77, depth: depth * 1.77 })),
  ...trees.map(([x, z, scale]) => ({ x, z, width: 3.6 * scale, depth: 3.1 * scale })),
]

export function GroundOcclusion() {
  const mesh = useRef<InstancedMesh>(null)
  const map = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 64
    const ctx = canvas.getContext('2d')!
    const gradient = ctx.createRadialGradient(32, 32, 1, 32, 32, 31)
    gradient.addColorStop(0, '#27231fbf')
    gradient.addColorStop(.48, '#27231f65')
    gradient.addColorStop(1, '#27231f00')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, 64, 64)
    return new CanvasTexture(canvas)
  }, [])
  useEffect(() => () => map.dispose(), [map])
  useLayoutEffect(() => {
    const object = new Object3D()
    object.rotation.x = -Math.PI / 2
    const instances = mesh.current!
    contacts.forEach(({ x, z, width, depth }, index) => {
      object.position.set(x, .068, z)
      object.scale.set(width, depth, 1)
      object.updateMatrix()
      instances.setMatrixAt(index, object.matrix)
    })
    instances.instanceMatrix.needsUpdate = true
    instances.computeBoundingSphere()
  }, [])
  return <instancedMesh ref={mesh} args={[undefined, undefined, contacts.length]}>
    <planeGeometry />
    <meshBasicMaterial map={map} transparent opacity={.52} depthWrite={false} />
  </instancedMesh>
}

const neighborhood: Solid[] = buildings.flatMap(([x, z, width, depth, height, color], index) => {
  const roof = '#c2a784'
  const front = z + depth / 2
  const solids: Solid[] = [
    { position: [x, height / 2, z], size: [width, height, depth], color },
    { position: [x, height + .09, z], size: [width + .15, .2, depth + .16], color: roof },
    { position: [x, .12, z], size: [width + .21, .32, depth + .21], color: '#b9a27d' },
    { position: [x, height + .35, front], size: [width + .09, .38, .14], color },
    { position: [x, height + .35, z - depth / 2], size: [width + .09, .38, .14], color },
    { position: [x - width / 2, height + .35, z], size: [.14, .38, depth], color },
    { position: [x + width / 2, height + .35, z], size: [.14, .38, depth], color },
    { position: [x - .43, .66, front + .06], size: [.73, 1.32, .16], color: '#a68f6d' },
    { position: [x - .43, .66, front + .15], size: [.52, 1.16, .08], color: index % 3 ? '#356263' : '#54647a' },
  ]
  const floor = height >= 3.4 ? [1.15, height - .85] : [height - .85]
  floor.forEach((level, i) => {
    const color = index % 2 ? '#49676a' : '#3a5358'
    for (let w = 0; w < 2; w++) {
      const px = x + (w === 0 ? -.31 : .29) * width
      if (i === 0 && floor.length === 2 && w === 0) continue
      solids.push(
        { position: [px, level, front + .062], size: [.52, .57, .1], color: '#a68f6d' },
        { position: [px, level, front + .122], size: [.37, .43, .02], color },
        { position: [px, level - .29, front + .11], size: [.61, .11, .26], color: '#cfb894' })
    }
    solids.push({ position: [x + width / 2 + .05, level, z + .21], size: [.11, .45, .56], color })
  })
  if (index % 4 === 0) {
    solids.push(
      { position: [x + .45, height + .32, z - .29], size: [1.25, .3, 1.37], color: '#9d9276' },
      { position: [x + .45, height + .49, z - .29], size: [1.12, .08, 1.2], color: '#58767a' },
    )
  }
  return solids
})

function canopyInstances() {
  return trees.flatMap(([x, z, scale], index) => {
    const olive = index % 3 !== 0
    const tint = olive ? ['#6c7748', '#5f6940', '#7e8555'] : ['#4e693c', '#4b6038', '#5f7443']
    return Array.from({ length: 4 }, (_, layer) => ({
      position: [x + (seeded(index * 17 + layer) - .5) * .89 * scale, (1.25 + layer * .24) * scale, z + (seeded(index * 13 + layer + 54) - .5) * .85 * scale] as Vec3,
      size: [(1.02 - layer * .14) * scale, (.57 + .08 * layer) * scale, (1.04 - layer * .09) * scale] as Vec3,
      color: tint[layer % tint.length],
      rotation: seeded(layer * 88 + index) * 6.28,
    }))
  })
}
const canopies = canopyInstances()
const trunks: Solid[] = trees.map(([x, z, scale]) => ({ position: [x, scale * .7, z], size: [.17 * scale, 1.39 * scale, .19 * scale], color: '#6f583e' }))

const beds: Solid[] = Array.from({ length: 6 }, (_, index) => {
  const x = garden.x - 1.9 + index * .75
  return [
    { position: [x, .08, garden.z], size: [.57, .15, garden.length], color: '#8c7753' },
    { position: [x, .2, garden.z], size: [.38, .28, garden.length - .2], color: index % 2 ? '#69814d' : '#78854d' },
  ] as Solid[]
}).flat()

const details: Solid[] = [
  ...trunks, ...beds,
  ...Array.from({ length: 7 }, (_, index): Solid => ({
    position: [-13 + index * 2.25, .32, 9.8 - index * .25], size: [.21, .63, .21], color: '#e1ca9e',
  })),
  ...Array.from({ length: 12 }, (_, index): Solid => ({
    position: [-22 + seeded(index * 19) * 29, .06, -5.1 + seeded(index * 69) * 17], size: [.37, .12, .48], color: stoneShades[index % stoneShades.length],
  })),
]

export const BuildingsAndGarden = memo(function BuildingsAndGarden({ texture }: { texture: Texture }) {
  const treeMesh = useRef<InstancedMesh>(null)
  useLayoutEffect(() => {
    const mesh = treeMesh.current
    if (!mesh) return
    const object = new Object3D()
    const tone = new Color()
    canopies.forEach(({ position, size, rotation, color }, index) => {
      object.position.set(...position)
      object.scale.set(...size)
      object.rotation.set(index * .116, rotation, .21)
      object.updateMatrix()
      mesh.setMatrixAt(index, object.matrix)
      mesh.setColorAt(index, tone.set(color))
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [])
  return <>
    <Boxes items={neighborhood} />
    <Boxes items={details} />
    <instancedMesh ref={treeMesh} args={[undefined, undefined, canopies.length]} castShadow receiveShadow>
      <icosahedronGeometry args={[1, 2]} />
      <meshStandardMaterial roughness={1} flatShading />
    </instancedMesh>
    <group position={dome.position}>
      <Stone size={[2.65, 2.2, 2.35]} position={[0, 1.1, 0]} texture={texture} />
      <Stone size={[2.84, .23, 2.54]} position={[0, 2.25, 0]} color="#dfc5a1" />
      <mesh position={[0, 2.41, 0]} castShadow>
        <sphereGeometry args={[1.03, 22, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#ece0c5" roughness={.78} />
      </mesh>
      <Stone size={[.57, 1.15, .09]} position={[0, .62, 1.215]} color="#416667" />
    </group>
    <group position={gate.position} rotation-y={gate.rotation}>
      <Stone size={[1.23, 3.4, 1.15]} position={[-1.53, 1.7, 0]} texture={texture} />
      <Stone size={[1.23, 3.4, 1.15]} position={[1.53, 1.7, 0]} texture={texture} />
      <Stone size={[3.98, .72, 1.15]} position={[0, 3.43, 0]} texture={texture} />
      {[0, 1, 2, 3, 4, 5, 6].map(index => <Stone key={index} size={[.42, .43, 1.27]} position={[-1.8 + index * .6, 4.0, 0]} color="#d5bd96" />)}
      <StoneArch radius={.92} thickness={.28} depth={.45} position={[0, 2.27, .29]} />
    </group>
  </>
})

export function StoneArch({ radius, thickness, depth, position }: {
  radius: number; thickness: number; depth: number; position: Vec3
}) {
  const mesh = useRef<InstancedMesh>(null)
  const steps = 10
  const shape = useMemo(() => {
    const shape = new Shape()
    const start = .013
    const end = Math.PI / steps - .013
    const outer = radius + thickness
    shape.moveTo(Math.cos(start) * radius, Math.sin(start) * radius)
    shape.absarc(0, 0, radius, start, end, false)
    shape.lineTo(Math.cos(end) * outer, Math.sin(end) * outer)
    shape.absarc(0, 0, outer, end, start, true)
    shape.closePath()
    return shape
  }, [radius, thickness])
  const settings = useMemo(() => ({ depth, bevelEnabled: false, curveSegments: 4 }), [depth])
  useLayoutEffect(() => {
    const instances = mesh.current!
    const object = new Object3D()
    for (let index = 0; index < steps; index++) {
      object.rotation.z = Math.PI * index / steps
      object.updateMatrix()
      instances.setMatrixAt(index, object.matrix)
      instances.setColorAt(index, new Color(stoneShades[index % stoneShades.length]))
    }
    instances.instanceMatrix.needsUpdate = true
    if (instances.instanceColor) instances.instanceColor.needsUpdate = true
    instances.computeBoundingSphere()
  }, [])
  return <instancedMesh ref={mesh} position={position} args={[undefined, undefined, steps]} castShadow receiveShadow>
    <extrudeGeometry args={[shape, settings]} />
    <meshStandardMaterial roughness={.88} />
  </instancedMesh>
}
