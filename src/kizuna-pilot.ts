import {
  applyKizunaCommand, createKizunaLocal, kizunaAvailable, kizunaBackupFlow, kizunaOpenings, kizunaWeather,
  KIZUNA_BACKUP_MAX_FLOW, tickKizuna,
} from './kizuna-model.ts'
import type { KizunaLocal } from './kizuna-model.ts'
import { consumeGenerator, generatorSettings, generatorStatus } from './generator.ts'
import type { Generator } from './generator.ts'

export const KIZUNA_HOUSEHOLD_DEMAND = 2.4
export const KIZUNA_DISTRIBUTION_SECTORS = ['Nord', 'Abords du parc', 'Est']
const quarterHour = 15 * 60_000
const day = 24 * 60 * 60_000
const motorLimit = 75
const waterLimit = 45
const motors = [0, 1, 2, 3] // 0 is the shared backup motor.

export type PilotAdvice = { basin: number; profile: 'normal' | 'economy' }
export type KizunaPilot = KizunaLocal & {
  clock: number
  outageAt: number | null
  nextCleaning: number
  lastCleaning: number | null
  settlingUntil: Partial<Record<number, number>>
  missingLevels: Partial<Record<number, number>>
  waterC: number
  motorsC: Record<number, number>
  hotMotors: number[]
  advice: PilotAdvice | null
  generator: Generator
}

function nextYear(at: number) {
  const date = new Date(at)
  const month = date.getUTCMonth()
  date.setUTCFullYear(date.getUTCFullYear() + 1)
  if (date.getUTCMonth() !== month) date.setUTCDate(0)
  return date.getTime()
}

export function createKizunaPilot(at = Date.now()): KizunaPilot {
  const date = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Africa/Tunis', dateStyle: 'short' }).format(at)
  const clock = Date.parse(date + 'T11:00:00+01:00')
  return {
    ...createKizunaLocal(), clock, outageAt: null, nextCleaning: nextYear(clock), lastCleaning: null,
    settlingUntil: {}, missingLevels: {}, waterC: 28, motorsC: { 0: 28, 1: 28, 2: 28, 3: 28 }, hotMotors: [], advice: null,
    generator: { settings: { ...generatorSettings }, running: false },
  }
}

export function pilotAvailability(pilot: KizunaPilot) {
  return pilot.state.basins.flatMap(basin => {
    const volume = kizunaAvailable(basin) ?? 0
    return volume > 0 && (pilot.settlingUntil[basin.id] ?? 0) <= pilot.clock ? [{ id: basin.id, volume }] : []
  }).sort((a, b) => b.volume - a.volume || a.id - b.id)
}

export function pilotPumpBlock(pilot: KizunaPilot, motor: number, basin: number) {
  if (pilot.waterC >= waterLimit || pilot.hotMotors.includes(motor)) return 'Protection thermique active.'
  if ((pilot.settlingUntil[basin] ?? 0) > pilot.clock) return 'Bassin en décantation.'
  if (motor === 0 && pilot.state.backupLeak && pilot.automatic) return 'Conduite de secours isolée après une fuite.'
  if (pilot.automatic && ['rain', 'clouds'].includes(pilot.weather)) {
    return pilot.weather === 'rain' ? 'Pompes à l’arrêt pendant la pluie.' : 'Pompes à l’arrêt par temps nuageux.'
  }
  if (pilotPower(pilot).capacityW < 120) return 'Puissance disponible insuffisante pour une pompe.'
  return null
}

export function pilotPower(pilot: KizunaPilot) {
  const solarW = kizunaWeather(pilot.weather, pilot.state).watts
  const generator = generatorStatus(pilot.generator, solarW, pilot.state.pumpLoadW)
  return { solarW, generator, capacityW: solarW + generator.capacityW }
}

export function pilotPlan(pilot: KizunaPilot) {
  const sources = pilotAvailability(pilot)
  const active = pilot.state.backupBasin
  const selected = sources.find(basin => basin.id === active) ?? sources.find(basin => basin.id === pilot.advice?.basin) ?? sources[0]
  const target = Math.min(KIZUNA_BACKUP_MAX_FLOW, KIZUNA_HOUSEHOLD_DEMAND * (pilot.advice?.profile === 'economy' ? .8 : 1))
  const stock = sources.reduce((total, basin) => total + basin.volume, 0)
  const opening = active ? kizunaOpenings(pilot)[active] : 0
  const gross = kizunaBackupFlow(pilot.state, opening)
  const delivered = gross / (pilot.state.backupLeak ? 1.75 : 1)
  const block = pilotPumpBlock(pilot, 0, selected?.id ?? 0) ?? (!selected ? 'Aucun bassin mesuré et disponible au-dessus de sa réserve.' : null)
  return { selected, block, stock, target, delivered, hours: stock / target, shortfall: Math.max(0, KIZUNA_HOUSEHOLD_DEMAND - delivered) }
}

export function thermalRate(waterC: number) {
  return 1 + Math.max(0, waterC - 25) * .35
}

