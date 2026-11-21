import assert from 'node:assert/strict'
import test from 'node:test'
import { activeIncident, applyAction, runScenario, sampleState, setVolume } from '../model.ts'
import { annex, siteBasins } from './config.ts'
import { cameraPose, deriveTwinState, fillRatio, getBasinReading, interpolatePose } from './state.ts'

const time = Date.UTC(2026, 10, 21, 8)

test('volume readings move each basin independently and stay within physical bounds', () => {
  const state = sampleState(time)
  const first = getBasinReading(state, 'B-01', annex.initialVolume)
  const raised = getBasinReading(setVolume(state, 24, time), 'B-01', annex.initialVolume)
  const second = getBasinReading(state, 'B-02', annex.initialVolume)
  assert.equal(first.volume, 12.4)
  assert.equal(raised.ratio, .8)
  assert.ok(raised.surface > first.surface)
  assert.equal(second.volume, 7.2)
  assert.equal(getBasinReading(state, 'B-02', 0).surface, -siteBasins['B-02'].depth + .035)
  assert.equal(fillRatio(-2, 30), 0)
  assert.equal(fillRatio(42, 30), 1)
  assert.equal(fillRatio(42, 0), 0)
  assert.equal(fillRatio(NaN, 30), 0)
})

test('outage layer clears on restoration and distinguishes unavailable evidence', () => {
  const active = sampleState(time)
  assert.deepEqual(deriveTwinState(active), { outage: true, route: false, unknown: false })
  assert.deepEqual(deriveTwinState(runScenario(active, 'offline', time)), { outage: false, route: false, unknown: true })
  assert.deepEqual(deriveTwinState(runScenario(active, 'restore', time)), { outage: false, route: false, unknown: false })
})

test('the approved route is visible only with a current eligible decision', () => {
  const state = sampleState(time)
  const id = activeIncident(state)!.id
  const reviewed = applyAction(state, id, 'review', 'Reviewed low pressure', time)
  const approved = applyAction(reviewed, id, 'approve', 'Irrigation verified', time)
  assert.equal(deriveTwinState(reviewed).route, false)
  assert.equal(deriveTwinState(approved).route, true)
  assert.equal(deriveTwinState(runScenario(approved, 'expired', time)).route, false)
  assert.equal(deriveTwinState(setVolume(approved, 4, time)).route, false)
  assert.equal(deriveTwinState(runScenario(approved, 'restore', time)).route, false)
})

test('camera targets the selected basin in inspection and drops below grade in cutaway', () => {
  const inspection = cameraPose('inspection', 'B-02', 900, 500)
  const cutaway = cameraPose('cutaway', 'B-02', 900, 500)
  assert.equal(inspection.target[0], siteBasins['B-02'].x)
  assert.equal(inspection.target[2], siteBasins['B-02'].z)
  assert.ok(cutaway.target[1] < inspection.target[1])
  assert.ok(cameraPose('inspection', 'B-02', 300, 500).zoom < inspection.zoom)
})

test('camera interpolation is deterministic, bounded, and reversible', () => {
  const a = cameraPose('neighborhood', 'B-01', 900, 500)
  const b = cameraPose('cutaway', 'B-01', 900, 500)
  assert.deepEqual(interpolatePose(a, b, -1), a)
  assert.deepEqual(interpolatePose(a, b, 2), b)
  const middle = interpolatePose(a, b, .5)
  assert.ok(Math.abs(middle.zoom - interpolatePose(b, a, .5).zoom) < 1e-10)
  middle.target.forEach((value, index) => assert.ok(Math.abs(value - (a.target[index] + b.target[index]) / 2) < 1e-10))
})
