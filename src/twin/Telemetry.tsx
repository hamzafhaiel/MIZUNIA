import { ArrowRight, CheckCircle2, CircleAlert, Gauge, Route, ShieldCheck } from 'lucide-react'
import type { CSSProperties } from 'react'
import { Badge, formatNumber, formatTime, HistoryChart, Severity } from '../components.tsx'
import { seedTimes } from '../history.ts'
import { availableReserve, lowReserve } from '../model.ts'
import type { DashboardState, Incident } from '../model.ts'
import { annex, siteBasins } from './config.ts'
import type { BasinId } from './config.ts'
import { deriveTwinState, getBasinReading } from './state.ts'

export function BasinTelemetry({ id, state, annexVolume, incident }: {
  id: BasinId; state: DashboardState; annexVolume: number; incident?: Incident
}) {
  const reading = getBasinReading(state, id, annexVolume)
  const primary = id === 'B-01'
  const reserve = primary ? availableReserve(state) : null
  const full = Math.round(reading.ratio * 100)
  const verified = primary && state.verified
  const below = primary && state.stored < lowReserve
  return <section className="panel telemetry-panel" aria-label="Selected basin telemetry">
    <div className="telemetry-header"><span>Reserve assessment</span><span className="basin-code">{id}</span></div>
    <div className="telemetry-title"><h2>{siteBasins[id].label}</h2></div>
    <div className="reserve-decision">
      <span>Available for irrigation</span>
      <strong>{reserve === null ? 'Unavailable' : <>{formatNumber(reserve)} <small>m³</small></>}</strong>
      <span>{reserve === null ? primary ? 'Verification expired' : 'Irrigation unverified' : `${Math.floor(reserve / state.demand)} modeled cycles · ${state.demand} m³ per cycle`}</span>
    </div>
    <div className="capacity-line">
      <div><span>Stored volume</span><strong>{formatNumber(reading.volume)} / {reading.capacity} m³</strong></div>
      <div className="capacity-track" role="img" aria-label={full + '% full'} style={{ '--level': full + '%' } as CSSProperties}><i /></div>
    </div>
    <div className="telemetry-facts">
      <div><span><ShieldCheck size={15} /> Irrigation verification</span><Badge tone={verified ? 'teal' : 'amber'}>{verified ? 'Valid · demo' : primary ? 'Expired' : 'Unverified'}</Badge></div>
      <div><span><CheckCircle2 size={15} /> Inspection status</span><strong>{primary && incident?.actions.includes('inspect') ? 'Requested' : primary && below ? 'Review reserve' : 'No record'}</strong></div>
      <div><span><Gauge size={15} /> Reading source</span><strong>{primary ? formatTime(state.basinReadingAt) + ' · demo' : 'Illustrative data'}</strong></div>
    </div>
    {primary && incident ? <div className="inspector-event">
      <div><span>{incident.id}</span><Severity incident={incident} /></div>
      <h3>{incident.status === 'Monitoring' ? 'Supply monitoring' : 'Zone A pressure alert'}</h3>
      <p>{incident.status === 'Monitoring' ? 'Supply has returned. Review the incident before closing it.' : `${incident.observations.length} inlet points reported low pressure.`}</p>
      <a className="button primary review-direct" href={'#/incidents/' + incident.id}>Review incident <ArrowRight size={16} /></a>
    </div> : <p className="telemetry-note">{primary ? 'No active incidents linked to this basin.' : 'Use the central reserve for irrigation decisions.'}</p>}
  </section>
}

export function BasinTrend({ state, id, annexHistory, annexTimes }: { state: DashboardState; id: BasinId; annexHistory: number[]; annexTimes: number[] }) {
  const primary = id === 'B-01'
  return <section className="panel trend-panel">
    <div className="panel-heading"><div><h2>Reserve trend</h2><p>{siteBasins[id].name} · stored volume</p></div><span className="subtle-pill">Simulated readings</span></div>
    <HistoryChart key={id} values={primary ? state.volumeHistory : annexHistory} times={primary ? state.volumeTimes ?? seedTimes(state.volumeHistory.length, state.basinReadingAt) : annexTimes} unit="m³" threshold={primary ? lowReserve : undefined} storage />
    {primary ? <div className="chart-key"><i /> Low reserve · {lowReserve} m³</div> : <div className="chart-key unverified">Annex capacity · {annex.capacity} m³</div>}
    <p className="storage-note">Storage changes include inflow and outflow. Metered consumption history is unavailable.</p>
  </section>
}

export function Planning({ state, id }: { state: DashboardState; id: BasinId }) {
  const reserve = id === 'B-01' ? availableReserve(state) : null
  const route = id === 'B-01' && deriveTwinState(state).route
  return <section className="panel planning-panel">
    <div className="panel-heading"><div><h2>Reserve projection</h2><p>Rule-based irrigation planning</p></div><span className="planning-icon"><Route size={19} /></span></div>
    {reserve === null ? <div className="planning-unavailable"><CircleAlert size={19} /><p>Planning estimate unavailable. Irrigation verification is required.</p></div> : <>
      <div className="planning-body"><div><small>Estimated coverage</small><strong>{Math.floor(reserve / state.demand)} <span>cycles</span></strong></div><div><small>Potential mains offset</small><strong>{formatNumber(Math.floor(reserve / state.demand) * state.demand)} <span>m³</span></strong></div></div>
      <p className="planning-note">At {state.demand} m³ per irrigation cycle. Offset assumes each complete cycle substitutes for municipal water.</p>
    </>}
    <div className="planning-status"><Badge tone={route ? 'teal' : 'neutral'}>{route ? 'Route approved · simulation' : 'No active route'}</Badge><span>No measured savings</span></div>
  </section>
}