export function reconcileKizunaPilot(pilot: KizunaPilot, at: number): KizunaPilot {
  const hotMotors = motors.filter(id => pilot.motorsC[id] >= motorLimit || pilot.hotMotors.includes(id) && pilot.motorsC[id] > 62)
  let next = { ...pilot, hotMotors }
  const due = next.outageAt !== null && next.clock >= next.outageAt
  const capacity = Math.floor(pilotPower(next).capacityW / 120)
  let kept = 0
  for (const basin of next.state.basins) {
    if (!basin.pumpOn) continue
    if (pilotPumpBlock(next, basin.id, basin.id) || kept >= capacity || next.automatic && due) {
      next = { ...next, ...applyKizunaCommand(next, 'stop_pump', basin.id, at) }
    } else kept++
  }
  const active = next.state.backupBasin
  if (active && (pilotPumpBlock(next, 0, active) || kept >= capacity)) {
    next = { ...next, ...applyKizunaCommand(next, 'stop_backup', active, at) }
  }
  if (!next.automatic || !due) return next
  const plan = pilotPlan(next)
  if (plan.block || !plan.selected) return next
  next.backupOpening = plan.target / KIZUNA_BACKUP_MAX_FLOW * 100
  if (!next.state.backupBasin) next = { ...next, ...applyKizunaCommand(next, 'start_backup', plan.selected.id, at) }
  return next
}

export function advanceKizunaPilot(pilot: KizunaPilot, seconds: number, at: number): KizunaPilot {
  const generator = generatorStatus(pilot.generator)
  if (generator.running && generator.runtime !== null) {
    const availableSeconds = generator.runtime / .25
    if (availableSeconds < seconds) {
      const drained = stepKizunaPilot(pilot, availableSeconds, at)
      return stepKizunaPilot(drained, seconds - availableSeconds, at)
    }
  }
  return stepKizunaPilot(pilot, seconds, at)
}

function stepKizunaPilot(pilot: KizunaPilot, seconds: number, at: number): KizunaPilot {
  const next = reconcileKizunaPilot(pilot, at)
  const eligible = next.automatic && next.outageAt !== null
  const clock = eligible ? next.clock + seconds * quarterHour : next.clock
  // Debit only flow that was in service during this simulation step.
  const hydraulics = tickKizuna(next, seconds, at)
  const motorsC = Object.fromEntries(motors.map(id => {
    const running = id === 0 ? next.state.backupBasin !== 0 : next.state.basins.some(basin => basin.id === id && basin.pumpOn)
    const temperature = next.motorsC[id]
    return [id, running ? temperature + thermalRate(next.waterC) * seconds * .25
      : Math.max(next.waterC, temperature - 7 * seconds * .25)]
  }))
  const generator = consumeGenerator(next.generator, seconds * .25)
  return reconcileKizunaPilot({ ...next, ...hydraulics, clock, motorsC, generator }, at)
}

export function setPilotSensor(pilot: KizunaPilot, id: number): KizunaPilot {
  const basin = pilot.state.basins.find(item => item.id === id)
  if (!basin) return pilot
  const missing = basin.levelPct === null
  const level = missing ? pilot.missingLevels[id] ?? null : null
  const missingLevels = { ...pilot.missingLevels }
  if (basin.levelPct !== null) missingLevels[id] = basin.levelPct
  else delete missingLevels[id]
  let next = pilot
  const at = Date.now()
  if (basin.pumpOn) next = { ...next, ...applyKizunaCommand(next, 'stop_pump', id, at) }
  if (next.state.backupBasin === id) next = { ...next, ...applyKizunaCommand(next, 'stop_backup', id, at) }
  return reconcileKizunaPilot({ ...next, missingLevels, at, state: {
    ...next.state, basins: next.state.basins.map(item => item.id === id ? {
      ...item, levelPct: level, distanceCm: level === null ? null : Math.round((70 - level * .6) * 10) / 10,
    } : item),
  } }, at)
}

export function completePilotCleaning(pilot: KizunaPilot): KizunaPilot {
  if (pilot.clock < pilot.nextCleaning || pilot.state.pumpLoadW > 0 || pilot.rainLeft > 0) return pilot
  return { ...pilot, lastCleaning: pilot.clock, nextCleaning: nextYear(pilot.clock) }
}

export function simulatePilotDeposit(pilot: KizunaPilot, id: number): KizunaPilot {
  return reconcileKizunaPilot({ ...pilot, settlingUntil: { ...pilot.settlingUntil, [id]: pilot.clock + 7 * day } }, Date.now())
}

export function schedulePilotOutage(pilot: KizunaPilot): KizunaPilot {
  const date = new Date(pilot.clock)
  date.setUTCHours(11, 0, 0, 0) // 12:00 in Borj Râs.
  const noon = date.getTime()
  const active = pilot.state.backupBasin
  const hydraulics = active ? applyKizunaCommand(pilot, 'stop_backup', active, Date.now()) : pilot
  return { ...pilot, ...hydraulics, automatic: true, outageAt: noon <= pilot.clock ? noon + day : noon, advice: null, backupOpening: undefined }
}
