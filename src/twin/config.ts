import { motion } from '../motion.ts'

export type Vec3 = [number, number, number]
type Point = [number, number]
export type BasinId = 'B-01' | 'B-02'
export type Mode = 'neighborhood' | 'inspection' | 'cutaway'

export const colors = {
  sky: '#112c37', horizon: '#214751', sea: '#235257', deepSea: '#102e3a',
  water: '#419f98', basinDeep: '#15565d', stone: '#cbb48a', innerStone: '#92836b',
  plaster: '#e8d5b5', path: '#ab9274', soil: '#b9a181', pine: '#465c36',
  mint: '#5cbdb2', alert: '#c78d51', pipe: '#688e89',
} as const

export const terrain = {
  outline: [[-27, -18], [19, -18], [23, -12], [23, -5], [17, 1], [13, 7],
    [6, 12], [-5, 17], [-16, 20], [-27, 20]] as Point[],
  coast: [[23, -12], [23, -5], [17, 1], [13, 7], [6, 12], [-5, 17], [-16, 20]] as Point[],
  cutLine: 3.15,
  ground: 0,
  sea: -0.82,
  seaSize: 260,
  foundation: 1.4,
  outage: { x: -7, z: -8, width: 18, depth: 11.5 },
}

export const siteBasins = {
  'B-01': { id: 'B-01', name: 'Fatimid Cistern', label: 'Central reserve', x: -1.3, z: 3.1, width: 9.6, length: 7.1, depth: 3.05 },
  'B-02': { id: 'B-02', name: 'North Reservoir', label: 'Annex reserve', x: 10.4, z: -6.35, width: 6.1, length: 4.35, depth: 2.05 },
} as const

export const basinIds: BasinId[] = ['B-01', 'B-02']

export const annex = {
  capacity: 12,
  initialVolume: 7.2,
  history: [6.3, 6.4, 6.4, 6.7, 6.65, 6.8, 7.1, 7.2],
}

export const paths = {
  promenade: [[-20, 13], [-10, 11], [-2, 9.2], [5, 6.35], [10, 2], [18, -4]] as Point[],
  market: [[-22, -4.1], [-16.4, -4.3], [-9, -4.1], [-4.5, -4.5], [1.4, -5.3], [6.5, -4.25]] as Point[],
  garden: [[-9.6, -5], [-9.6, 0], [-8.1, 5.6], [-6.8, 8.9]] as Point[],
  catchment: [[-8.9, -1.5], [-7.4, -.15], [-5, .9]] as Point[],
  transfer: [[3.4, -1.25, 2.85], [6.1, -1.35, 2.9], [8.55, -1.35, .35], [10.4, -1.2, -4.15]] as Vec3[],
  irrigation: [[-5.9, -1.35, 3.2], [-7.15, -1.3, 3.2], [-9.7, -1.05, 4.9], [-11.85, -.15, 6.0]] as Vec3[],
}

type Building = [x: number, z: number, width: number, depth: number, height: number, color: string]
export const buildings: Building[] = [
  [-18.7, -12.45, 4.4, 4.2, 4.0, '#ebe0c8'], [-12.7, -12.0, 4.8, 3.8, 4.9, '#e3d3b7'],
  [-7.3, -12.7, 4.0, 3.5, 3.75, '#eee0ca'], [-1.7, -11.65, 4.35, 4.15, 4.8, '#dfc9a6'],
  [4.1, -12.25, 3.9, 3.6, 3.35, '#ebdfc8'], [9.15, -13.25, 3.8, 3.1, 3.9, '#e5d4ba'],
  [15.2, -13.3, 3.3, 3.7, 3.1, '#ddc6a3'], [-19.8, -7.55, 3.75, 3.2, 2.9, '#e0cfb4'],
  [-14.6, -7.45, 3.8, 3.15, 3.15, '#f0e4cc'], [-9.55, -7.7, 3.3, 3.8, 3.7, '#e8d4b3'],
  [-4.75, -7.8, 3.7, 3.15, 2.85, '#eddfc8'], [.7, -7.95, 3.55, 3.15, 3.65, '#e2cbb0'],
  [-18.6, -1.6, 4.1, 2.8, 2.8, '#e8d7bc'], [-21.3, 3.2, 4, 3.65, 3.4, '#ede1ca'],
  [-15.55, 2.15, 4.25, 3.35, 3.25, '#e5d3b3'], [-19.3, 8.35, 3.8, 3.1, 2.85, '#efdec5'],
  [-15.3, 12.3, 3.2, 2.95, 2.55, '#e1cdb0'], [16.9, -7.7, 2.9, 3.2, 2.85, '#ddc29b'],
  [13.75, -1.65, 3.05, 2.5, 2.5, '#e6d2b2'],
]

export const trees: [x: number, z: number, scale: number][] = [
  [-23, -9, 1.15], [-23, -13, 1.05], [-15.65, -9.5, .8], [-11.2, -4.6, 1.2],
  [-6.7, -2.65, 1], [-4.7, -3.65, .88], [3.85, -1.45, 1.05], [5.6, 3.85, .95],
  [5.7, 7.6, .8], [9.75, 3.7, .92], [19.45, -6.9, .85], [17.3, -10.55, .8],
  [-19, 5.15, .95], [-11.05, 8.45, 1.2], [-9.15, 12, 1.25], [-4.5, 11.7, .94],
  [-16.7, 14.7, 1.25], [-21.1, 14.5, 1.1], [-22.9, 10.15, .74], [-23, 4.5, .9],
  [-17.25, -.5, .7], [-13.12, 1.4, .8], [7.4, -9.85, .92], [13.9, -9.7, .8], [19.1, -15.5, 1.15],
]

export const garden = { x: -12.4, z: 5.3, width: 5.25, length: 4 }
export const gate = { position: [15.2, 0, -4.0] as Vec3, rotation: -.54 }
export const dome = { position: [5.25, 0, -7.6] as Vec3 }
export const light = {
  position: [-21, 22, 14] as Vec3,
  sun: '#fff0d6', sky: '#e7f4ff', ground: '#7e735b',
  sunIntensity: 2.32, ambientIntensity: 1.34, shadowSize: 1536, shadowRadius: 33,
}

export const camera = {
  neighborhood: { position: [37, 30, 45] as Vec3, target: [-3, .4, -1] as Vec3, span: 37 },
  inspection: { offset: [10.4, 12.5, 14.8] as Vec3, targetY: -.34, span: 15.1 },
  cutaway: { offset: [7.3, 6.8, 15.1] as Vec3, targetY: -1.28, span: 14.6 },
  duration: motion.camera, initialZoom: 14, near: .1, far: 290,
}

export const particles = { rainCount: 375, routeCount: 10, width: 43, depth: 31, height: 16 }
export const sectionPipe = { radius: .17, flange: .245, segments: 22, radialSegments: 8 }
