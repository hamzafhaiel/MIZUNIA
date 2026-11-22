import { useEffect, useRef, useState } from 'react'
import { isKizunaBasinId } from './kizuna-model.ts'
import type { useKizuna } from './useKizuna.ts'

type Simulation = ReturnType<typeof useKizuna>
const sceneSessionKey = 'fas9ia-kizuna-scene-session'

function sceneSessionId() {
  const create = () => crypto.getRandomValues(new Uint32Array(4)).join('-')
  try {
    const existing = sessionStorage.getItem(sceneSessionKey)
    if (existing) return existing
    const id = create()
    sessionStorage.setItem(sceneSessionKey, id)
    return id
  } catch {
    return create()
  }
}

function sendState(channel: BroadcastChannel, simulation: Simulation) {
  const { source, state, weather, pressureTest, openings, pending, generator } = simulation
  if (!source) return
  channel.postMessage({
    type: 'state', source, state, weather, pressureTest, openings,
    generator: source === 'kizuna' ? generator : null,
    controllable: Boolean(state && !pending),
  })
}

export function useKizunaPage(enabled: boolean, simulation: Simulation) {
  const [id] = useState(sceneSessionId)
  const channel = useRef<BroadcastChannel>(null)
  const latest = useRef(simulation)
  latest.current = simulation
  const canConnect = typeof BroadcastChannel !== 'undefined'

  useEffect(() => {
    if (!enabled || !canConnect) return
    const connection = new BroadcastChannel('mizuna-kizuna-' + id)
    channel.current = connection
    connection.onmessage = ({ data }) => {
      const current = latest.current
      if (data?.type === 'read') {
        if (current.source) sendState(connection, current)
        else current.select('kizuna')
      } else if (data?.type === 'pump' && current.state && !current.pending && current.source === data.source
        && isKizunaBasinId(data.basinId) && (data.action === 'start_pump' || data.action === 'stop_pump')) {
        current.command(data.action, data.basinId)
      } else if (data?.type === 'generator' && current.source === 'kizuna' && typeof data.running === 'boolean') {
        current.setGeneratorRunning(data.running)
      }
    }
    return () => {
      connection.close()
      channel.current = null
    }
  }, [enabled, canConnect, id])

  useEffect(() => {
    if (channel.current) sendState(channel.current, simulation)
  }, [simulation])

  const scenePath = import.meta.env.BASE_URL + 'kizuna/index.html'
  const link = canConnect ? '#mizuna=' + id : ''
  return scenePath + link
}
