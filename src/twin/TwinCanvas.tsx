import { OrbitControls } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import type { ComponentRef, RefObject } from 'react'
import { Vector3 } from 'three'
import { motion } from '../motion.ts'
import type { DirectionalLight, OrthographicCamera } from 'three'
import { BuildingsAndGarden, GroundOcclusion, Terrain } from './architecture.tsx'
import { basinIds, camera as cameraConfig, colors, light, siteBasins, terrain } from './config.ts'
import type { Weather } from './config.ts'
import type { BasinId, Mode, Vec3 } from './config.ts'
import { Basin, OutageLayer, Pipes, Rain } from './infrastructure.tsx'
import { Sea, useMasonry } from './materials.tsx'
import { cameraPose, interpolatePose } from './state.ts'
import type { deriveTwinState, getBasinReading, Pose } from './state.ts'

type Controls = ComponentRef<typeof OrbitControls>
interface CameraTransition { from: Pose; to: Pose; elapsed: number }

function CameraRig({ mode, selected, reset, reduced }: { mode: Mode; selected: BasinId; reset: number; reduced: boolean }) {
  const orbit = useRef<Controls>(null)
  const transition = useRef<CameraTransition | null>(null)
  const previousScene = useRef(false)
  const { camera, size, invalidate } = useThree()
  const lens = camera as OrthographicCamera

  function setPose(controls: Controls, pose: Pose) {
    lens.position.set(...pose.position)
    lens.zoom = pose.zoom
    lens.updateProjectionMatrix()
    controls.target.set(...pose.target)
    controls.update()
  }

  useLayoutEffect(() => {
    const controls = orbit.current
    if (!controls) return
    const to = cameraPose(mode, selected, size.width, size.height)
    controls.minZoom = to.zoom * .56
    controls.maxZoom = to.zoom * 2.35
    if (!previousScene.current || reduced) {
      previousScene.current = true
      transition.current = null
      controls.enabled = true
      setPose(controls, to)
      invalidate()
      return
    }
    transition.current = {
      from: { position: lens.position.toArray() as Vec3, target: controls.target.toArray() as Vec3, zoom: lens.zoom },
      to,
      elapsed: 0,
    }
    controls.enabled = false
    invalidate()
  }, [mode, selected, reset, reduced, size.width, size.height, lens, invalidate])

  useFrame((_, delta) => {
    const current = transition.current
    const controls = orbit.current
    if (!current || !controls) return
    current.elapsed += Math.min(delta, .05)
    const t = current.elapsed / cameraConfig.duration
    const pose = interpolatePose(current.from, current.to, t)
    controls.minZoom = Math.min(current.from.zoom, current.to.zoom * .56)
    controls.maxZoom = Math.max(current.from.zoom, current.to.zoom * 2.35)
    setPose(controls, pose)
    if (t < 1) return
    controls.minZoom = pose.zoom * .56
    controls.maxZoom = pose.zoom * 2.35
    controls.enabled = true
    transition.current = null
  })

  return <OrbitControls ref={orbit} makeDefault enablePan={false} enableDamping={!reduced}
    dampingFactor={.104} rotateSpeed={.55} zoomSpeed={.7} minPolarAngle={.25} maxPolarAngle={1.46} />
}

function SceneLifecycle({ onContextLost, frameRef, reduced }: {
  onContextLost: () => void
  frameRef?: RefObject<HTMLSpanElement | null>
  reduced: boolean
}) {
  const renderer = useThree(state => state.gl)
  const accumulated = useRef(0)
  const frames = useRef(0)
  const debugFrame = useRef(0)
  useEffect(() => {
    const canvas = renderer.domElement
    const lost = (event: Event) => { event.preventDefault(); onContextLost() }
    canvas.addEventListener('webglcontextlost', lost)
    return () => canvas.removeEventListener('webglcontextlost', lost)
  }, [renderer, onContextLost])
  useEffect(() => () => window.cancelAnimationFrame(debugFrame.current), [])
  useFrame(({ gl, camera }, delta) => {
    if (!frameRef?.current) return
    const position = 'cam ' + camera.position.toArray().map(value => value.toFixed(1)).join(' / ')
    if (reduced) {
      window.cancelAnimationFrame(debugFrame.current)
      debugFrame.current = window.requestAnimationFrame(() => {
        if (frameRef.current) frameRef.current.textContent = 'On demand · FPS idle · ms — · ' + gl.info.render.calls + ' draws · ' + position
      })
      return
    }
    if (delta > .5) return
    frames.current++
    accumulated.current += delta
    if (accumulated.current < .45) return
    frameRef.current.textContent = [
      Math.round(frames.current / accumulated.current) + ' FPS', (accumulated.current * 1000 / frames.current).toFixed(1) + ' ms',
      gl.info.render.calls + ' draws', position,
    ].join('  ·  ')
    frames.current = 0
    accumulated.current = 0
  })
  return null
}

interface SceneProps {
  mode: Mode
  selected: BasinId
  hovered: BasinId | null
  reset: number
  reduced: boolean
  visible: boolean
  readings: Record<BasinId, ReturnType<typeof getBasinReading>>
  state: ReturnType<typeof deriveTwinState>
  weather: Weather
  previewIrrigation: boolean
  frameRef?: RefObject<HTMLSpanElement | null>
  labelRefs: RefObject<Partial<Record<BasinId | 'zone' | 'level', HTMLElement>>>
  onPick: (id: BasinId) => void
  onHover: (id: BasinId | null) => void
  onContextLost: () => void
}

