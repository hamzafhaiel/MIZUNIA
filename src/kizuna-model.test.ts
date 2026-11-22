import test from 'node:test'
import assert from 'node:assert/strict'
import {
  applyKizunaCommand, changeKizunaWeather, createKizunaLocal, estimateKizunaPressure, kizunaAvailable,
  kizunaBasinFlow, kizunaWeather, parseKizunaState, setKizunaDistance, tickKizuna,
} from './kizuna-model.ts'
import {
  advanceKizunaPilot, completePilotCleaning, createKizunaPilot, pilotPlan, pilotPower, reconcileKizunaPilot,
  schedulePilotOutage, setPilotSensor, simulatePilotDeposit,
} from './kizuna-pilot.ts'

test('validates KIZUNA v1 telemetry, preserves unavailable readings and orders the three basins', () => {
  const { state } = createKizunaLocal()
  const [one, two, three] = state.basins
  const reading = { ...state, basins: [three, { ...two, levelPct: null, distanceCm: null }, one] }
  assert.deepEqual(parseKizunaState(reading)?.basins.map(basin => [basin.id, basin.levelPct]), [[1, 62], [2, null], [3, 32]])
  assert.equal(parseKizunaState({ ...state, basins: [one, two, two] }), null)
  assert.equal(parseKizunaState({ ...state, basins: [one, { ...two, levelPct: 101 }, three] }), null)
  assert.equal(parseKizunaState({ ...state, pumpLoadW: -1 }), null)
})

test('a local valve controls the same volume, flow and pump reserve', () => {
  const local = createKizunaLocal()
  const pump = applyKizunaCommand(local, 'start_pump', 2, 1000)
  assert.equal(pump.state.pumpLoadW, 120)
  const restricted = { ...pump, openings: { ...pump.openings, 2: 50 } }
  assert.equal(kizunaBasinFlow(restricted.state.basins[1], 50), 2.52)
  const tick = tickKizuna(restricted, 2, 3000)
  assert.deepEqual(tick.state.basins.map(basin => basin.levelPct), [62, 74, 32])
  const closed = tickKizuna({ ...tick, openings: { ...tick.openings, 2: 0 } }, 2, 5000)
  assert.equal(closed.state.basins[1].levelPct, 74)
  const reserve = tickKizuna(tick, 100, 105000)
  assert.equal(reserve.state.pumpLoadW, 0)
  assert.equal(reserve.state.basins[1].levelPct, 20)
  assert.equal(kizunaAvailable(reserve.state.basins[1]), 0)
})

test('rain fills the three basins and changes production, and backup leak accelerates drawdown', () => {
  const local = createKizunaLocal()
  const rain = changeKizunaWeather(local, 'rain', 1000)
  assert.ok(kizunaWeather('rain', rain.state).watts < kizunaWeather('sun', local.state).watts)
  const wet = tickKizuna(rain, 12, 13000)
  assert.deepEqual(wet.state.basins.map(basin => basin.levelPct), [100, 100, 80])
  const backup = applyKizunaCommand(wet, 'start_backup', 3, 13000)
  const leak = applyKizunaCommand(backup, 'enable_backup_leak', 3, 13000)
  assert.equal(tickKizuna(backup, 2, 15000).state.basins[2].levelPct, 76)
  assert.equal(tickKizuna(leak, 2, 15000).state.basins[2].levelPct, 73)
  assert.equal(estimateKizunaPressure(4.32, false).suspectedLeak, false)
  assert.equal(estimateKizunaPressure(4.32, true).suspectedLeak, true)
})

test('a sensor reading below the reserve remains measurable and prevents both pumps', () => {
  const empty = setKizunaDistance(createKizunaLocal(), 1, 70, 1000)
  assert.equal(empty.state.basins[0].levelPct, 0)
  assert.equal(applyKizunaCommand(empty, 'start_pump', 1, 2000).state.pumpLoadW, 0)
  assert.equal(applyKizunaCommand(empty, 'start_backup', 1, 2000).state.backupBasin, 0)
})
test('the noon scenario selects a basin, feeds the sectors and debits the same measured flow', () => {
  const scheduled = schedulePilotOutage(createKizunaPilot(Date.parse('2026-11-22T08:00:00Z')))
  assert.equal(scheduled.outageAt, Date.parse('2026-11-22T11:00:00Z'))
  const waiting = advanceKizunaPilot(scheduled, 3, 3000)
  assert.equal(waiting.state.backupBasin, 0)
  const active = advanceKizunaPilot(waiting, 1, 4000)
  assert.equal(active.state.backupBasin, 2)
  assert.equal(pilotPlan(active).delivered, 2.4)
  const after = advanceKizunaPilot(active, 1, 5000)
  assert.ok(Math.abs(pilotPlan(active).stock - pilotPlan(after).stock - .6) < 1e-8)
})

