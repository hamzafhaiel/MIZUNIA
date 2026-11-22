import assert from 'node:assert/strict'
import { test } from 'node:test'
import { advanceStation, initialStation } from './valves.ts'

const inputs = {
  central: 12.4, annex: 7.2, centralCapacity: 30, annexCapacity: 12,
  holdback: 3, verified: true, supply: 'Normal' as const, raining: false,
}

test('manual opening sets the rate and transfer preserves water across reservoirs', () => {
  const half = advanceStation({ ...initialStation, openings: { ...initialStation.openings, transfer: 50 } }, inputs)
  assert.equal(half.rates.transfer, 6)
  assert.equal(half.central, 12.3)
  assert.equal(half.annex, 7.3)
  const full = advanceStation({ ...initialStation, openings: { ...initialStation.openings, transfer: 100 } }, { ...inputs, annex: 11.95 })
  assert.equal(full.central, 12.35)
  assert.equal(full.annex, 12)
})

test('automatic operation throttles low pressure and an isolated station still receives rain', () => {
  const automatic = { ...initialStation, mode: 'auto' as const }
  const low = advanceStation(automatic, { ...inputs, supply: 'Low pressure' })
  assert.equal(low.openings.inlet, 35)
  assert.ok(low.central > inputs.central)
  const fullInRain = advanceStation(automatic, { ...inputs, central: 29.5, annex: 11.8, raining: true })
  assert.equal(fullInRain.openings.inlet, 0)
  assert.ok(fullInRain.rates.centralDrain > 0)
  assert.ok(fullInRain.rates.annexDrain > 0)
  const stopped = advanceStation({ ...automatic, stopped: true }, { ...inputs, raining: true })
  assert.deepEqual(Object.values(stopped.rates), [0, 0, 0, 0, 0])
  assert.equal(stopped.central, 12.7)
  assert.equal(stopped.annex, 7.3)
})

test('irrigation requires verification and central outflows keep the protected reserve', () => {
  const station = { ...initialStation, openings: { ...initialStation.openings, transfer: 100, irrigation: 100, centralDrain: 100 } }
  const unverified = advanceStation(station, { ...inputs, verified: false })
  assert.equal(unverified.rates.irrigation, 0)
  const nearlyEmpty = advanceStation(station, { ...inputs, central: 3.1 })
  assert.equal(nearlyEmpty.central, 3)
})

test('a Groq profile can limit automatic flow without overriding local protections', () => {
  const automatic = { ...initialStation, mode: 'auto' as const }
  const full = { ...inputs, central: 24, annex: 5 }
  const balanced = advanceStation(automatic, full)
  const conserve = advanceStation(automatic, full, 'conserve')
  assert.ok(conserve.rates.transfer < balanced.rates.transfer)
  assert.equal(conserve.rates.irrigation, 0)
  assert.equal(advanceStation(automatic, { ...full, verified: false }, 'irrigate').rates.irrigation, 0)
  assert.equal(advanceStation(automatic, { ...full, criticalIncident: true }, 'irrigate').rates.irrigation, 0)
  assert.equal(advanceStation({ ...automatic, stopped: true }, full, 'irrigate').rates.irrigation, 0)
  assert.ok(advanceStation(automatic, inputs, 'pause').rates.inlet > 0)
  assert.ok(advanceStation(automatic, { ...full, central: 29.5, raining: true }, 'pause').rates.centralDrain > 0)
})
