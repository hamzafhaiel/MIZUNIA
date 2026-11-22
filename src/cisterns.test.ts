import assert from 'node:assert/strict'
import test from 'node:test'
import { applySensorReading, demoCisterns, isPilotLocation, project, registerCistern, unproject, updateCisternDiameter } from './cisterns.ts'
import { homes } from './households.ts'

const draft = { name: ' Citerne de la médina ', latitude: 35.5058, longitude: 11.076, capacity: 2000, sensorId: 'wokwi-04' }

test('the three demo locations are on land and map projection can place a new pin', () => {
  assert.equal(demoCisterns().length, 3)
  assert.ok(demoCisterns().every(isPilotLocation))
  assert.ok(Object.values(homes).every(isPilotLocation))
  assert.equal(isPilotLocation({ latitude: 35.5104, longitude: 11.069 }), false)
  const { left, top } = project(draft)
  const point = unproject(parseFloat(left) / 100, parseFloat(top) / 100)
  assert.ok(Math.abs(point.latitude - draft.latitude) < 1e-8)
  assert.ok(Math.abs(point.longitude - draft.longitude) < 1e-8)
})

test('registration normalizes the sensor ID and refuses duplicate sensors', () => {
  const registry = demoCisterns(1000)
  assert.ok('error' in registerCistern(registry, { ...draft, sensorId: ' wokwi-01 ' }))
  assert.ok('error' in registerCistern(registry, { ...draft, capacity: 0 }))
  const result = registerCistern(registry, draft)
  assert.ok('cistern' in result)
  assert.equal(result.cistern.id, 'FQ-004')
  assert.equal(result.cistern.sensorId, 'WOKWI-04')
  assert.equal(result.cistern.reading, null)
})

test('a reading updates only its paired cistern and rejects invalid or stale values', () => {
  const registry = demoCisterns(1000)
  assert.equal(applySensorReading(registry, 'unknown', 100, 2000), registry)
  assert.equal(applySensorReading(registry, 'WOKWI-03', 3000, 2000), registry)
  const updated = applySensorReading(registry, 'wokwi-03', 0, 2000)
  assert.deepEqual(updated[2].reading, { liters: 0, at: 2000 })
  assert.equal(updated[0], registry[0])
  assert.equal(applySensorReading(updated, 'WOKWI-03', 1500, 1999), updated)
})

test('diameters can be recorded independently of a reading and remain optional', () => {
  const registry = demoCisterns(1000)
  const registered = registerCistern(registry, { ...draft, diameter: 1.25 })
  assert.ok('cistern' in registered)
  assert.equal(registered.cistern.diameter, 1.25)
  assert.ok('error' in registerCistern(registry, { ...draft, diameter: 0 }))
  const edited = updateCisternDiameter(registry, 'FQ-001', 1.8)
  assert.equal(edited[0].diameter, 1.8)
  assert.equal(edited[0].reading, registry[0].reading)
  assert.equal(updateCisternDiameter(edited, 'FQ-001')[0].diameter, undefined)
  assert.equal(updateCisternDiameter(edited, 'FQ-001', -1), edited)
})
