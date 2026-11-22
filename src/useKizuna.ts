import { useEffect, useRef, useState } from 'react'
import { useKizunaConnection } from './kizuna-connection.ts'
import {
  applyKizunaCommand, changeKizunaWeather, isKizunaBasinId, kizunaOpenings, kizunaWeather, setKizunaDistance,
} from './kizuna-model.ts'
import type { KizunaAction, KizunaHistory, KizunaSource, PressureTest, WeatherName } from './kizuna-model.ts'
import {
  advanceKizunaPilot, completePilotCleaning, createKizunaPilot, KIZUNA_HOUSEHOLD_DEMAND, pilotAvailability,
  pilotPower, pilotPumpBlock, reconcileKizunaPilot, schedulePilotOutage, setPilotSensor, simulatePilotDeposit,
} from './kizuna-pilot.ts'
import type { KizunaPilot } from './kizuna-pilot.ts'
import { generatorStatus } from './generator.ts'
import type { GeneratorSettings } from './generator.ts'

const statusText = {
  unconfigured: 'Configurez l’adresse et le préfixe MQTT pour connecter Wokwi.',
  connecting: 'Connexion au broker MQTT…',
  waiting: 'Broker connecté · En attente de l’ESP32.',
  online: 'Wokwi connecté · Mesures ESP32 en direct.',
  offline: 'Wokwi indisponible · En attente de mesures récentes.',
}

const calendarKey = 'fas9ia-kizuna-calendar-v1'

function restorePilot() {
  const pilot = createKizunaPilot()
  try {
    const saved = JSON.parse(localStorage.getItem(calendarKey) ?? 'null')
    if (!Number.isFinite(saved?.clock) || !Number.isFinite(saved?.nextCleaning)) return pilot
    return {
      ...pilot, clock: Math.max(pilot.clock, saved.clock), nextCleaning: saved.nextCleaning as number,
      lastCleaning: Number.isFinite(saved.lastCleaning) ? saved.lastCleaning as number : null,
      settlingUntil: Object.fromEntries([1, 2, 3].flatMap(id => Number.isFinite(saved.settlingUntil?.[id]) ? [[id, saved.settlingUntil[id]]] : [])),
    }
  } catch {
    return pilot
  }
}

