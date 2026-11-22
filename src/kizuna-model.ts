export const KIZUNA_ACTIONS = [
  'start_rain', 'start_pump', 'stop_pump', 'set_manual', 'reset', 'set_drip', 'set_sprinkler',
  'start_backup', 'stop_backup', 'enable_backup_leak', 'clear_backup_leak',
  'request_masonry_inspection', 'clear_masonry_inspection',
] as const
export type KizunaAction = typeof KIZUNA_ACTIONS[number]
const phases = ['manual', 'ready', 'rain', 'after_rain', 'outage', 'watering', 'complete'] as const
export const KIZUNA_IDS = [1, 2, 3] as const
export const KIZUNA_CAPACITY_M3 = 42
export const KIZUNA_DIAMETER_M = 9.4
export const KIZUNA_MIN_LEVEL = 20
export const KIZUNA_CISTERNS = ['FQ-001', 'FQ-002', 'FQ-003']

export type KizunaBasin = {
  id: number; levelPct: number | null; distanceCm: number | null; minLevelPct: number;
  mode: 'manual' | 'auto'; phase: typeof phases[number]; pumpOn: boolean; pumpReason: string;
  irrigationMode: 'drip' | 'sprinkler'; rainOn: boolean; networkOutage: boolean; masonryInspection: boolean;
}
export type KizunaState = {
  v: 1; basins: KizunaBasin[]; temperatureC: number | null; soilMoisturePct: number; turbidityPct: number;
  solarNominalW: number; pumpLoadW: number; backupBasin: number; backupLeak: boolean;
  backupReason: string; cleaningCheck: boolean;
}
export type KizunaSource = 'kizuna' | 'wokwi'
export type WeatherName = 'sun' | 'clouds' | 'rain' | 'night'
export type PressureTest = 'normal' | 'leak' | null
export type KizunaWeather = { irradiance: number; temperature: number; rain: number; watts: number }
export type KizunaHistory = { at: number; levels: (number | null)[] }[]
export type KizunaLocal = {
  state: KizunaState; weather: WeatherName; rainLeft: number; at: number;
  openings: Record<number, number>; automatic: boolean; error: string | null;
  backupOpening?: number;
}

export const isKizunaAction = (value: unknown): value is KizunaAction => KIZUNA_ACTIONS.some(action => action === value)
export const isKizunaBasinId = (value: unknown): value is typeof KIZUNA_IDS[number] => KIZUNA_IDS.some(id => id === value)
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const inRange = (value: unknown, min: number, max: number): value is number => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max

function isBasin(value: unknown): value is KizunaBasin {
  return record(value) && isKizunaBasinId(value.id)
    && (value.levelPct === null || inRange(value.levelPct, 0, 100))
    && (value.distanceCm === null || inRange(value.distanceCm, 0, 500))
    && inRange(value.minLevelPct, 0, 100)
    && (value.mode === 'manual' || value.mode === 'auto') && phases.some(phase => phase === value.phase)
    && (value.irrigationMode === 'drip' || value.irrigationMode === 'sprinkler')
    && typeof value.pumpOn === 'boolean' && typeof value.pumpReason === 'string'
    && typeof value.rainOn === 'boolean' && typeof value.networkOutage === 'boolean' && typeof value.masonryInspection === 'boolean'
}

export function parseKizunaState(value: unknown): KizunaState | null {
  if (!record(value) || value.v !== 1 || !Array.isArray(value.basins) || value.basins.length !== KIZUNA_IDS.length
    || !(value.temperatureC === null || inRange(value.temperatureC, -100, 150))
    || !inRange(value.soilMoisturePct, 0, 100) || !inRange(value.turbidityPct, 0, 100)
    || !inRange(value.solarNominalW, 0, Number.MAX_SAFE_INTEGER) || !inRange(value.pumpLoadW, 0, Number.MAX_SAFE_INTEGER)
    || !(value.backupBasin === 0 || isKizunaBasinId(value.backupBasin))
    || typeof value.backupLeak !== 'boolean' || typeof value.backupReason !== 'string' || typeof value.cleaningCheck !== 'boolean') return null
  const basins: KizunaBasin[] = []
  for (const id of KIZUNA_IDS) {
    const basin: unknown = value.basins.find(item => record(item) && item.id === id)
    if (!isBasin(basin)) return null
    basins.push(basin)
  }
  const { temperatureC, soilMoisturePct, turbidityPct, solarNominalW, pumpLoadW, backupBasin, backupLeak, backupReason, cleaningCheck } = value
  return { v: 1, basins, temperatureC, soilMoisturePct, turbidityPct, solarNominalW, pumpLoadW, backupBasin, backupLeak, backupReason, cleaningCheck }
}

