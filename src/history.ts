export const minute = 60_000

export function seedTimes(length: number, latest: number) {
  return Array.from({ length }, (_, index) => latest - (length - 1 - index) * 5 * minute)
}

export function appendTimes(previous: number[], retain: number, count: number, now: number) {
  const time = Math.max(now, previous.at(-1) ?? now)
  return [...previous.slice(-retain), ...Array<number>(count).fill(time)]
}

export const ranges = [
  { id: '15m', label: '15m', duration: 15 * minute },
  { id: '1h', label: '1h', duration: 60 * minute },
  { id: 'all', label: 'All', duration: Infinity },
] as const
export type RangeId = typeof ranges[number]['id']

export function historyWindow(values: number[], times: number[], id: RangeId) {
  const end = times.at(-1) ?? 0
  const duration = ranges.find(range => range.id === id)?.duration ?? Infinity
  const start = duration === Infinity ? times[0] ?? end : end - duration
  return { start, end, readings: values.flatMap((value, index) => {
    const at = times[index]
    return Number.isFinite(at) && at >= start && at <= end ? [{ value, at }] : []
  }) }
}
