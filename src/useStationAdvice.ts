import { useEffect, useState } from 'react'
import { stationProfiles } from './valves.ts'
import type { StationProfile } from './valves.ts'

type Advice = { snapshot: string; profile: StationProfile | null }

export function useStationAdvice(active: boolean, snapshot: string) {
  const [advice, setAdvice] = useState<Advice>()

  useEffect(() => {
    if (!active) {
      setAdvice(undefined)
      return
    }
    const cancellation = new AbortController()
    const timer = window.setTimeout(async () => {
      let profile: StationProfile | null = null
      try {
        const response = await fetch(import.meta.env.BASE_URL + 'api/station-advice', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: snapshot, signal: cancellation.signal,
        })
        if (response.status === 200) {
          const data = await response.json()
          if (typeof data?.profile === 'string' && Object.hasOwn(stationProfiles, data.profile)) profile = data.profile
        }
      } catch {
        // The local rules remain available while the service is unavailable.
      }
      if (!cancellation.signal.aborted) setAdvice({ snapshot, profile })
    }, 850)
    return () => { window.clearTimeout(timer); cancellation.abort() }
  }, [active, snapshot])

  return active && advice?.snapshot === snapshot ? advice.profile : null
}
