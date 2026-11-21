import assert from 'node:assert/strict'
import test from 'node:test'
import { activeIncident, allowAction, applyAction, availableReserve, runScenario, sampleState, setVolume, supplyStatus } from './model.ts'

const time = Date.UTC(2026, 10, 21, 8)

test('operator reviews and approves once, then resolves after restoration', () => {
  let state = sampleState(time)
  const id = activeIncident(state)!.id
  assert.equal(applyAction(state, id, 'approve', 'Use reserve', time), state)
  assert.equal(applyAction(state, id, 'resolve', 'Resolve early', time), state)
  state = applyAction(state, id, 'review', 'Reviewed low pressure', time)
  state = applyAction(state, id, 'approve', 'Verified irrigation reserve', time)
  assert.equal(activeIncident(state)?.status, 'Under review')
  assert.equal(state.activity[0].title, 'Simulated reserve use approved')
  assert.equal(applyAction(state, id, 'approve', 'Repeat', time), state)
  state = runScenario(state, 'restore', time)
  assert.equal(activeIncident(state)?.status, 'Monitoring')
  state = applyAction(state, id, 'resolve', 'Pressure normal', time)
  assert.equal(activeIncident(state), undefined)
  assert.equal(state.incidents[0].status, 'Resolved')
  assert.equal(runScenario(state, 'outage', time).incidents[0].id, 'INC-002')
})

test('expired or insufficient reserves cannot be approved', () => {
  const seed = sampleState(time)
  const id = activeIncident(seed)!.id
  const reviewed = applyAction(seed, id, 'review', 'Evidence reviewed', time)
  assert.equal(availableReserve(reviewed), 9.4)
  const expired = runScenario(reviewed, 'expired', time)
  assert.equal(availableReserve(expired), null)
  assert.equal(expired.stored, seed.stored)
  assert.equal(allowAction(expired, activeIncident(expired)!, 'approve'), false)
  const low = setVolume(reviewed, 4, time)
  assert.equal(availableReserve(low), 1)
  assert.equal(allowAction(low, activeIncident(low)!, 'approve'), false)
})

test('pressure sensor loss makes supply unknown and preserves the basin reading', () => {
  const state = sampleState(time)
  const offline = runScenario(state, 'offline', time + 6000)
  assert.equal(supplyStatus(offline), 'Unknown')
  assert.equal(offline.incidents.length, 1)
  const restored = runScenario(offline, 'restore', time + 9000)
  assert.equal(supplyStatus(restored), 'Normal')
  assert.equal(restored.basinReadingAt, time)
})

test('reserve trend and eligibility are derived from the same simulated reading', () => {
  const state = setVolume(sampleState(time), 22, time + 1000)
  assert.equal(state.volumeHistory.at(-1), 22)
  assert.equal(availableReserve(state), 19)
  assert.equal(state.basinReadingAt, time + 1000)
  assert.equal(state.activity[0].title, 'Reserve recovered')
})
