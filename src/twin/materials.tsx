import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { CanvasTexture, Color, Path, RepeatWrapping, ShaderMaterial, Shape, SRGBColorSpace } from 'three'
import type { Group, Mesh } from 'three'
import { colors, terrain } from './config.ts'
import type { Vec3 } from './config.ts'
import { motion } from '../motion.ts'

export function seeded(index: number) {
  const value = Math.sin(index * 127.1 + 19.7) * 43758.5453
  return value - Math.floor(value)
}

export function useMasonry() {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 256
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#87735c'
    ctx.fillRect(0, 0, 256, 256)
    const palette = ['#dcc6a1', '#c9b08b', '#cfb795', '#dac09a', '#c3a784', '#e2c8a1']
    for (let row = 0; row < 8; row++) {
      for (let column = -1; column < 5; column++) {
        const index = row * 13 + column + 2
        const x = column * 64 + (row % 2) * 32
        const y = row * 32
        ctx.fillStyle = palette[Math.floor(seeded(index) * palette.length)]
        ctx.fillRect(x + 1, y + 1, 62, 30)
        ctx.fillStyle = '#f6e4c34b'
        ctx.fillRect(x + 2, y + 1, 59, 2)
        ctx.fillStyle = '#583e2944'
        ctx.fillRect(x + 2, y + 29, 60, 2)
      }
    }
    for (let point = 0; point < 2800; point++) {
      ctx.fillStyle = point % 2 ? '#533e2721' : '#ffeed224'
      ctx.fillRect(seeded(point + 618) * 256, seeded(point * 7) * 256, .45 + seeded(9 * point) * 1.2, .6)
    }
    const result = new CanvasTexture(canvas)
    result.wrapS = result.wrapT = RepeatWrapping
    result.colorSpace = SRGBColorSpace
    result.anisotropy = 4
    return result
  }, [])
  useEffect(() => () => texture.dispose(), [texture])
  return texture
}

const vertexShader = `
varying vec3 vWorld;
uniform float elapsed;
uniform float ocean;
void main() {
  vec3 point = position;
  vec3 location = (modelMatrix * vec4(point, 1.0)).xyz;
  float wave = sin(location.x * 1.26 + location.z * 1.58 + elapsed * .78);
  wave += sin(location.x * 2.14 - location.z * .82 + elapsed * 1.13) * .48;
  point.z += wave * mix(.023, .056, ocean);
  vWorld = (modelMatrix * vec4(point, 1.0)).xyz;
  gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
}`

const fragmentShader = `
varying vec3 vWorld;
uniform float elapsed;
uniform float ocean;
uniform vec3 shallow;
uniform vec3 deep;
float ripple(float x) { return sin(x) * .5 + .5; }
void main() {
  vec2 uv = vWorld.xz;
  vec2 warp = uv + vec2(sin(uv.y * .31 + elapsed * .28), cos(uv.x * .26 + uv.y * .17)) * mix(.68, 1.68, ocean);
  float a = warp.x * 1.29 + warp.y * 2.67 + elapsed * .91;
  float b = warp.x * 2.58 - warp.y * 1.38 + elapsed * 1.32;
  float c = uv.x * .5 + uv.y * .74 + elapsed * .44;
  vec3 normal = normalize(vec3(mix(.116, .048, ocean)*cos(a) + .024*cos(c), 1.0, mix(.098, .027, ocean)*cos(b) + .037*cos(a)));
  vec3 viewDir = normalize(cameraPosition - vWorld);
  vec3 sun = normalize(vec3(-.4, .86, .54));
  float spec = pow(max(dot(normal, normalize(sun + viewDir)), 0.0), 54.0);
  float fresnel = pow(1.0 - max(dot(normal, viewDir), 0.0), 3.0);
  float bands = ripple(c + sin(uv.x * .84) * .75) * .65 + .18;
  float coast = clamp((uv.x * .64 + uv.y * .74 - 8.0) / 26.0, 0.0, 1.0);
  float mixColor = mix(bands, bands * .34 + .48 * (1.0 - coast), ocean);
  vec3 color = mix(deep, shallow, mixColor);
  color += vec3(.38, .52, .53) * fresnel * .25;
  color += vec3(.69, .75, .66) * spec * mix(.26, .075, ocean);
  color += vec3(.028, .063, .067) * pow(ripple(a + sin(b)*.81), 10.0) * mix(.55, .22, ocean);
  float distanceFade = smoothstep(30.0, 125.0, length(uv));
  color = mix(color, vec3(.02, .071, .095), distanceFade * ocean * .9);
  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`

