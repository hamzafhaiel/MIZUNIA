import test from 'node:test'
import assert from 'node:assert/strict'
import { historyWindow, minute, seedTimes } from './history.ts'
import { runScenario, sampleState, setVolume } from './model.ts'

test('time filters select actual timestamp windows and retain the latest reading', () => {
  const now = 120 * minute
  const values = Array.from({ length: 18 }, (_, index) => index)
  const times = seedTimes(values.length, now)
  assert.deepEqual(historyWindow(values, times, '15m').readings.map(reading => reading.value), [14, 15, 16, 17])
  assert.equal(historyWindow(values, times, '1h').readings.length, 13)
  assert.equal(historyWindow(values, times, 'all').readings.length, 18)
})

test('scenario and sensor updates preserve source timestamps after trimming history', () => {
  const now = 120 * minute
  let state = sampleState(now)
  for (let i = 0; i < 10; i++) {
    state = setVolume(state, 11 + i, now + i * minute)
    state = runScenario(state, 'restore', now + i * minute)
  }
  assert.equal(state.volumeTimes?.length, state.volumeHistory.length)
  assert.equal(state.pressureTimes?.length, state.pressureHistory.length)
  assert.equal(state.volumeTimes?.at(-1), now + 9 * minute)
  assert.deepEqual(state.pressureTimes?.slice(-3), Array(3).fill(now + 9 * minute))
})
