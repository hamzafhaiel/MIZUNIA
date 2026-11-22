import { appendTimes, seedTimes } from './history.ts'

export type IncidentStatus = 'Open' | 'Under review' | 'Monitoring' | 'Resolved'
export type Action = 'review' | 'inspect' | 'approve' | 'resolve'
export type Scenario = 'outage' | 'restore' | 'expired' | 'offline' | 'reset'

export interface Activity {
  id: number
  type: 'incident' | 'reserve' | 'device' | 'decision'
  title: string
  detail: string
  at: number
  incidentId?: string
}
export interface Incident {
  id: string
  status: IncidentStatus
  severity: 'Low' | 'Moderate' | 'Critical'
  openedAt: number
  observations: number[]
  actions: Action[]
}

export interface DashboardState {
  stored: number
  capacity: number
  holdback: number
  demand: number
  verified: boolean
  sensors: { id: string; label: string; pressure: number; online: boolean }[]
  basinReadingAt: number
  volumeHistory: number[]
  pressureHistory: number[]
  volumeTimes?: number[]
  pressureTimes?: number[]
  incidents: Incident[]
  activity: Activity[]
  sequence: number
}

export const lowPressure = 1
export const lowReserve = 15

export function sampleState(now = Date.now()): DashboardState {
  return {
    stored: 12.4, capacity: 30, holdback: 3, demand: 3, verified: true,
    sensors: [
      { id: 'P-01', label: 'North inlet', pressure: 0.5, online: true },
      { id: 'P-02', label: 'Park inlet', pressure: 0.6, online: true },
      { id: 'P-03', label: 'Coastal inlet', pressure: 2.8, online: true },
    ],
    basinReadingAt: now,
    volumeHistory: [16.1, 16.1, 15.7, 15.8, 15.2, 15.2, 14.8, 14.9, 14.5, 14.5, 13.9, 13.9, 13.4, 13.4, 13.6, 13.1, 12.8, 12.4],
    pressureHistory: [2.8, 2.9, 2.7, 2.8, 2.6, 2.7, 2.6, 2.6, 2.5, 1.8, 1.2, 0.7, 0.6, 0.5],
    volumeTimes: seedTimes(18, now),
    pressureTimes: seedTimes(14, now),
    incidents: [{ id: 'INC-001', status: 'Open', severity: 'Moderate', openedAt: now - 8 * 60_000, observations: [0.5, 0.6], actions: [] }],
    activity: [
      { id: 3, type: 'incident', title: 'Low pressure detected', detail: 'Zone A · 2 monitoring points', at: now - 8 * 60_000, incidentId: 'INC-001' },
      { id: 2, type: 'reserve', title: 'Reserve below threshold', detail: 'Basin 01 · below 15 m³', at: now - 23 * 60_000 },
      { id: 1, type: 'device', title: 'Monitoring points connected', detail: '3 pressure sensors reporting', at: now - 44 * 60_000 },
    ],
    sequence: 3,
  }
}

export function availableReserve(state: DashboardState): number | null {
  return state.verified ? Math.max(0, Math.round((state.stored - state.holdback) * 10) / 10) : null
}
export function activeIncident(state: DashboardState) {
  return state.incidents.find(incident => incident.status !== 'Resolved')
}
export function supplyStatus(state: DashboardState): 'Unknown' | 'Low pressure' | 'Normal' {
  if (!state.sensors.some(sensor => sensor.online)) return 'Unknown'
  if (state.sensors.some(sensor => sensor.online && sensor.pressure < lowPressure)) return 'Low pressure'
  return 'Normal'
}

function record(state: DashboardState, at: number, type: Activity['type'], title: string, detail: string, incidentId?: string) {
  const sequence = state.sequence + 1
  return { ...state, sequence, activity: [{ id: sequence, type, title, detail, at, incidentId }, ...state.activity] }
}

export function allowAction(state: DashboardState, incident: Incident, action: Action) {
  if (incident.status === 'Resolved' || incident.actions.includes(action)) return false
  if (action === 'review') return incident.status === 'Open'
  if (action === 'resolve') return incident.status === 'Monitoring' && supplyStatus(state) === 'Normal'
  if (action === 'approve') {
    const available = availableReserve(state)
    return incident.status === 'Under review' && supplyStatus(state) === 'Low pressure' && available !== null && available >= state.demand
  }
  return true
}

