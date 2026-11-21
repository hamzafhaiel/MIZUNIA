import { Activity as Pulse, ChevronDown, CircleAlert, ClipboardList, Clock3, Droplet, Gauge, LayoutDashboard, Radio, SlidersHorizontal, TriangleAlert, Waves, Wifi, X } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { lowPressure, lowReserve, supplyStatus } from './model.ts'
import type { Activity, DashboardState, Incident } from './model.ts'
import { historyWindow, ranges, seedTimes } from './history.ts'
import type { RangeId } from './history.ts'

export const formatNumber = (value: number) => value.toLocaleString('en', { maximumFractionDigits: 1 })
const localTime = new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Tunis', hour: '2-digit', minute: '2-digit' })
export const formatTime = (value: number) => localTime.format(value)

export function Brand() {
  return <span className="brand"><span className="brand-icon"><Droplet size={22} /><Waves size={13} /></span><span>fas9ia<span className="brand-dot">.</span><small>WATER OPERATIONS</small></span></span>
}

export const navigation = [
  { id: 'map', label: 'Opérations', icon: LayoutDashboard },
  { id: 'incidents', label: 'Incidents', icon: TriangleAlert },
  { id: 'reserves', label: 'Réserves', icon: Droplet },
] as const

export function Header({ onDemo, state }: { onDemo: () => void; state: DashboardState }) {
  const reporting = state.sensors.filter(sensor => sensor.online).length
  return <header className="topbar">
    <div className="header-actions" lang="fr"><span className={'header-connectivity' + (reporting === 0 ? ' offline' : '')}><Radio size={13} /> {reporting}/{state.sensors.length} capteurs en ligne</span><span className="simulation-dot"><i /> Simulation</span><button className="button secondary demo-button" onClick={onDemo}><SlidersHorizontal size={15} /><span>Scénarios</span></button></div>
  </header>
}

export function Badge({ tone = 'neutral', children }: { tone?: 'neutral' | 'amber' | 'teal' | 'red'; children: ReactNode }) {
  return <span className={'badge ' + tone}><i />{children}</span>
}

export function Severity({ incident }: { incident: Incident }) {
  const tone = incident.severity === 'Critical' ? 'red' : incident.severity === 'Moderate' ? 'amber' : 'teal'
  return <Badge tone={tone}>{incident.severity}</Badge>
}

