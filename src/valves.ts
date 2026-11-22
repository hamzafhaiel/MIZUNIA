export const stationLines = [
  { id: 'inlet', label: 'Arrivée d’eau', from: 'Réseau', to: 'Citerne centrale', rate: 18 },
  { id: 'transfer', label: 'Transfert', from: 'Citerne centrale', to: 'Réservoir annexe', rate: 12 },
  { id: 'irrigation', label: 'Arrosage', from: 'Citerne centrale', to: 'Jardin', rate: 6 },
  { id: 'centralDrain', label: 'Vidange centrale', from: 'Citerne centrale', to: 'Évacuation', rate: 12 },
  { id: 'annexDrain', label: 'Vidange annexe', from: 'Réservoir annexe', to: 'Évacuation', rate: 9 },
] as const

export type ValveId = typeof stationLines[number]['id']
type Openings = Record<ValveId, number>

export const closedValves: Openings = { inlet: 0, transfer: 0, irrigation: 0, centralDrain: 0, annexDrain: 0 }

export interface StationControl {
  mode: 'manual' | 'auto'
  stopped: boolean
  openings: Openings
}

export const initialStation: StationControl = { mode: 'manual', stopped: false, openings: closedValves }

export const stationProfiles = {
  balanced: 'Équilibre du réseau',
  conserve: 'Préserver l’eau',
  transfer: 'Priorité au réservoir annexe',
  irrigate: 'Priorité à l’arrosage',
  pause: 'Suspendre le transfert et l’arrosage',
} as const

export type StationProfile = keyof typeof stationProfiles

type Supply = 'Normal' | 'Low pressure' | 'Unknown'

interface HydraulicInputs {
  central: number
  annex: number
  centralCapacity: number
  annexCapacity: number
  holdback: number
  verified: boolean
  criticalIncident?: boolean
  supply: Supply
  raining: boolean
}

export function advanceStation(station: StationControl, input: HydraulicInputs, profile: StationProfile = 'balanced') {
  const fill = input.central / input.centralCapacity
  const canFill = input.supply !== 'Unknown' && !input.raining && fill < .55
  const canTransfer = fill >= .62 && input.annex / input.annexCapacity < .6
  const canWater = input.verified && !input.criticalIncident && !input.raining && fill >= .7
  const protectCentral = input.raining && fill >= .97
  const protectAnnex = input.raining && input.annex / input.annexCapacity >= .97
  const automatic: Openings = {
    ...closedValves,
    inlet: canFill ? (input.supply === 'Low pressure' ? 35 : 75) : 0,
    transfer: canTransfer && profile !== 'pause' && profile !== 'irrigate' ? (profile === 'conserve' ? 25 : 50) : 0,
    irrigation: canWater && profile !== 'pause' && profile !== 'conserve' && profile !== 'transfer' ? 50 : 0,
    centralDrain: protectCentral ? 25 : 0,
    annexDrain: protectAnnex ? 25 : 0,
  }
  const openings = station.stopped ? closedValves : station.mode === 'auto' ? automatic : station.openings
  const rate = (id: ValveId) => {
    const line = stationLines.find(line => line.id === id)
    return Math.round((line?.rate ?? 0) * openings[id] / 6) / 1000
  }
  const central = Math.min(input.centralCapacity, input.central + (input.raining ? .3 : 0))
  const annex = Math.min(input.annexCapacity, input.annex + (input.raining ? .1 : 0))
  const inflow = input.supply === 'Unknown' ? 0 : Math.min(rate('inlet'), input.centralCapacity - central)
  const transferable = Math.max(0, central + inflow - input.holdback)
  const transfer = Math.min(rate('transfer'), transferable, input.annexCapacity - annex)
  const irrigation = input.verified ? Math.min(rate('irrigation'), transferable - transfer) : 0
  const centralDrain = Math.min(rate('centralDrain'), Math.max(0, transferable - transfer - irrigation))
  const annexDrain = Math.min(rate('annexDrain'), annex + transfer)
  const reason = station.stopped ? 'Arrêt général actif.'
    : station.mode === 'manual' ? 'Les commandes manuelles pilotent la station.'
      : protectCentral || protectAnnex ? 'Pluie : ouverture partielle de la vidange sur les réservoirs presque pleins.'
      : input.raining ? 'La pluie alimente les réservoirs. Arrivée et arrosage suspendus.'
        : openings.inlet > 0 ? (input.supply === 'Low pressure' ? 'Pression basse : remplissage à débit réduit.' : 'Remplissage de la citerne centrale.')
          : openings.transfer > 0 ? 'Transfert vers le réservoir annexe.'
            : openings.irrigation > 0 ? 'Arrosage autorisé par le niveau de la réserve.'
              : 'Surveillance des niveaux. Vannes fermées.'
  return {
    openings,
    reason,
    central: Math.round((central + inflow - transfer - irrigation - centralDrain) * 1000) / 1000,
    annex: Math.round((annex + transfer - annexDrain) * 1000) / 1000,
    rates: { inlet: inflow * 60, transfer: transfer * 60, irrigation: irrigation * 60, centralDrain: centralDrain * 60, annexDrain: annexDrain * 60 },
  }
}
