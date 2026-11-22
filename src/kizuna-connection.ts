import { useCallback, useEffect, useRef, useState } from 'react'
import type { MqttClient } from 'mqtt'
import { isKizunaAction, isKizunaBasinId, kizunaReason, parseKizunaState } from './kizuna-model.ts'
import type { KizunaAction, KizunaState } from './kizuna-model.ts'

type Status = 'unconfigured' | 'connecting' | 'waiting' | 'online' | 'offline'
type Connection = { state: KizunaState | null; status: Status; receivedAt: number | null }
type Send = (action: KizunaAction, basinId: number) => Promise<void>
type Pending = { id: string; action: KizunaAction; basinId: number; finish: (error?: Error) => void }

const unavailable = 'Aucune mesure récente de l’ESP32. Vérifiez la connexion Wokwi.'
const snapshot = (status: Status): Connection => ({ state: null, status, receivedAt: null })
const freshForMs = 10_000
const commandTimeoutMs = 5_000

function configuration() {
  const address = import.meta.env.VITE_KIZUNA_MQTT_URL?.trim()
  const prefix = import.meta.env.VITE_KIZUNA_MQTT_PREFIX?.trim().replace(/\/+$/, '')
  if (!address || !prefix || /[#+\x00-\x20]/u.test(prefix)) return null
  try {
    const endpoint = new URL(address)
    if (!['ws:', 'wss:'].includes(endpoint.protocol) || endpoint.username || endpoint.password) return null
    return { url: endpoint.toString(), prefix }
  } catch {
    return null
  }
}

const config = configuration()

export function useKizunaConnection(enabled: boolean) {
  const [current, setCurrent] = useState<Connection>(() => snapshot(config ? 'connecting' : 'unconfigured'))
  const sendRef = useRef<Send | null>(null)
  const command = useCallback<Send>((action, basinId) => sendRef.current?.(action, basinId) ?? Promise.reject(new Error(unavailable)), [])

  useEffect(() => {
    if (!enabled || !config) return
    let cancelled = false
    let client: MqttClient | undefined
    let subscribed = false
    let liveAt: number | null = null
    let freshnessTimer: number | undefined
    let pending: Pending | undefined
    const { url, prefix } = config
    const topics = {
      state: prefix + '/state', availability: prefix + '/availability',
      command: prefix + '/command', ack: prefix + '/ack',
    }

    function invalidate(status: Status, reason = unavailable) {
      window.clearTimeout(freshnessTimer)
      liveAt = null
      pending?.finish(new Error(reason))
      if (!cancelled) setCurrent(snapshot(status))
    }

    setCurrent(snapshot('connecting'))
    void import('mqtt').then(({ default: mqttLibrary }) => {
      if (cancelled) return
      const mqtt = mqttLibrary.connect(url, { protocolVersion: 4, clean: true, reconnectPeriod: 2500, connectTimeout: 7000, queueQoSZero: false })
      client = mqtt
      mqtt.on('error', () => invalidate('offline'))
      mqtt.on('close', () => {
        subscribed = false
        invalidate('offline')
      })
      mqtt.on('connect', () => {
        subscribed = false
        invalidate('waiting')
        mqtt.subscribe([topics.state, topics.availability, topics.ack], { qos: 0 }, (error, grants) => {
          if (cancelled || !mqtt.connected) return
          subscribed = !error && Boolean(grants?.length === 3 && grants.every(grant => grant.qos === 0))
          if (!subscribed) invalidate('offline')
        })
      })
      mqtt.on('message', (topic, bytes, packet) => {
        if (cancelled || !subscribed || packet.retain || bytes.length > 8192) return
        const raw = bytes.toString()
        if (topic === topics.availability) {
          if (raw === 'offline') invalidate('offline')
          else if (raw === 'online' && liveAt === null) setCurrent(snapshot('waiting'))
          return
        }

        let data
        try { data = JSON.parse(raw) } catch { return }
        if (topic === topics.ack) {
          if (!pending || data?.v !== 1 || data.id !== pending.id
            || data.action !== pending.action || data.basinId !== pending.basinId || typeof data.ok !== 'boolean') return
          pending.finish(data.ok ? undefined : new Error(kizunaReason(typeof data.reason === 'string' ? data.reason : '')))
          return
        }
        if (topic !== topics.state) return
        const state = parseKizunaState(data)
        if (!state) return
        const receivedAt = Date.now()
        liveAt = receivedAt
        window.clearTimeout(freshnessTimer)
        freshnessTimer = window.setTimeout(() => invalidate('offline'), freshForMs)
        setCurrent({ state, status: 'online', receivedAt })
      })
    }).catch(() => invalidate('offline'))

    const send: Send = (action, basinId) => {
      if (!isKizunaAction(action) || !isKizunaBasinId(basinId)) return Promise.reject(new Error('Commande KIZUNA invalide.'))
      if (!client?.connected || !subscribed || liveAt === null || Date.now() - liveAt >= freshForMs) return Promise.reject(new Error(unavailable))
      if (pending) return Promise.reject(new Error('Une commande est déjà en attente.'))
      const mqtt = client
      return new Promise((resolve, reject) => {
        const id = 'fas9ia-' + crypto.getRandomValues(new Uint32Array(4)).join('-')
        const finish: Pending['finish'] = error => {
          if (pending?.id !== id) return
          pending = undefined
          window.clearTimeout(timeout)
          if (error) reject(error)
          else resolve()
        }
        const timeout = window.setTimeout(() => finish(new Error('Wokwi n’a pas confirmé la commande. Vérifiez l’état des pompes.')), commandTimeoutMs)
        pending = { id, action, basinId, finish }
        mqtt.publish(topics.command, JSON.stringify({ v: 1, id, action, basinId }), { qos: 0, retain: false },
          error => { if (error) finish(new Error(unavailable)) })
      })
    }
    sendRef.current = send

    return () => {
      cancelled = true
      sendRef.current = null
      invalidate('connecting')
      client?.end(true)
      setCurrent(snapshot('connecting'))
    }
  }, [enabled])

  return { ...(enabled ? current : snapshot(config ? 'connecting' : 'unconfigured')), command, configured: config !== null }
}