export function Chart({ values, threshold, unit, color = 'teal', times, timeBounds }: { values: number[]; threshold?: number; unit: string; color?: 'teal' | 'amber'; times?: number[]; timeBounds?: [number, number] }) {
  const gradient = useId()
  const [hover, setHover] = useState<number | null>(null)
  const max = Math.ceil(Math.max(...values, threshold ?? 0) / (unit === 'bar' ? 1 : 2)) * (unit === 'bar' ? 1 : 2)
  const min = unit === 'bar' ? 0 : Math.max(0, Math.floor(Math.min(...values, threshold ?? Infinity) / 2) * 2 - 2)
  const range = Math.max(max - min, 1)
  const width = 600
  const height = 150
  const padding = 10
  const y = (value: number) => padding + (max - value) / range * (height - 2 * padding)
  const points = values.map((value, index) => {
    const fraction = times && timeBounds && timeBounds[1] > timeBounds[0]
      ? (times[index] - timeBounds[0]) / (timeBounds[1] - timeBounds[0])
      : values.length === 1 ? 1 : index / Math.max(values.length - 1, 1)
    return [padding + fraction * (width - 2 * padding), y(value)]
  })
  const line = points.map(point => point.join(',')).join(' ')
  const shade = color === 'teal' ? 'var(--water)' : 'var(--warning)'
  const last = points.at(-1)
  const activePoint = hover === null ? undefined : points[hover]
  return <div className="chart">
    <div className="chart-axes">
      {[max, max - range / 2, min].map(value => <span key={value}>{formatNumber(value)} {unit}</span>)}
    </div>
    <div className="chart-body">
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label={`Reading history. Latest value ${formatNumber(values.at(-1) ?? 0)} ${unit}. ${threshold === undefined ? "" : `Threshold ${threshold} ${unit}.`}`}
        onPointerMove={event => {
          if (!points.length) return
          const rect = event.currentTarget.getBoundingClientRect()
          const x = (event.clientX - rect.left) / rect.width * width
          setHover(points.reduce((best, point, index) => Math.abs(x - point[0]) <= Math.abs(x - points[best][0]) ? index : best, 0))
        }} onPointerLeave={() => setHover(null)}>
        <defs><linearGradient id={gradient} x2="0" y2="1"><stop offset="0" stopColor={shade} stopOpacity=".2" /><stop offset="100%" stopColor={shade} stopOpacity=".01" /></linearGradient></defs>
        {[y(max), y(max - range / 2), y(min)].map(row => <line key={row} x1="0" x2={width} y1={row} y2={row} stroke="#2d4651" vectorEffect="non-scaling-stroke" />)}
        <polygon points={`${padding},${height} ${line} ${last?.[0] ?? padding},${height}`} fill={`url(#${gradient})`} />
        {threshold !== undefined && <line x1="0" x2={width} y1={y(threshold)} y2={y(threshold)} stroke="#bc8739" opacity=".65" strokeDasharray="5 5" vectorEffect="non-scaling-stroke" />}
        <polyline points={line} fill="none" stroke={shade} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        {last && <circle cx={last[0]} cy={last[1]} r="4" fill={shade} stroke="#d7faf3" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />}
        {activePoint && <g aria-hidden="true"><line x1={activePoint[0]} x2={activePoint[0]} y1="0" y2={height} stroke={shade} opacity=".5" vectorEffect="non-scaling-stroke" /><circle cx={activePoint[0]} cy={activePoint[1]} r="5" fill={shade} /></g>}
      </svg>
      {activePoint && hover !== null && <span className="chart-readout" aria-hidden="true">{times ? formatTime(times[hover]) + ' · ' : ''}{formatNumber(values[hover])} {unit}</span>}
      <div className="chart-time"><span>{timeBounds ? formatTime(timeBounds[0]) : 'Oldest reading'}</span><span>{timeBounds ? formatTime(timeBounds[1]) + ' · Tunis' : 'Latest reading'}</span></div>
    </div>
  </div>
}

export function HistoryChart({ values, times, unit, threshold, storage = false }: {
  values: number[]; times: number[]; unit: string; threshold?: number; storage?: boolean
}) {
  const [range, setRange] = useState<RangeId>('1h')
  const series = historyWindow(values, times, range)
  const latest = series.readings.at(-1)?.value
  const first = series.readings[0]?.value
  const delta = series.readings.length > 1 && first !== undefined && latest !== undefined ? Math.round((latest - first) * 10) / 10 : null
  return <div className="history-chart">
    <div className="history-tools"><span>{series.readings.length} readings{storage && delta !== null ? ` · ${delta > 0 ? '+' : ''}${formatNumber(delta)} m³ net storage change` : ''}</span>
      <div className="segmented history-ranges" aria-label="Chart time range">{ranges.map(item => <button type="button" key={item.id} aria-pressed={range === item.id} onClick={() => setRange(item.id)}>{item.label}</button>)}</div>
    </div>
    {series.readings.length ? <Chart key={range} values={series.readings.map(item => item.value)} times={series.readings.map(item => item.at)} timeBounds={[series.start, series.end]} threshold={threshold} unit={unit} color={unit === 'bar' ? 'amber' : 'teal'} /> : <p className="empty-inline">No readings in this time range.</p>}
  </div>
}

export function Trend({ state, pressure = false }: { state: DashboardState; pressure?: boolean }) {
  const offline = pressure && !state.sensors[0]?.online
  return <section className="panel trend-panel">
    <div className="panel-heading"><div><h2>{pressure ? 'Inlet pressure' : 'Reserve trend'}</h2><p>{pressure ? 'North inlet · P-01' : 'Basin 01 · stored volume'}</p></div><span className="subtle-pill"><Clock3 size={13} /> {offline ? 'Last known readings' : 'Recent readings'}</span></div>
    <HistoryChart values={pressure ? state.pressureHistory : state.volumeHistory} times={(pressure ? state.pressureTimes : state.volumeTimes) ?? seedTimes(pressure ? state.pressureHistory.length : state.volumeHistory.length, state.basinReadingAt)} unit={pressure ? 'bar' : 'm³'} threshold={pressure ? lowPressure : lowReserve} />
    <div className="chart-key"><i /> {pressure ? 'Low pressure · 1 bar' : 'Low reserve · 15 m³'}</div>
  </section>
}