const presets = {
  sun: { irradiance: 950, temperature: 28, rain: 0 },
  clouds: { irradiance: 360, temperature: 22, rain: 0 },
  rain: { irradiance: 120, temperature: 18, rain: 8 },
  night: { irradiance: 0, temperature: 15, rain: 0 },
} satisfies Record<WeatherName, Omit<KizunaWeather, 'watts'>>

export function kizunaWeather(name: WeatherName, state: KizunaState | null) {
  const preset = presets[name]
  const temperature = state?.temperatureC ?? preset.temperature
  const cellTemperature = temperature + 25 * preset.irradiance / 800
  const watts = Math.max(0, (state?.solarNominalW ?? 0) * preset.irradiance / 1000 * .86 * (1 - .004 * (cellTemperature - 25)))
  return { ...preset, temperature, watts }
}

export const kizunaVolume = (basin: KizunaBasin) => basin.levelPct === null ? null : KIZUNA_CAPACITY_M3 * basin.levelPct / 100
export const kizunaAvailable = (basin: KizunaBasin) => basin.levelPct === null ? null : KIZUNA_CAPACITY_M3 * Math.max(0, basin.levelPct - basin.minLevelPct) / 100
const irrigationRate = (basin: KizunaBasin) => basin.irrigationMode === 'sprinkler' ? 4.5 : 3
const backupRate = (state: KizunaState) => state.backupLeak ? 3.5 : 2
const simulatedHoursPerSecond = .25
const flowForRate = (rate: number, opening: number) => rate * KIZUNA_CAPACITY_M3 * opening / 10000 / simulatedHoursPerSecond
export const kizunaBasinFlow = (basin: KizunaBasin, opening = 100) => basin.pumpOn ? flowForRate(irrigationRate(basin), opening) : 0
export const kizunaBackupFlow = (state: KizunaState, opening = 100) => state.backupBasin ? flowForRate(backupRate(state), opening) : 0
export const KIZUNA_BACKUP_MAX_FLOW = flowForRate(2, 100)

export function estimateKizunaPressure(flowM3h: number, leak: boolean) {
  const flowLps = flowM3h / 3.6
  const inletBar = flowLps > 0 ? 3 : 0
  const loss = (lengthM: number, litresPerSecond: number) => {
    const velocity = litresPerSecond / 1000 / (Math.PI * .04 ** 2 / 4)
    return .025 * lengthM / .04 * 1000 * velocity ** 2 / 200000
  }
  const expectedDropBar = loss(100, flowLps)
  const measuredDropBar = loss(50, flowLps * (leak ? 1.75 : 1)) + loss(50, flowLps)
  const excessDropBar = measuredDropBar - expectedDropBar
  return { inletBar, outletBar: Math.max(0, inletBar - measuredDropBar), expectedDropBar, measuredDropBar, excessDropBar, suspectedLeak: excessDropBar > .12 }
}

const endPump = (basin: KizunaBasin, reason: string): KizunaBasin => ({ ...basin, pumpOn: false, pumpReason: reason })
const distanceForLevel = (level: number) => Math.round((70 - level * .6) * 10) / 10
const withLoad = (state: KizunaState): KizunaState => ({
  ...state, pumpLoadW: 120 * (Number(state.backupBasin !== 0) + state.basins.filter(basin => basin.pumpOn).length),
})