function ProjectLabels({ labels, mode, selected, readings, reduced }: Pick<SceneProps, 'mode' | 'selected' | 'readings' | 'reduced'> & { labels: SceneProps['labelRefs'] }) {
  const point = useMemo(() => new Vector3(), [])
  const waterline = useRef({ id: selected, y: readings[selected].surface })
  useFrame(({ camera, size }, delta) => {
    camera.updateMatrixWorld()
    const surface = readings[selected].surface
    if (waterline.current.id !== selected || reduced) waterline.current = { id: selected, y: surface }
    else waterline.current.y += (surface - waterline.current.y) * (1 - Math.exp(-2.3 * delta / motion.data))
    for (const id of [...basinIds, 'zone', 'level'] as const) {
      const label = labels.current[id]
      if (!label) continue
      if (id === 'zone') point.set(terrain.outage.x - 6.5, 4.8, terrain.outage.z + 3.8)
      else if (id === 'level') {
        const site = siteBasins[selected]
        point.set(site.x + site.width / 2 - .32, waterline.current.y, site.z + site.length * .24)
      }
      else {
        const site = siteBasins[id]
        point.set(site.x, mode === 'cutaway' && selected === id ? 1.15 : 2.25, site.z)
      }
      point.project(camera)
      const shown = Math.abs(point.x) < .89 && Math.abs(point.y) < .88 && Math.abs(point.z) < 1
      label.style.visibility = shown ? 'visible' : 'hidden'
      if (!shown) continue
      label.style.left = ((point.x * .5 + .5) * size.width).toFixed(1) + 'px'
      label.style.top = ((.5 - point.y * .5) * size.height).toFixed(1) + 'px'
    }
  })
  return null
}

const atmosphere = {
  sunny: { sky: colors.sky, horizon: colors.horizon, sun: light.sunIntensity },
  cloudy: { sky: '#465761', horizon: '#62747e', sun: .85 },
  rain: { sky: '#293a49', horizon: '#485b6a', sun: .55 },
}

function World({ mode, selected, hovered, reset, reduced, readings, state, weather, previewIrrigation, onPick, onHover }: SceneProps) {
  const masonry = useMasonry()
  const cutaway = mode === 'cutaway'
  const cutBasin = cutaway ? selected : undefined
  const sun = useRef<DirectionalLight>(null)
  const lighting = atmosphere[weather]
  useLayoutEffect(() => {
    if (!sun.current) return
    sun.current.shadow.autoUpdate = false
    sun.current.shadow.needsUpdate = true
  }, [cutBasin])
  return <>
    <color attach="background" args={[lighting.sky]} />
    <fog attach="fog" args={[lighting.horizon, 72, 156]} />
    <hemisphereLight args={[light.sky, light.ground, light.ambientIntensity]} />
    <directionalLight ref={sun} color={light.sun} intensity={lighting.sun} position={light.position} castShadow
      shadow-mapSize-width={light.shadowSize} shadow-mapSize-height={light.shadowSize}
      shadow-camera-left={-light.shadowRadius} shadow-camera-right={light.shadowRadius}
      shadow-camera-top={light.shadowRadius} shadow-camera-bottom={-light.shadowRadius}
      shadow-camera-near={.5} shadow-camera-far={95}
      shadow-bias={-.00045} shadow-normalBias={.045} shadow-radius={2} />
    <Sea frozen={reduced} />
    <Terrain selectedCut={cutBasin} texture={masonry} />
    <GroundOcclusion />
    <BuildingsAndGarden texture={masonry} />
    {basinIds.map(id => <Basin key={id} id={id} reading={readings[id]} selected={selected === id} hovered={hovered === id}
      cutaway={cutaway && selected === id} frozen={reduced} texture={masonry} onPick={onPick} onHover={onHover} />)}
    {state.outage && <OutageLayer frozen={reduced} />}
    <Pipes cutaway={cutaway} authorized={state.route} preview={previewIrrigation} frozen={reduced} />
    {weather === 'rain' && <Rain frozen={reduced} />}
    <CameraRig mode={mode} selected={selected} reset={reset} reduced={reduced} />
  </>
}

export default function TwinCanvas(props: SceneProps) {
  return <Canvas orthographic shadows="percentage" dpr={[1, 1.35]} frameloop={!props.visible ? 'never' : props.reduced ? 'demand' : 'always'}
    camera={{ position: cameraConfig.neighborhood.position, zoom: cameraConfig.initialZoom, near: cameraConfig.near, far: cameraConfig.far }}
    gl={{ antialias: true, powerPreference: 'high-performance', alpha: false }}
    onCreated={({ gl }) => { gl.toneMappingExposure = 1.06 }}
    fallback={<span className="twin-message" aria-hidden="true">WebGL unavailable. Use the site schematic.</span>}>
    <World {...props} />
    <ProjectLabels labels={props.labelRefs} mode={props.mode} selected={props.selected} readings={props.readings} reduced={props.reduced} />
    <SceneLifecycle onContextLost={props.onContextLost} frameRef={props.frameRef} reduced={props.reduced} />
  </Canvas>
}
