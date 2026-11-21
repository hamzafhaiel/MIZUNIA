export const areas = {
  north: { name: 'North lane', basin: 'Msatha', pickup: true, status: 'Non-drinking use approved in demo', liters: 1200 },
  central: { name: 'Park edge', basin: 'Bassin 2', pickup: false, status: 'Below minimum level', liters: 0 },
  east: { name: 'East lane', basin: 'Bassin 3', pickup: false, status: 'Verification pending', liters: 0 },
} as const

export type AreaId = keyof typeof areas
export const areaIds = Object.keys(areas) as AreaId[]
export const homes = {
  'N-01': { area: 'north', latitude: 35.50501, longitude: 11.07052 },
  'N-02': { area: 'north', latitude: 35.50567, longitude: 11.07145 },
  'N-03': { area: 'north', latitude: 35.50582, longitude: 11.07310 },
  'N-04': { area: 'north', latitude: 35.50476, longitude: 11.07355 },
  'C-01': { area: 'central', latitude: 35.50546, longitude: 11.07522 },
  'C-02': { area: 'central', latitude: 35.50645, longitude: 11.07637 },
  'E-01': { area: 'east', latitude: 35.50675, longitude: 11.07881 },
  'E-02': { area: 'east', latitude: 35.50828, longitude: 11.07947 },
} as const

export type HomeId = keyof typeof homes
export type Issue = 'No water' | 'Low pressure'
export type Assistance = 'Non-drinking water' | 'Drinking-water referral'
export type HouseholdReport = {
  id: string
  home: HomeId
  issue: Issue
  started: string
  submitted: number
  channel: 'Resident form' | 'Phone intake'
  assistance?: Assistance
}
export type HouseholdState = {
  reports: HouseholdReport[]
  confirmed: Partial<Record<AreaId, number>>
}

const storageKey = 'fas9ia-household-demo-v1'
export const pickupLiters = 40

export function sampleHouseholds(now = Date.now()): HouseholdState {
  return {
    confirmed: {},
    reports: [
      { id: 'BR-103', home: 'N-03', issue: 'Low pressure', started: 'Within the last hour', submitted: now - 8 * 60000, channel: 'Phone intake' },
      { id: 'BR-102', home: 'N-02', issue: 'No water', started: '1–6 hours ago', submitted: now - 19 * 60000, channel: 'Resident form' },
      { id: 'BR-101', home: 'N-01', issue: 'No water', started: '1–6 hours ago', submitted: now - 24 * 60000, channel: 'Resident form' },
    ],
  }
}

export function loadHouseholds(): HouseholdState {
  try {
    const saved = localStorage.getItem(storageKey)
    if (saved) return JSON.parse(saved) as HouseholdState
  } catch { /* The current session can run without browser storage. */ }
  return sampleHouseholds()
}

export function saveHouseholds(state: HouseholdState) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(state))
  } catch { /* State remains available for the current session. */ }
}

export function reserveRemaining(state: HouseholdState, area: AreaId) {
  const pickups = state.reports.filter(report => homes[report.home].area === area && report.assistance === 'Non-drinking water').length
  return Math.max(0, areas[area].liters - pickups * pickupLiters)
}

export function canRecordPickup(state: HouseholdState, area: AreaId) {
  return Boolean(state.confirmed[area] && areas[area].pickup && reserveRemaining(state, area) >= pickupLiters)
}
