import { activeIncident, availableReserve, supplyStatus } from '../model.ts'
import type { DashboardState } from '../model.ts'
import { annex, camera, siteBasins } from './config.ts'
import type { BasinId, Mode, Vec3 } from './config.ts'

export interface Pose { position: Vec3; target: Vec3; zoom: number }

export function fillRatio(volume: number, capacity: number) {
  if (!Number.isFinite(volume) || !Number.isFinite(capacity) || capacity <= 0) return 0
  return Math.max(0, Math.min(volume / capacity, 1))
}

export function getBasinReading(state: DashboardState, id: BasinId, annexVolume: number) {
  const main = id === 'B-01'
  const volume = main ? state.stored : annexVolume
  const capacity = main ? state.capacity : annex.capacity
  const definition = siteBasins[id]
  const ratio = fillRatio(volume, capacity)
  return { id, name: definition.name, volume, capacity, ratio, surface: -definition.depth * (1 - ratio) + .035 }
}

export function deriveTwinState(state: DashboardState) {
  const incident = activeIncident(state)
  const status = supplyStatus(state)
  const reserve = availableReserve(state)
  return {
    outage: status === 'Low pressure' && Boolean(incident),
    unknown: status === 'Unknown',
    route: Boolean(incident?.actions.includes('approve')) && status === 'Low pressure'
      && reserve !== null && reserve >= state.demand,
  }
}

export function cameraPose(mode: Mode, id: BasinId, width: number, height: number): Pose {
  const site = siteBasins[id]
  const size = Math.max(1, Math.min(height, width / 1.39))
  if (mode === 'neighborhood') return { position: camera.neighborhood.position, target: camera.neighborhood.target, zoom: size / camera.neighborhood.span }
  const preset = camera[mode]
  return {
    position: [site.x + preset.offset[0], preset.offset[1], site.z + preset.offset[2]],
    target: [site.x, preset.targetY, site.z],
    zoom: size / (preset.span * (id === 'B-02' ? .76 : 1)),
  }
}

export function interpolatePose(start: Pose, end: Pose, progress: number): Pose {
  if (progress <= 0) return start
  if (progress >= 1) return end
  const easing = progress * progress * (3 - 2 * progress)
  const lerp = (a: number, b: number) => a + (b - a) * easing
  const vector = (a: Vec3, b: Vec3): Vec3 => [lerp(a[0], b[0]), lerp(a[1], b[1]), lerp(a[2], b[2])]
  return { position: vector(start.position, end.position), target: vector(start.target, end.target), zoom: lerp(start.zoom, end.zoom) }
}
