import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { CatmullRomCurve3, Color, Vector3 } from 'three'
import type { BufferAttribute, Group, Texture } from 'three'
import { Stone, StoneArch } from './architecture.tsx'
import { colors, particles, paths, sectionPipe, siteBasins, terrain } from './config.ts'
import type { BasinId, Vec3 } from './config.ts'
import { seeded, Water, WaterSection } from './materials.tsx'
import type { getBasinReading } from './state.ts'

export function Basin({ id, reading, selected, hovered, cutaway, frozen, texture, onPick, onHover }: {
  id: BasinId
  reading: ReturnType<typeof getBasinReading>
  selected: boolean
  hovered: boolean
  cutaway: boolean
  frozen: boolean
  texture: Texture
  onPick: (id: BasinId) => void
  onHover: (id: BasinId | null) => void
}) {
  const { x, z, width, length, depth } = siteBasins[id]
  const halfW = width / 2
  const halfL = length / 2
  const wall = .42
  const wallH = depth + .69
  const wallY = -depth + wallH / 2
  const corner = .55
  const archCount = id === 'B-01' ? 3 : 2
  const stride = (width - 1.45) / archCount
  const archRadius = stride * .4
  const visibleWater = reading.ratio > .002
  return <group position={[x, 0, z]}>
    <Stone texture={texture} color="#a0886e" size={[width + .36, .34, length + .35]} position={[0, -depth - .17, 0]} />
    <Stone texture={texture} size={[width + .32, wallH, wall]} position={[0, wallY, -halfL]} />
    <Stone texture={texture} size={[wall, wallH, length]} position={[-halfW, wallY, 0]} />
    {cutaway ? <>
      <Stone color="#e3bf91" size={[wall, .14, length]} position={[halfW, -depth + .15, 0]} />
      <Stone color="#e3bf91" size={[width, .14, wall]} position={[0, -depth + .15, halfL]} />
    </> : <>
      <Stone texture={texture} size={[wall, wallH, length]} position={[halfW, wallY, 0]} />
      <Stone texture={texture} size={[width, wallH, wall]} position={[0, wallY, halfL]} />
      <Stone color="#ddc39e" size={[width + .45, .19, .59]} position={[0, .73, halfL]} />
      <Stone color="#ddc39e" size={[.59, .19, length]} position={[halfW, .73, 0]} />
    </>}
    <Stone color="#e4c9a2" size={[width + .56, .19, .63]} position={[0, .73, -halfL]} />
    <Stone color="#e4c9a2" size={[.59, .19, length]} position={[-halfW, .73, 0]} />
    {Array.from({ length: archCount + 1 }, (_, index) => <group key={index} position={[-width / 2 + .72 + index * stride, 0, -halfL + .52]}>
      <Stone texture={texture} size={[.49, depth + .45, .46]} position={[0, -depth / 2 + .16, 0]} />
      <Stone color="#d8bb8d" size={[.67, .16, .56]} position={[0, .34, 0]} />
      {index < archCount && <StoneArch radius={archRadius} thickness={.19} depth={.32} position={[stride * .5, .36, -.18]} />}
    </group>)}
    {Array.from({ length: 6 }, (_, index) => <Stone key={index} color={index % 2 ? '#cbb18a' : '#dac097'}
      size={[1.17, Math.max(.18, 1.7 - index * .24), .44]} position={[-halfW + 1.02, -.54 - index * .36, -halfL + .7 + index * .36]} />)}
    <Water position={[0, reading.surface, 0]} size={[width - .45, length - .43]} visible={visibleWater} frozen={frozen} />
    {cutaway && visibleWater && <WaterSection bottom={-depth} surface={reading.surface} width={width - .45} length={length - .43} frozen={frozen} />}
    {cutaway && <>
      <ExposedManifold id={id} />
      {Array.from({ length: archCount }, (_, index) => <StoneArch key={index} radius={archRadius} thickness={.23}
        depth={length * .23} position={[-halfW + .72 + (index + .5) * stride, -depth + .94, -halfL + .73]} />)}
    </>}
    {(selected || hovered) && <group position-y={cutaway ? -depth + .23 : .865}>
      {[-1, 1].flatMap(side => [-1, 1].map(end => <group key={side + ':' + end} position={[side * (halfW + .14), 0, end * (halfL + .14)]}>
        <mesh position-x={-side * corner / 2}><boxGeometry args={[corner, .045, .075]} /><meshBasicMaterial color={selected ? colors.mint : '#eae5d9'} /></mesh>
        <mesh position-z={-end * corner / 2}><boxGeometry args={[.075, .045, corner]} /><meshBasicMaterial color={selected ? colors.mint : '#eae5d9'} /></mesh>
      </group>))}
    </group>}
    <mesh position={[0, -.13, 0]} onClick={event => { event.stopPropagation(); onPick(id) }}
      onPointerOver={event => { event.stopPropagation(); onHover(id) }} onPointerOut={() => onHover(null)}>
      <boxGeometry args={[width + .37, .9, length + .34]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
  </group>
}

export function OutageLayer({ frozen }: { frozen: boolean }) {
  const ref = useRef<Group>(null)
  const material = useRef<{ opacity: number }>(null)
  useFrame(({ clock }) => {
    if (!frozen && material.current) material.current.opacity = .15 + .036 * Math.sin(clock.elapsedTime * 2.5)
  })
  const { x, z, width, depth } = terrain.outage
  return <group ref={ref} position={[x, .14, z]}>
    <mesh rotation-x={-Math.PI / 2}>
      <planeGeometry args={[width, depth]} />
      <meshBasicMaterial ref={(value) => { material.current = value }} color={colors.alert} transparent opacity={.17} depthWrite={false} polygonOffset polygonOffsetFactor={-2} />
    </mesh>
    <mesh rotation-x={-Math.PI / 2} position-y={.02}>
      <planeGeometry args={[width, depth, 1, 1]} />
      <meshBasicMaterial color="#e5a75d" transparent opacity={.28} wireframe depthWrite={false} />
    </mesh>
  </group>
}

function curve(path: Vec3[]) {
  return new CatmullRomCurve3(path.map(point => new Vector3(...point)), false, 'centripetal')
}

function ExposedManifold({ id }: { id: BasinId }) {
  const { width, length, depth } = siteBasins[id]
  const x = width * .27
  const y = -depth + .55
  const trunk = useMemo(() => curve([
    [x, y + .73, length * .19], [x, y, length * .36], [x, y, length * .61], [x, y, length * .83],
  ]), [x, y, length])
  return <group>
    <mesh castShadow>
      <tubeGeometry args={[trunk, sectionPipe.segments, sectionPipe.radius, sectionPipe.radialSegments, false]} />
      <meshStandardMaterial color="#83a9a0" metalness={.35} roughness={.54} />
    </mesh>
    {[.54, .82].map(proportion => <mesh key={proportion} position={[x, y, length * proportion]} rotation-x={Math.PI / 2}>
      <cylinderGeometry args={[sectionPipe.flange, sectionPipe.flange, .105, 12]} />
      <meshStandardMaterial color="#bd9f77" metalness={.36} roughness={.55} />
    </mesh>)}
  </group>
}
const buriedTransfer = curve(paths.transfer)
const buriedIrrigation = curve(paths.irrigation)
const displayIrrigation = curve(paths.irrigation.map(([x, , z]) => [x, .2, z]))
const runoff = curve([...paths.catchment.map(([x, z]) => [x, .18, z] as Vec3), [-4.55, -.75, 1.08]])

export function Pipes({ cutaway, authorized, frozen }: { cutaway: boolean; authorized: boolean; frozen: boolean }) {
  const group = useRef<Group>(null)
  const flowTime = useRef(0)
  const temp = useMemo(() => new Vector3(), [])
  const visibleRoute = cutaway ? buriedIrrigation : displayIrrigation
  useFrame((_, delta) => {
    if (!group.current) return
    if (!frozen) flowTime.current += Math.min(delta, .05) * .21
    group.current.children.forEach((segment, index) => {
      visibleRoute.getPointAt((flowTime.current + index / particles.routeCount) % 1, temp)
      segment.position.copy(temp)
    })
  })
  return <>
    {cutaway && [buriedTransfer, buriedIrrigation].map((line, index) => <mesh key={index} renderOrder={2}>
      <tubeGeometry args={[line, 32, .18, 8, false]} />
      <meshStandardMaterial color={colors.pipe} metalness={.47} opacity={.9} transparent depthWrite={false} />
    </mesh>)}
    {authorized && <>
      <mesh renderOrder={3}><tubeGeometry args={[visibleRoute, 32, .13, 8, false]} /><meshBasicMaterial color="#32d8c3" transparent opacity={.7} depthWrite={false} depthTest={!cutaway} /></mesh>
      <group ref={group}>{Array.from({ length: particles.routeCount }, (_, index) => <mesh key={index} renderOrder={4}>
        <sphereGeometry args={[.16, 8, 6]} /><meshBasicMaterial color="#b8ffec" depthTest={!cutaway} />
      </mesh>)}</group>
    </>}
  </>
}

export function Rain({ frozen }: { frozen: boolean }) {
  const rain = useRef<BufferAttribute>(null)
  const flow = useRef<Group>(null)
  const position = useMemo(() => new Vector3(), [])
  const data = useMemo(() => new Float32Array(particles.rainCount * 6), [])
  const offsets = useMemo(() => Array.from({ length: particles.rainCount }, (_, index) => ({
    x: (seeded(index * 7 + 1) - .5) * particles.width,
    z: (seeded(index * 11 + 1) - .56) * particles.depth,
    y: seeded(index * 5 + 9) * particles.height,
    length: .17 + seeded(index * 3 + 94) * .48,
  })), [])
  const elapsed = useRef(0)
  useFrame((_, delta) => {
    if (!rain.current) return
    if (!frozen) elapsed.current += Math.min(delta, .05) * 13
    offsets.forEach((point, index) => {
      const y = ((point.y - elapsed.current) % particles.height + particles.height) % particles.height
      const offset = index * 6
      data[offset] = point.x
      data[offset + 1] = y
      data[offset + 2] = point.z
      data[offset + 3] = point.x + .16
      data[offset + 4] = y + point.length
      data[offset + 5] = point.z + .08
    })
    rain.current.needsUpdate = true
    flow.current?.children.forEach((pulse, index) => {
      runoff.getPointAt((elapsed.current * .045 + index / 5) % 1, position)
      pulse.position.copy(position)
    })
  })
  return <>
    <lineSegments frustumCulled={false}>
      <bufferGeometry><bufferAttribute ref={rain} attach="attributes-position" args={[data, 3]} /></bufferGeometry>
      <lineBasicMaterial color={new Color('#b2e6ef')} transparent opacity={.46} depthWrite={false} />
    </lineSegments>
    <mesh><tubeGeometry args={[runoff, 20, .075, 6, false]} /><meshBasicMaterial color="#59bfb8" /></mesh>
    <group ref={flow}>{[0, 1, 2, 3, 4].map(index => <mesh key={index}>
      <sphereGeometry args={[.12, 9, 6]} /><meshBasicMaterial color="#a3f6ed" />
    </mesh>)}</group>
  </>
}