export function createKizunaLocal(): KizunaLocal {
  const basins = [62, 77, 32].map((levelPct, index): KizunaBasin => ({
    id: index + 1, levelPct, distanceCm: distanceForLevel(levelPct), minLevelPct: KIZUNA_MIN_LEVEL,
    mode: 'manual', phase: 'manual', pumpOn: false, pumpReason: 'initial', rainOn: false,
    networkOutage: false, irrigationMode: 'drip', masonryInspection: false,
  }))
  return {
    state: { v: 1, basins, temperatureC: 28, soilMoisturePct: 42, turbidityPct: 35,
      solarNominalW: 450, pumpLoadW: 0, backupBasin: 0, backupLeak: false, backupReason: 'initial', cleaningCheck: false },
    weather: 'sun', rainLeft: 0, openings: { 1: 100, 2: 100, 3: 100 }, automatic: false, error: null, at: Date.now(),
  }
}

export function kizunaOpenings(local: KizunaLocal): Record<number, number> {
  if (!local.automatic) return local.openings
  return Object.fromEntries(local.state.basins.map(basin => {
    const available = Math.max(0, (basin.levelPct ?? 0) - basin.minLevelPct)
    const running = basin.pumpOn || local.state.backupBasin === basin.id
    const limit = local.state.backupBasin === basin.id ? local.backupOpening ?? 100 : 100
    return [basin.id, running && !basin.rainOn ? Math.min(limit, Math.round(available * 10)) : 0]
  }))
}

export function kizunaReason(reason: string) {
  const reasons: Record<string, string> = {
    level_too_low: 'Le bassin a atteint sa réserve protégée.',
    sensor_unavailable: 'Le capteur ne fournit aucun niveau valide.',
    rain_in_progress: 'La collecte de pluie est en cours.',
    stop_pumps_before_rain: 'Arrêtez les pompes avant de lancer la pluie.',
    backup_already_running: 'La pompe de secours est déjà en service.',
    source_irrigating: 'Arrêtez l’arrosage sur ce bassin avant de lancer le secours.',
    awaiting_outage: 'Sélectionnez le mode capteur ou attendez la coupure après la pluie.',
    scenario_not_ready: 'Le scénario de pluie doit être réinitialisé.',
  }
  return Object.hasOwn(reasons, reason) ? reasons[reason] : 'Commande refusée par la simulation.'
}

export function changeKizunaWeather(local: KizunaLocal, name: WeatherName, at: number): KizunaLocal {
  if (name === 'rain') return applyKizunaCommand(local, 'start_rain', 1, at)
  const basins = local.rainLeft > 0 ? local.state.basins.map(basin => ({ ...basin, rainOn: false, phase: 'outage' as const, networkOutage: true })) : local.state.basins
  return { ...local, weather: name, rainLeft: 0, error: null, at, state: { ...local.state, basins, temperatureC: presets[name].temperature } }
}

export function applyKizunaCommand(local: KizunaLocal, action: KizunaAction, basinId: number, at: number): KizunaLocal {
  const { state } = local
  const basin = state.basins.find(item => item.id === basinId)
  if (!basin) return local
  const reject = (reason: string) => ({ ...local, error: kizunaReason(reason) })
  const update = (patch: Partial<KizunaState>, target = basin): KizunaLocal => ({
    ...local, at, error: null, state: withLoad({ ...state, basins: state.basins.map(item => item.id === basinId ? target : item), ...patch }),
  })
  switch (action) {
    case 'start_rain':
      if (local.rainLeft > 0) return reject('rain_in_progress')
      if (state.pumpLoadW > 0) return reject('stop_pumps_before_rain')
      return {
        ...update({ temperatureC: presets.rain.temperature, basins: state.basins.map(item => ({
          ...item, mode: 'auto', phase: 'rain', rainOn: true, networkOutage: false,
        })) }),
        weather: 'rain', rainLeft: 12,
      }
    case 'start_pump':
    case 'start_backup': {
      if (local.rainLeft > 0) return reject('rain_in_progress')
      if (action === 'start_backup' && basin.pumpOn) return reject('source_irrigating')
      if ((action === 'start_backup' && state.backupBasin !== 0) || state.backupBasin === basinId) return reject('backup_already_running')
      if (basin.levelPct === null) return reject('sensor_unavailable')
      if (basin.levelPct <= basin.minLevelPct) return reject('level_too_low')
      if (action === 'start_backup') return update({ backupBasin: basinId, backupReason: 'started' }, { ...basin, mode: 'auto', phase: 'outage', networkOutage: true })
      return update({}, { ...basin, mode: 'auto', phase: 'watering', networkOutage: true, pumpOn: true, pumpReason: 'started' })
    }
    case 'stop_pump':
      return update({}, basin.pumpOn ? { ...endPump(basin, 'stopped'), phase: 'outage' } : basin)
    case 'stop_backup':
      return update({ backupBasin: 0, backupReason: 'stopped' })
    case 'enable_backup_leak':
    case 'clear_backup_leak':
      return update({ backupLeak: action === 'enable_backup_leak' })
    case 'set_drip':
    case 'set_sprinkler':
      return update({}, { ...basin, irrigationMode: action === 'set_drip' ? 'drip' : 'sprinkler' })
    case 'reset':
    case 'set_manual': {
      if (local.rainLeft > 0) return reject('rain_in_progress')
      if (state.backupBasin === basinId) return reject('backup_already_running')
      const reset = action === 'reset'
      return update({}, { ...endPump(basin, 'reset'), mode: reset ? 'auto' : 'manual', phase: reset ? 'ready' : 'manual',
        levelPct: reset ? 35 : basin.levelPct, distanceCm: reset ? distanceForLevel(35) : basin.distanceCm, networkOutage: false })
    }
    case 'request_masonry_inspection':
    case 'clear_masonry_inspection':
      return update({}, { ...basin, masonryInspection: action === 'request_masonry_inspection' })
  }
}

