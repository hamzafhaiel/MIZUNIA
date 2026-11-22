export type Location = { latitude: number; longitude: number }
export type Cistern = Location & {
  id: string
  name: string
  capacity: number
  diameter?: number
  sensorId: string
  reading: { liters: number; at: number } | null
}

export const bounds = { west: 11.0682, east: 11.0826, south: 35.5025, north: 35.5107 }
const longitudeSpan = bounds.east - bounds.west
const latitudeSpan = bounds.north - bounds.south

// Simplified OpenStreetMap shoreline. This is a placement aid for the simulation.
const land = [
  [11.063, 35.498], [11.068, 35.498], [11.07087, 35.502304],
  [11.073219, 35.503651], [11.073518, 35.504316], [11.075277, 35.504008],
  [11.078687, 35.504461], [11.079257, 35.504861], [11.078551, 35.505566],
  [11.079576, 35.506302], [11.080209, 35.505655], [11.079217, 35.505209],
  [11.080830, 35.506044], [11.080343, 35.506796], [11.082017, 35.507171],
  [11.082537, 35.507792], [11.081542, 35.508433], [11.082230, 35.508700],
  [11.082398, 35.509688], [11.080621, 35.509557], [11.078798, 35.508416],
  [11.076617, 35.508256], [11.074386, 35.507127], [11.071825, 35.506471],
  [11.071753, 35.505974], [11.068665, 35.504940], [11.068306, 35.505283],
  [11.068619, 35.505684], [11.063, 35.50662],
] as const

export function project({ latitude, longitude }: Location) {
  return { left: (longitude - bounds.west) / longitudeSpan * 100 + '%', top: (bounds.north - latitude) / latitudeSpan * 100 + '%' }
}

export function unproject(x: number, y: number): Location {
  return { longitude: bounds.west + x * longitudeSpan, latitude: bounds.north - y * latitudeSpan }
}

export function isPilotLocation({ latitude, longitude }: Location) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) ||
    latitude < bounds.south || latitude > bounds.north || longitude < bounds.west || longitude > bounds.east) return false
  let inside = false
  for (let i = 0, j = land.length - 1; i < land.length; j = i++) {
    const [x, y] = land[i]
    const [previousX, previousY] = land[j]
    if ((y > latitude) !== (previousY > latitude) && longitude < x + (previousX - x) * (latitude - y) / (previousY - y)) inside = !inside
  }
  return inside
}

export function demoCisterns(now = Date.now()): Cistern[] {
  return [
    { id: 'FQ-001', name: 'Msatha', latitude: 35.50468, longitude: 11.07160, capacity: 3000, diameter: 1.6, sensorId: 'WOKWI-01', reading: { liters: 1800, at: now - 120000 } },
    { id: 'FQ-002', name: 'Bassin 2', latitude: 35.50646, longitude: 11.07525, capacity: 2400, diameter: 1.5, sensorId: 'WOKWI-02', reading: { liters: 460, at: now - 180000 } },
    { id: 'FQ-003', name: 'Bassin 3', latitude: 35.50742, longitude: 11.07835, capacity: 2600, diameter: 1.55, sensorId: 'WOKWI-03', reading: null },
  ]
}

type Registration = Location & { name: string; capacity: number; diameter?: number; sensorId: string }
const validDiameter = (diameter: number | undefined) => diameter === undefined || Number.isFinite(diameter) && diameter >= .01

export function registerCistern(registry: Cistern[], draft: Registration): { cistern: Cistern } | { error: string } {
  const name = draft.name.trim()
  const sensorId = draft.sensorId.trim().toUpperCase()
  if (!name || name.length > 60) return { error: 'Saisissez un nom de 1 à 60 caractères.' }
  if (!isPilotLocation(draft)) return { error: 'Choisissez un emplacement à terre dans la zone de la carte.' }
  if (!Number.isInteger(draft.capacity) || draft.capacity < 1 || draft.capacity > 1000000) return { error: 'Indiquez une capacité de 1 à 1 000 000 L.' }
  if (!validDiameter(draft.diameter)) return { error: 'Indiquez un diamètre d’au moins 0,01 m.' }
  if (!/^[A-Z0-9][A-Z0-9_-]{2,31}$/.test(sensorId)) return { error: 'Utilisez entre 3 et 32 caractères pour le capteur. Lettres, chiffres, tirets et traits de soulignement sont acceptés.' }
  if (registry.some(cistern => cistern.sensorId === sensorId)) return { error: 'Ce capteur est déjà associé à une citerne.' }
  const next = Math.max(0, ...registry.map(cistern => Number(cistern.id.slice(3)))) + 1
  return { cistern: { ...draft, name, sensorId, id: 'FQ-' + String(next).padStart(3, '0'), reading: null } }
}

export function updateCisternDiameter(registry: Cistern[], id: string, diameter?: number) {
  if (!validDiameter(diameter)) return registry
  return registry.map(cistern => cistern.id === id ? { ...cistern, diameter } : cistern)
}

export function applySensorReading(registry: Cistern[], sensorId: string, liters: number, at = Date.now()): Cistern[] {
  const target = registry.find(cistern => cistern.sensorId === sensorId.trim().toUpperCase())
  if (!target || !Number.isFinite(liters) || liters < 0 || liters > target.capacity ||
    !Number.isFinite(at) || (target.reading && at < target.reading.at)) return registry
  return registry.map(cistern => cistern.id === target.id ? { ...cistern, reading: { liters, at } } : cistern)
}

export const registryStorageKey = 'fas9ia-cistern-registry-v1'

export function readCisterns(): Cistern[] | null {
  try {
    const raw = localStorage.getItem(registryStorageKey)
    if (!raw) return null
    const value = JSON.parse(raw) as Cistern[]
    if (!Array.isArray(value) || value.length < 3 || !value.every(cistern => cistern && /^FQ-\d{3,}$/.test(cistern.id) &&
      typeof cistern.name === 'string' && typeof cistern.sensorId === 'string' && isPilotLocation(cistern) &&
      Number.isInteger(cistern.capacity) && cistern.capacity > 0 &&
      (cistern.reading === null || (cistern.reading && Number.isFinite(cistern.reading.at) &&
        Number.isFinite(cistern.reading.liters) && cistern.reading.liters >= 0 && cistern.reading.liters <= cistern.capacity)))) return null
    return value.map(cistern => validDiameter(cistern.diameter) ? cistern : { ...cistern, diameter: undefined })
  } catch {
    return null
  }
}

export function saveCisterns(cisterns: Cistern[]) {
  try {
    localStorage.setItem(registryStorageKey, JSON.stringify(cisterns))
    return true
  } catch {
    return false
  }
}