export function applyAction(state: DashboardState, id: string, action: Action, reason: string, now = Date.now()): DashboardState {
  const incident = state.incidents.find(candidate => candidate.id === id)
  if (!incident || !reason.trim() || !allowAction(state, incident, action)) return state
  const status = action === 'review' ? 'Under review' : action === 'resolve' ? 'Resolved' : incident.status
  const title = { review: 'Incident acknowledged', inspect: 'Inspection requested', approve: 'Simulated reserve use approved', resolve: 'Incident resolved' }[action]
  return record({
    ...state,
    incidents: state.incidents.map(candidate => candidate.id === id ? { ...candidate, status, actions: [...candidate.actions, action] } : candidate),
  }, now, 'decision', title, 'Demo operator · ' + reason.trim(), id)
}

export function setVolume(state: DashboardState, stored: number, now = Date.now()): DashboardState {
  if (!Number.isFinite(stored)) return state
  const volume = Math.min(state.capacity, Math.max(0, stored))
  if (volume === state.stored) return state
  const next = { ...state, stored: volume, basinReadingAt: now, volumeHistory: [...state.volumeHistory.slice(-23), volume],
    volumeTimes: appendTimes(state.volumeTimes ?? seedTimes(state.volumeHistory.length, state.basinReadingAt), 23, 1, now) }
  if (state.stored >= lowReserve && volume < lowReserve) return record(next, now, 'reserve', 'Reserve below threshold', 'Basin 01 · below 15 m³')
  if (state.stored < lowReserve && volume >= lowReserve) return record(next, now, 'reserve', 'Reserve recovered', 'Basin 01 · above low-reserve threshold')
  return next
}

export function runScenario(state: DashboardState, scenario: Scenario, now = Date.now()): DashboardState {
  if (scenario === 'reset') return sampleState(now)
  if (scenario === 'expired') {
    const verified = !state.verified
    return record({ ...state, verified }, now, 'reserve', verified ? 'Irrigation verification restored' : 'Irrigation verification expired', 'Basin 01 · simulated verification record')
  }
  if (scenario === 'offline') {
    const online = state.sensors.some(sensor => !sensor.online)
    return record({ ...state, sensors: state.sensors.map(sensor => ({ ...sensor, online })) }, now, 'device',
      online ? 'Pressure sensors reconnected' : 'Pressure sensors offline', online ? '3 monitoring points reporting' : 'Municipal supply status unknown')
  }
  const active = activeIncident(state)
  if (scenario === 'restore') {
    const next = {
      ...state,
      sensors: state.sensors.map(sensor => ({ ...sensor, online: true, pressure: 2.8 })),
      pressureHistory: [...state.pressureHistory.slice(-20), 1.4, 2.2, 2.8],
      pressureTimes: appendTimes(state.pressureTimes ?? seedTimes(state.pressureHistory.length, state.basinReadingAt), 20, 3, now),
      incidents: state.incidents.map(incident => incident.id === active?.id ? { ...incident, status: 'Monitoring' as const } : incident),
    }
    return record(next, now, 'incident', 'Supply restored', 'Zone A · normal inlet pressure', active?.id)
  }
  const id = active?.id ?? ('INC-' + String(state.incidents.length + 1).padStart(3, '0'))
  const incident: Incident = {
    id, status: active?.status === 'Under review' ? active.status : 'Open',
    severity: state.stored <= state.holdback + state.demand ? 'Critical' : 'Moderate',
    openedAt: active?.openedAt ?? now, observations: [0.5, 0.6], actions: active?.actions ?? [],
  }
  return record({
    ...state,
    sensors: state.sensors.map((sensor, index) => ({ ...sensor, online: true, pressure: [0.5, 0.6, 2.8][index] })),
    pressureHistory: [...state.pressureHistory.slice(-20), 1.2, 0.7, 0.5],
    pressureTimes: appendTimes(state.pressureTimes ?? seedTimes(state.pressureHistory.length, state.basinReadingAt), 20, 3, now),
    incidents: [incident, ...state.incidents.filter(item => item.id !== id)],
  }, now, 'incident', 'Low pressure detected', 'Zone A · 2 monitoring points', id)
}
