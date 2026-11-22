export const generatorSettings = { fuelType: 'Essence', tank: '12', fuel: '8', burn: '1.6', load: '2', pump: '500' }
export type GeneratorSettings = typeof generatorSettings
export type Generator = { settings: GeneratorSettings; running: boolean }

export function resourceNumber(input: string) {
  const value = Number(input)
  return input !== '' && Number.isFinite(value) && value >= 0 && value <= 1_000_000_000 ? value : null
}

export function generatorStatus(generator: Generator, solarW = 0, pumpLoadW = 0) {
  const { settings, running } = generator
  const tank = resourceNumber(settings.tank)
  const fuel = resourceNumber(settings.fuel)
  const burn = resourceNumber(settings.burn)
  const load = resourceNumber(settings.load)
  const fuelInTank = tank !== null && tank > 0 && fuel !== null && fuel <= tank ? fuel : null
  const runtime = fuelInTank !== null && burn !== null && burn > 0 ? fuelInTank / burn : null
  const canStart = runtime !== null && runtime > 0 && load !== null && load > 0
  const capacityW = running && canStart ? load * 1000 : 0
  const suppliedW = Math.min(capacityW, Math.max(0, pumpLoadW - solarW))
  return { running: running && canStart, canStart, fuelInTank, tank, runtime, capacityW, suppliedW }
}

export function consumeGenerator(generator: Generator, simulatedHours: number): Generator {
  if (!generator.running || simulatedHours <= 0) return generator
  const status = generatorStatus(generator)
  if (!status.running) return { ...generator, running: false }
  const remaining = simulatedHours >= status.runtime! - 1e-9
    ? 0 : status.fuelInTank! - Number(generator.settings.burn) * simulatedHours
  return { running: remaining > 0, settings: { ...generator.settings, fuel: String(Number(remaining.toPrecision(12))) } }
}