const seaShape = (() => {
  const shape = new Shape()
  const edge = terrain.seaSize / 2
  shape.moveTo(-edge, -edge)
  shape.lineTo(edge, -edge)
  shape.lineTo(edge, edge)
  shape.lineTo(-edge, edge)
  shape.closePath()
  const island = new Path()
  terrain.outline.forEach(([x, z], index) => index === 0 ? island.moveTo(x, -z) : island.lineTo(x, -z))
  island.closePath()
  shape.holes.push(island)
  return shape
})()

export function Water({ position, size, ocean = false, frozen = false, visible = true }: {
  position: Vec3; size: [number, number]; ocean?: boolean; frozen?: boolean; visible?: boolean
}) {
  const mesh = useRef<Mesh>(null)
  const targetY = position[1]
  const invalidate = useThree(state => state.invalidate)
  const material = useMemo(() => new ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      elapsed: { value: 0 },
      ocean: { value: ocean ? 1 : 0 },
      shallow: { value: new Color(ocean ? colors.sea : colors.water) },
      deep: { value: new Color(ocean ? colors.deepSea : colors.basinDeep) },
    },
  }), [ocean])
  useEffect(() => () => material.dispose(), [material])
  useLayoutEffect(() => {
    if (frozen && mesh.current) {
      mesh.current.position.y = targetY
      invalidate()
    }
  }, [frozen, targetY, invalidate])
  useFrame((_, delta) => {
    if (!frozen) material.uniforms.elapsed.value += Math.min(delta, .05)
    if (mesh.current) mesh.current.position.y = frozen ? targetY : mesh.current.position.y + (targetY - mesh.current.position.y) * (1 - Math.exp(-2.3 * delta / motion.data))
  })
  const initialY = useRef(targetY)
  return <mesh ref={mesh} material={material} rotation-x={-Math.PI / 2} position={[position[0], initialY.current, position[2]]} visible={visible}>
    {ocean ? <shapeGeometry args={[seaShape]} /> : <planeGeometry args={[size[0], size[1], 14, 10]} />}
  </mesh>
}

export function Sea({ frozen }: { frozen: boolean }) {
  return <Water ocean frozen={frozen} position={[0, terrain.sea, 0]} size={[terrain.seaSize, terrain.seaSize]} />
}

export function WaterSection({ bottom, surface, width, length, frozen }: {
  bottom: number; surface: number; width: number; length: number; frozen: boolean
}) {
  const group = useRef<Group>(null)
  const height = Math.max(0, surface - bottom)
  const initialHeight = useRef(height)
  const invalidate = useThree(state => state.invalidate)
  useLayoutEffect(() => {
    if (frozen && group.current) {
      group.current.scale.y = height
      invalidate()
    }
  }, [frozen, height, invalidate])
  useFrame((_, delta) => {
    if (group.current) group.current.scale.y += (height - group.current.scale.y) * (1 - Math.exp(-2.3 * delta / motion.data))
  })
  return <group ref={group} position-y={bottom} scale={[1, initialHeight.current, 1]}>
    <mesh position={[0, .5, length / 2]}><boxGeometry args={[width, 1, .026]} /><meshStandardMaterial color="#1d7883" roughness={.6} transparent opacity={.78} /></mesh>
    <mesh position={[width / 2, .5, 0]}><boxGeometry args={[.026, 1, length]} /><meshStandardMaterial color="#186779" roughness={.6} transparent opacity={.8} /></mesh>
  </group>
}