export function setKizunaDistance(local: KizunaLocal, id: number, distanceCm: number, at: number): KizunaLocal {
  if (!inRange(distanceCm, 10, 70)) return local
  return { ...local, at, state: { ...local.state, basins: local.state.basins.map(basin => basin.id === id && basin.mode === 'manual'
    ? { ...basin, distanceCm, levelPct: (70 - distanceCm) / .6 } : basin) } }
}

export function tickKizuna(local: KizunaLocal, seconds: number, at: number): KizunaLocal {
  if (seconds <= 0 || (local.rainLeft === 0 && local.state.pumpLoadW === 0)) return local
  const { state } = local
  const openings = kizunaOpenings(local)
  const rainLeft = Math.max(0, local.rainLeft - seconds)
  let backupBasin = state.backupBasin
  const basins = state.basins.map((basin): KizunaBasin => {
    if (basin.rainOn) {
      const levelPct = basin.levelPct === null ? null : Math.min(100, basin.levelPct + 4 * Math.min(seconds, local.rainLeft))
      return { ...basin, levelPct, distanceCm: levelPct === null ? null : distanceForLevel(levelPct), rainOn: rainLeft > 0,
        phase: rainLeft > 0 ? 'rain' : 'outage', networkOutage: rainLeft === 0 }
    }
    if (basin.levelPct === null) return basin
    const isBackup = state.backupBasin === basin.id
    if (!basin.pumpOn && !isBackup) return basin
    const rate = isBackup ? backupRate(state) : irrigationRate(basin)
    const levelPct = Math.max(basin.minLevelPct, basin.levelPct - rate * openings[basin.id] / 100 * seconds)
    const reachedReserve = levelPct <= basin.minLevelPct + .06
    if (reachedReserve && isBackup) backupBasin = 0
    const next = { ...basin, levelPct: reachedReserve ? basin.minLevelPct : levelPct, distanceCm: distanceForLevel(levelPct) }
    return reachedReserve && basin.pumpOn ? { ...endPump(next, 'level_too_low'), phase: 'complete' } : next
  })
  const moisture = basins.some(basin => kizunaBasinFlow(basin, openings[basin.id]) > 0) ? 2 : local.rainLeft > 0 ? 1 : 0
  const weather = local.rainLeft > 0 && rainLeft === 0 ? 'clouds' : local.weather
  return { ...local, at, rainLeft, weather, state: withLoad({
    ...state, basins, temperatureC: presets[weather].temperature, soilMoisturePct: Math.min(100, state.soilMoisturePct + moisture * seconds), backupBasin,
    backupReason: backupBasin === state.backupBasin ? state.backupReason : 'level_too_low',
  }) }
}