export function useKizuna(enabled: boolean, opensKizuna: boolean) {
  const [sourceChoice, setSource] = useState<KizunaSource | null>(null)
  const source = sourceChoice ?? (opensKizuna ? 'kizuna' : null)
  const [local, setLocal] = useState(restorePilot)
  const [pressureTest, setPressureTest] = useState<PressureTest>(null)
  const [pending, setPending] = useState(false)
  const [result, setResult] = useState<{ message: string; error: boolean } | null>(null)
  const run = useRef(0)
  const busy = useRef(false)
  const connection = useKizunaConnection(enabled && source === 'wokwi')
  const [localHistory, setLocalHistory] = useState<KizunaHistory>([])
  const [mqttHistory, setMqttHistory] = useState<KizunaHistory>([])
  const state = source === 'wokwi' ? connection.state : source === 'kizuna' ? local.state : null
  const receivedAt = source === 'wokwi' ? connection.receivedAt : local.at
  const weatherName = source === 'wokwi' ? state?.basins.some(basin => basin.rainOn) ? 'rain' : 'sun' : local.weather
  const weather = kizunaWeather(weatherName, state)
  const openings = source === 'kizuna' ? kizunaOpenings(local) : undefined
  const localGenerator = pilotPower(local).generator
  const generator = source === 'kizuna' ? localGenerator : generatorStatus({ ...local.generator, running: false })
  const calendarClock = local.outageAt === null ? local.clock : null
  const latestPilot = useRef(local)
  latestPilot.current = local

  useEffect(() => {
    const { clock, nextCleaning, lastCleaning, settlingUntil } = latestPilot.current
    try { localStorage.setItem(calendarKey, JSON.stringify({ clock, nextCleaning, lastCleaning, settlingUntil })) } catch { /* Use the current simulation session. */ }
  }, [calendarClock, local.nextCleaning, local.lastCleaning, local.settlingUntil])
  const adviceSnapshot = enabled && source === 'kizuna' && local.automatic ? JSON.stringify({
    weather: weatherName, solarW: Math.round(weather.watts), generatorW: Math.round(generator.capacityW),
    waterC: local.waterC, backupMotorC: Math.round(local.motorsC[0] / 10) * 10,
    leak: local.state.backupLeak, outageScheduled: local.outageAt !== null,
    sources: pilotAvailability(local).map(({ id, volume }) => ({ id, volume: Math.ceil(volume / 5) * 5 })),
    demand: KIZUNA_HOUSEHOLD_DEMAND,
  }) : ''

  useEffect(() => {
    if (!adviceSnapshot) return
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(import.meta.env.BASE_URL + 'api/kizuna-pilot', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: adviceSnapshot, signal: controller.signal,
        })
        if (response.status !== 200) return
        const advice = await response.json()
        if (!['normal', 'economy'].includes(advice?.profile) || !(advice.basin === 0 || isKizunaBasinId(advice.basin))) return
        if (!controller.signal.aborted) setLocal(previous => previous.automatic ? reconcileKizunaPilot({ ...previous, advice }, Date.now()) : previous)
      } catch {
        // Local decisions continue while the provider is unavailable.
      }
    }, 400)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [adviceSnapshot])

  useEffect(() => {
    if (enabled && opensKizuna) setSource(choice => choice ?? 'kizuna')
  }, [enabled, opensKizuna])

  useEffect(() => {
    if (!enabled || source !== 'kizuna') return
    let last = performance.now()
    const timer = window.setInterval(() => {
      const now = performance.now()
      const seconds = Math.min(3, (now - last) / 1000)
      const at = Date.now()
      last = now
      setLocal(previous => advanceKizunaPilot(previous, seconds, at))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [enabled, source])

  useEffect(() => {
    if (!enabled || !state || !receivedAt) return
    const levels = state.basins.map(basin => basin.levelPct)
    const remember = source === 'wokwi' ? setMqttHistory : setLocalHistory
    remember(previous => {
      const latest = previous.at(-1)
      if (latest && (latest.at >= receivedAt || latest.levels.every((level, index) => levels[index] === level))) return previous
      return [...previous.slice(-59), { at: receivedAt, levels }]
    })
  }, [enabled, receivedAt, source, state])

  function select(next: KizunaSource | null) {
    if (sourceChoice === next) return
    ++run.current
    busy.current = false
    setPending(false)
    setResult(null)
    setPressureTest(null)
    if (next !== 'kizuna') setLocal(previous => previous.generator.running
      ? reconcileKizunaPilot({ ...previous, generator: { ...previous.generator, running: false } }, Date.now()) : previous)
    setSource(next)
  }

  function command(action: KizunaAction, id: number) {
    if (!enabled || !isKizunaBasinId(id)) return
    if (action === 'start_backup') setPressureTest(null)
    if (source === 'kizuna') {
      const at = Date.now()
      setLocal(previous => {
        if (action === 'start_backup' || action === 'start_pump') {
          if (previous.automatic && previous.outageAt !== null && (action === 'start_backup' || previous.clock >= previous.outageAt)) {
            return { ...previous, error: 'Le scénario SONEDE pilote les pompes.' }
          }
          const error = pilotPumpBlock(previous, action === 'start_backup' ? 0 : id, id)
          if (error) return { ...previous, error }
          const alreadyRunning = action === 'start_backup' ? previous.state.backupBasin !== 0
            : previous.state.basins.some(basin => basin.id === id && basin.pumpOn)
          if (!alreadyRunning && previous.state.pumpLoadW + 120 > pilotPower(previous).capacityW) {
            return { ...previous, error: 'Puissance disponible insuffisante pour démarrer une pompe supplémentaire.' }
          }
        }
        if (action === 'start_rain') return changeWeather(previous, 'rain', at)
        if (action === 'reset' && previous.missingLevels[id] !== undefined) return { ...previous, error: 'Rétablissez le capteur avant de réinitialiser le bassin.' }
        return reconcileKizunaPilot({ ...previous, ...applyKizunaCommand(previous, action, id, at) }, at)
      })
    } else if (source === 'wokwi' && !busy.current) {
      const ticket = ++run.current
      busy.current = true
      setPending(true)
      setResult(null)
      void connection.command(action, id).then(
        () => { if (ticket === run.current) setResult({ message: 'Commande confirmée par Wokwi.', error: false }) },
        error => { if (ticket === run.current) setResult({ message: error.message, error: true }) },
      ).finally(() => {
        if (ticket !== run.current) return
        busy.current = false
        setPending(false)
      })
    }
  }

  function setWeather(name: WeatherName) {
    const at = Date.now()
    setLocal(previous => changeWeather(previous, name, at))
  }

  function setOpening(id: number, value: number) {
    if (!isKizunaBasinId(id) || !Number.isFinite(value)) return
    setLocal(previous => previous.automatic ? previous : {
      ...previous, openings: { ...previous.openings, [id]: Math.max(0, Math.min(100, Math.round(value))) },
    })
  }

  function setAutomatic(automatic: boolean) {
    setLocal(previous => {
      if (previous.automatic === automatic) return previous
      const at = Date.now()
      const active = !automatic && previous.outageAt !== null && previous.state.backupBasin
      const hydraulics = active ? applyKizunaCommand(previous, 'stop_backup', active, at) : previous
      return reconcileKizunaPilot({
        ...previous, ...hydraulics, automatic, advice: null, backupOpening: undefined,
        openings: automatic ? previous.openings : kizunaOpenings(previous),
      }, at)
    })
  }

  function setDistance(id: number, distance: number) {
    const at = Date.now()
    setLocal(previous => previous.missingLevels[id] !== undefined ? previous : {
      ...previous, ...setKizunaDistance(previous, id, distance, at),
    })
  }

  const updatePilot = (update: (pilot: KizunaPilot) => KizunaPilot) => {
    if (enabled && source === 'kizuna') setLocal(update)
  }

  function cancelOutage() {
    updatePilot(previous => {
      const active = previous.outageAt !== null && previous.state.backupBasin
      const hydraulics = active ? applyKizunaCommand(previous, 'stop_backup', active, Date.now()) : previous
      return { ...previous, ...hydraulics, outageAt: null, backupOpening: undefined }
    })
  }

  function setGeneratorField(key: keyof GeneratorSettings, value: string) {
    if (!enabled) return
    setLocal(previous => {
      const generator = { ...previous.generator, settings: { ...previous.generator.settings, [key]: value } }
      if (!generatorStatus(generator).canStart) generator.running = false
      const updated = { ...previous, generator }
      return source === 'kizuna' ? reconcileKizunaPilot(updated, Date.now()) : updated
    })
  }

  function setGeneratorRunning(running: boolean) {
    updatePilot(previous => {
      const generator = { ...previous.generator, running: running && generatorStatus(previous.generator).canStart }
      return reconcileKizunaPilot({ ...previous, generator }, Date.now())
    })
  }

  return {
    source, select, state, receivedAt, weatherName, weather, pressureTest, setPressureTest,
    pending, command, setWeather, openings, setOpening, automatic: local.automatic, setAutomatic, setDistance,
    status: source === 'wokwi' ? statusText[connection.status] : source === 'kizuna' ? 'Simulation locale · Trois bassins synchronisés.' : '',
    result: source === 'wokwi' ? result : source === 'kizuna' && local.error ? { message: local.error, error: true } : null,
    history: source === 'wokwi' ? mqttHistory : localHistory,
    offline: source === 'wokwi' && connection.status === 'offline',
    generator, generatorSettings: local.generator.settings, setGeneratorField, setGeneratorRunning,
    pilot: source === 'kizuna' ? local : null,
    pilotControls: {
      schedule: () => updatePilot(previous => reconcileKizunaPilot(schedulePilotOutage(previous), Date.now())),
      cancel: cancelOutage,
      sensor: (id: number) => updatePilot(previous => setPilotSensor(previous, id)),
      deposit: (id: number) => updatePilot(previous => simulatePilotDeposit(previous, id)),
      water: (waterC: number) => updatePilot(previous => reconcileKizunaPilot({ ...previous, waterC }, Date.now())),
      advanceCalendar: (clock: number) => updatePilot(previous => previous.outageAt === null && previous.state.pumpLoadW === 0
        && previous.rainLeft === 0 && clock > previous.clock ? { ...previous, clock } : previous),
      clean: () => updatePilot(completePilotCleaning),
    },
  }
}

function changeWeather(pilot: KizunaPilot, name: WeatherName, at: number) {
  let next = pilot
  if (pilot.automatic && name === 'rain') {
    for (const basin of next.state.basins) {
      if (basin.pumpOn) next = { ...next, ...applyKizunaCommand(next, 'stop_pump', basin.id, at) }
    }
    if (next.state.backupBasin) next = { ...next, ...applyKizunaCommand(next, 'stop_backup', next.state.backupBasin, at) }
  }
  return reconcileKizunaPilot({ ...next, ...changeKizunaWeather(next, name, at) }, at)
}
