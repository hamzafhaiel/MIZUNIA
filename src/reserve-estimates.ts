export function estimateReserves({ measuredLiters, dailyUse, minimum, tank, fuel, burn, load, pump }: {
  measuredLiters: number
  dailyUse: number | null
  minimum: number | null
  tank: number | null
  fuel: number | null
  burn: number | null
  load: number | null
  pump: number | null
}) {
  const usable = minimum === null ? null : Math.max(0, measuredLiters - minimum)
  const days = usable !== null && dailyUse !== null && dailyUse > 0 ? usable / dailyUse : null
  const runtime = tank !== null && tank > 0 && fuel !== null && fuel <= tank && burn !== null && burn > 0 ? fuel / burn : null
  return {
    usable, days, runtime,
    energy: runtime !== null && load !== null ? runtime * load : null,
    pumpable: runtime !== null && usable !== null && load !== null && load > 0 && pump !== null
      ? Math.min(usable, runtime * pump) : null,
  }
}