const activityIcons = { incident: TriangleAlert, reserve: Droplet, device: Radio, decision: ClipboardList }

export function ActivityList({ items, timeline = false }: { items: Activity[]; timeline?: boolean }) {
  return <section className="panel activity-panel">
    <div className="panel-heading"><div><h2>{timeline ? 'Incident timeline' : 'Recent activity'}</h2><p>{timeline ? 'Observations and operator decisions' : 'Events in the pilot area'}</p></div></div>
    {items.length ? <ul className="activity-list">{items.map(item => {
      const Icon = activityIcons[item.type]
      const content = <><span className={'activity-icon ' + item.type}><Icon size={15} /></span><span className="activity-copy"><strong>{item.title}</strong><small>{item.detail}</small></span><time dateTime={new Date(item.at).toISOString()}>{formatTime(item.at)}</time></>
      return <li key={item.id}>{item.incidentId && !timeline ? <a href={'#/incidents/' + item.incidentId}>{content}</a> : <div>{content}</div>}</li>
    })}</ul> : <p className="empty-inline">No events recorded yet.</p>}
  </section>
}

export function SensorPanel({ state, panel = false }: { state: DashboardState; panel?: boolean }) {
  const status = supplyStatus(state)
  return <section className={'panel sensor-panel' + (panel ? ' sensor-compact' : '')} id={panel ? undefined : 'monitoring-points'}>
    <div className="panel-heading"><div><h2>{panel ? 'Zone A' : 'Monitoring points'}</h2><p><Wifi size={13} /> Municipal inlet pressure</p></div><Badge tone={status === 'Normal' ? 'teal' : status === 'Low pressure' ? 'amber' : 'neutral'}>{status}</Badge></div>
    <ul className="sensor-list">{state.sensors.map(sensor => <li key={sensor.id}><span className="sensor-icon"><Gauge size={17} /></span><span className="sensor-label"><strong>{sensor.label}</strong><small>{sensor.id} · {sensor.online ? 'Reporting' : 'Offline'}</small></span><strong>{sensor.online ? formatNumber(sensor.pressure) + ' bar' : 'Unknown'}</strong></li>)}</ul>
  </section>
}

export function Dialog({ title, onClose, children, drawer = false }: { title: string; onClose: () => void; children: ReactNode; drawer?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const id = useId()
  useEffect(() => { dialog.current?.showModal() }, [])
  return <dialog ref={dialog} className={drawer ? 'dialog drawer' : 'dialog'} aria-labelledby={id} onCancel={(event) => { event.preventDefault(); onClose() }} onClick={event => { if (event.target === event.currentTarget) {
    const bounds = event.currentTarget.getBoundingClientRect()
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose()
  } }}>
    <div className="dialog-heading"><h2 id={id}>{title}</h2><button className="icon-button" type="button" aria-label="Close dialog" onClick={onClose}><X size={21} /></button></div>
    {children}
  </dialog>
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty-screen"><CircleAlert size={24} />{children}</div>
}

export function PageTitle({ title, subtitle, children }: { title: string; subtitle: string; children?: ReactNode }) {
  return <div className="page-title"><div><h1>{title}</h1><p>{subtitle}</p></div>{children}</div>
}

export function Overline({ children }: { children: ReactNode }) {
  return <span className="eyebrow"><Pulse size={13} /> {children}</span>
}

export function Disclosure({ title, detail, children, initiallyOpen = false }: { title: string; detail?: string; children: ReactNode; initiallyOpen?: boolean }) {
  return <details className="disclosure" open={initiallyOpen}>
    <summary><h2>{title}</h2>{detail && <span>{detail}</span>}<ChevronDown size={16} /></summary>
    <div className="disclosure-body">{children}</div>
  </details>
}