test('weather, a leak and high temperature override the AI plan, while a sensor failure changes the source', () => {
  const scheduled = schedulePilotOutage(createKizunaPilot())
  const active = advanceKizunaPilot({ ...scheduled, advice: { basin: 1, profile: 'economy' } }, 4, 4000)
  assert.equal(active.state.backupBasin, 1)
  assert.equal(pilotPlan(active).target, 2.4 * .8)
  assert.equal(reconcileKizunaPilot({ ...active, weather: 'clouds' }, 5000).state.backupBasin, 0)
  assert.equal(reconcileKizunaPilot({ ...active, weather: 'rain' }, 5000).state.backupBasin, 0)
  const leak = applyKizunaCommand(active, 'enable_backup_leak', 1, 5000)
  assert.equal(reconcileKizunaPilot({ ...active, ...leak }, 5000).state.backupBasin, 0)
  assert.equal(reconcileKizunaPilot({ ...active, waterC: 45 }, 5000).state.backupBasin, 0)
  const overheated = reconcileKizunaPilot({ ...active, motorsC: { ...active.motorsC, 0: 75 } }, 5000)
  assert.equal(overheated.state.backupBasin, 0)
  assert.equal(reconcileKizunaPilot({ ...overheated, motorsC: { ...active.motorsC, 0: 65 } }, 6000).state.backupBasin, 0)
  assert.equal(reconcileKizunaPilot({ ...overheated, motorsC: { ...active.motorsC, 0: 62 } }, 6000).state.backupBasin, 1)
  const missing = setPilotSensor(active, 1)
  assert.equal(missing.state.basins[0].levelPct, null)
  assert.equal(missing.state.backupBasin, 2)
  assert.equal(setPilotSensor(missing, 1).state.basins[0].levelPct, active.state.basins[0].levelPct)
})

test('deposits isolate a basin for seven days and a completed tandifa renews the annual date', () => {
  const initial = createKizunaPilot(Date.parse('2026-11-22T08:00:00Z'))
  const deposited = simulatePilotDeposit(initial, 2)
  const release = initial.clock + 7 * 24 * 60 * 60_000
  assert.equal(deposited.settlingUntil[2], release)
  assert.equal(pilotPlan(deposited).selected?.id, 1)
  assert.equal(pilotPlan({ ...deposited, clock: release }).selected?.id, 2)
  assert.equal(completePilotCleaning(deposited).lastCleaning, null)
  const cleaned = completePilotCleaning({ ...deposited, clock: deposited.nextCleaning })
  assert.equal(cleaned.lastCleaning, Date.parse('2027-11-22T10:00:00Z'))
  assert.equal(cleaned.nextCleaning, Date.parse('2028-11-22T10:00:00Z'))
})

test('the generator supplies backup at night and the pumps stop when its fuel runs out', () => {
  const prepared = schedulePilotOutage(createKizunaPilot())
  const night = { ...prepared, clock: prepared.outageAt!, weather: 'night' as const }
  assert.equal(reconcileKizunaPilot(night, 1000).state.backupBasin, 0)
  const generator = { running: true, settings: { ...night.generator.settings, fuel: '0.2', burn: '1' } }
  const active = reconcileKizunaPilot({ ...night, generator }, 1000)
  assert.equal(active.state.backupBasin, 2)
  assert.equal(pilotPower(active).generator.suppliedW, 120)
  assert.equal(pilotPower(active).generator.runtime, .2)
  const drained = advanceKizunaPilot(active, 2, 3000)
  assert.equal(drained.generator.settings.fuel, '0')
  assert.equal(drained.generator.running, false)
  assert.equal(drained.state.backupBasin, 0)
  assert.ok(Math.abs(pilotPlan(active).stock - pilotPlan(drained).stock - .48) < 1e-8)
  assert.equal(reconcileKizunaPilot({ ...active, weather: 'clouds' }, 1500).state.backupBasin, 0)
})
