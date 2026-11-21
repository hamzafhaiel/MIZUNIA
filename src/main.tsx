import { ArrowLeft, ArrowRight, ClipboardList, CloudRain, Droplet, FlaskConical, Gauge, Radio, RotateCcw, ShieldCheck, TriangleAlert } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { createRoot } from 'react-dom/client'
import { ActivityList, Badge, Brand, Dialog, Disclosure, Empty, formatNumber, formatTime, Header, navigation, PageTitle, SensorPanel, Severity, Trend } from './components.tsx'
import { activeIncident, allowAction, applyAction, availableReserve, runScenario, sampleState, setVolume, supplyStatus } from './model.ts'
import type { Action, DashboardState, Incident, Scenario } from './model.ts'
import { annex, siteBasins } from './twin/config.ts'
import type { BasinId, Mode } from './twin/config.ts'
import { BasinTelemetry, BasinTrend, Planning } from './twin/Telemetry.tsx'
import { TwinView } from './twin/TwinView.tsx'
import { appendTimes, seedTimes } from './history.ts'
import { motion } from './motion.ts'
import { HouseholdIncidents, ReportWaterCut } from './HouseholdIncidents.tsx'
import { CisternWorkspace } from './CisternMap.tsx'
import { StartupIntro } from './StartupIntro.tsx'
import { canRecordPickup, homes, loadHouseholds, sampleHouseholds, saveHouseholds } from './households.ts'
import type { AreaId, Assistance, HomeId, HouseholdReport, Issue } from './households.ts'
import './style.css'
import './twin/theme.css'
import './editorial.css'
import '@fontsource-variable/manrope/wght.css'
import '@fontsource-variable/space-grotesk/wght.css'
import './command.css'

const actionLabels = {
  review: 'Acknowledge incident',
  inspect: 'Request inspection',
  approve: 'Approve simulated use',
  resolve: 'Resolve incident',
}

function readRoute() {
  const [page, id] = window.location.hash.replace(/^#\/?/, '').split('/')
  return { page: page === 'incidents' || page === 'reserves' || page === 'report' ? page : 'map', id }
}

function App() {
  const [route, setRoute] = useState(readRoute)
  const [showIntro, setShowIntro] = useState(true)
  const [state, setState] = useState(() => sampleState())
  const [households, setHouseholds] = useState(loadHouseholds)
  const [selectedBasin, setSelectedBasin] = useState<BasinId>('B-01')
  const [mode, setMode] = useState<Mode>('cutaway')
  const [annexSeries, setAnnexSeries] = useState(() => ({ values: annex.history, times: seedTimes(annex.history.length, state.basinReadingAt) }))
  const [raining, setRaining] = useState(false)
  const [demo, setDemo] = useState(false)
  const [decision, setDecision] = useState<{ id: string; action: Action } | null>(null)
  const [message, setMessage] = useState('')
  const currentIncident = activeIncident(state)

  const finishIntro = useCallback(() => {
    setShowIntro(false)
    requestAnimationFrame(() => {
      if (readRoute().page === 'map') window.scrollTo({ top: 0, behavior: 'instant' })
      document.getElementById('main-content')?.focus({ preventScroll: true })
    })
  }, [])

  useEffect(() => saveHouseholds(households), [households])

  useEffect(() => {
    function navigate() {
      setRoute(readRoute())
      window.scrollTo({ top: 0, behavior: 'instant' })
    }
    window.addEventListener('hashchange', navigate)
    return () => window.removeEventListener('hashchange', navigate)
  }, [])

  useEffect(() => {
    if (!message) return
    const timeout = window.setTimeout(() => setMessage(''), 4500)
    return () => window.clearTimeout(timeout)
  }, [message])

  useEffect(() => {
    if (!raining) return
    const rain = window.setInterval(() => {
      setState(previous => setVolume(previous, Math.round((previous.stored + .3) * 10) / 10))
      setAnnexSeries(previous => {
        const next = Math.min(annex.capacity, Math.round(((previous.values.at(-1) ?? annex.initialVolume) + .1) * 10) / 10)
        return { values: [...previous.values.slice(-23), next], times: appendTimes(previous.times, 23, 1, Date.now()) }
      })
    }, 1000)
    const stop = window.setTimeout(() => setRaining(false), 8200)
    return () => { window.clearInterval(rain); window.clearTimeout(stop) }
  }, [raining])

  const incident = state.incidents.find(item => item.id === route.id)
  const householdReport = households.reports.find(item => item.id === route.id)
  const parkModel = route.page === 'reserves' && route.id === 'park'

  function selectBasin(id: BasinId, focus = false) {
    setSelectedBasin(id)
    setMode(previous => focus || previous === 'neighborhood' ? 'inspection' : previous)
  }

  function applyScenario(scenario: Scenario) {
    setState(previous => runScenario(previous, scenario))
    if (scenario === 'outage' || scenario === 'restore' || scenario === 'reset') {
      setMode('cutaway')
    }
    if (scenario === 'reset') {
      setHouseholds(sampleHouseholds())
      setRaining(false)
      setSelectedBasin('B-01')
      setAnnexSeries({ values: annex.history, times: seedTimes(annex.history.length, Date.now()) })
      window.location.hash = '#/map'
    }
    setMessage({
      outage: 'Low-pressure scenario applied',
      restore: 'Supply restored in the simulation',
      expired: 'Verification record updated',
      offline: 'Sensor connectivity updated',
      reset: 'Demo reset to its starting state',
    }[scenario])
  }

  function submitHouseholdReport(home: HomeId, issue: Issue, started: string, channel: HouseholdReport['channel']) {
    const existing = households.reports.find(report => report.home === home)
    if (existing) return existing.id
    const report = { id: 'BR-' + (101 + households.reports.length), home, issue, started, channel, submitted: Date.now() }
    setHouseholds(previous => previous.reports.some(item => item.home === home) ? previous : { ...previous, reports: [report, ...previous.reports] })
    return report.id
  }

  function confirmHouseholdArea(area: AreaId) {
    setHouseholds(previous => previous.confirmed[area] ? previous : { ...previous, confirmed: { ...previous.confirmed, [area]: Date.now() } })
  }

  function recordHouseholdAssistance(id: string, assistance: Assistance) {
    setHouseholds(previous => {
      const report = previous.reports.find(item => item.id === id)
      if (!report || report.assistance || (assistance === 'Non-drinking water' && !canRecordPickup(previous, homes[report.home].area))) return previous
      return { ...previous, reports: previous.reports.map(item => item.id === id ? { ...item, assistance } : item) }
    })
  }

  const annexVolume = annexSeries.values.at(-1) ?? annex.initialVolume
  const twin = <TwinView state={state} selected={selectedBasin} annexVolume={annexVolume} mode={mode} raining={raining}
    onMode={setMode} onPick={selectBasin} />
  const telemetry = <BasinTelemetry id={selectedBasin} state={state} annexVolume={annexVolume} incident={currentIncident} />
  const trend = <BasinTrend state={state} id={selectedBasin} annexHistory={annexSeries.values} annexTimes={annexSeries.times} />

  return <div className={'app-shell' + (parkModel ? ' is-section' : '')} style={{ '--motion-control': motion.control + 's', '--motion-panel': motion.panel + 's', '--motion-data': motion.data + 's', '--motion-ease': motion.easing } as CSSProperties}>
    <a className="skip-link" href="#main-content" onClick={event => { event.preventDefault(); document.getElementById('main-content')?.focus() }}>Skip to content</a>


    <div className="main-shell">
      <div className="command-header"><a href="#/map" className="command-brand" aria-label="Fas9ia home"><Brand /><span>FAS9IA</span></a><nav aria-label="Main navigation">{navigation.map(({ id, label, icon: Icon }) => <a key={id} href={'#/' + id} aria-current={route.page === id ? 'page' : undefined}><Icon size={15} /><span>{label}</span></a>)}</nav><Header state={state} onDemo={() => setDemo(true)} /></div>
      <main id="main-content" className="main-content" tabIndex={-1}>
        {parkModel && <div className="section-workspace">
          <a className="back-link" href="#/reserves"><ArrowLeft size={15} /> Shared reserves</a>
          <div className="overview-title">
            <span className="command-location">Borj Râs <i /> Simulated irrigation site</span>
            <h1>Parc Hydraulique model</h1>
          </div>
          <div className="overview-grid twin-grid" id="overview-site">{twin}{telemetry}</div>
          <Disclosure title="Monitoring and activity" detail={siteBasins[selectedBasin].name}>
            {trend}
            <Planning state={state} id={selectedBasin} />
            <div className="overview-grid lower-grid"><SensorPanel state={state} /><ActivityList items={state.activity.slice(0, 5)} /></div>
          </Disclosure>
        </div>}

        {(route.page === 'map' || route.page === 'reserves' && !parkModel) && <>
          <CisternWorkspace households={households} parkIncident={currentIncident} directory={route.page === 'reserves'} routeId={route.id} />
          {route.page === 'reserves' && <section className="panel technical-link"><div><h2>Parc Hydraulique model</h2><p>Inspect the 3D irrigation simulation and sensor history.</p></div><a className="button secondary" href="#/reserves/park">Open technical model <ArrowRight size={15} /></a></section>}
        </>}

        {route.page === 'incidents' && (incident ?
          <IncidentPage state={state} incident={incident} onInspectReserve={() => selectBasin('B-01', true)} onDecision={action => setDecision({ id: incident.id, action })} />
          : !route.id || householdReport ? <>
            <HouseholdIncidents key={route.id ?? 'queue'} state={households} reportId={householdReport?.id} onConfirmation={confirmHouseholdArea} onAssistance={recordHouseholdAssistance} />
            <Disclosure title="Park sensor incidents" detail={`${state.incidents.filter(item => item.status !== 'Resolved').length} active`}><IncidentList state={state} /></Disclosure>
          </> : <Empty><h1>Incident unavailable</h1><p>The demo may have been reset.</p><a href="#/incidents" className="button secondary">Back to incidents</a></Empty>)}

        {route.page === 'report' && <ReportWaterCut key={route.id ?? 'resident'} state={households} phone={route.id === 'phone'} onSubmit={submitHouseholdReport} />}

      </main>
    </div>

    {demo && <Dialog title="Demo controls" onClose={() => setDemo(false)} drawer>
      <div className="dialog-body demo-body">
        <p>Change the sample data to see how the dashboard responds.</p>
        <div className="scenario-list">
          <button className="scenario" onClick={() => applyScenario('outage')}><span className="metric-icon alert"><TriangleAlert size={17} /></span><span><strong>Trigger low pressure</strong><small>Two monitoring points report sustained low pressure.</small></span><ArrowRight size={16} /></button>
          <button className="scenario" onClick={() => applyScenario('restore')}><span className="metric-icon available"><Gauge size={17} /></span><span><strong>Restore supply</strong><small>Return inlet pressure to normal.</small></span><ArrowRight size={16} /></button>
          <button className="scenario" onClick={() => applyScenario('expired')}><span className="metric-icon water"><ShieldCheck size={17} /></span><span><strong>{state.verified ? 'Expire verification' : 'Restore verification'}</strong><small>Update the irrigation eligibility record.</small></span><ArrowRight size={16} /></button>
          <button className="scenario" onClick={() => applyScenario('offline')}><span className="metric-icon device"><Radio size={17} /></span><span><strong>{state.sensors.every(sensor => sensor.online) ? 'Disconnect sensors' : 'Reconnect sensors'}</strong><small>Change inlet monitoring connectivity.</small></span><ArrowRight size={16} /></button>
          <button className="scenario" aria-pressed={raining} onClick={() => setRaining(previous => !previous)}><span className="metric-icon water"><CloudRain size={17} /></span><span><strong>{raining ? 'Stop demo rainfall' : 'Simulate rainfall'}</strong><small>Watch the simulated inflow fill both reservoirs.</small></span><ArrowRight size={16} /></button>
        </div>
        <label className="volume-label" htmlFor="demo-volume"><span><Droplet size={17} /> Basin volume</span><strong>{formatNumber(state.stored)} m³</strong></label>
        <input id="demo-volume" type="range" min={0} max={state.capacity} step={0.1} value={state.stored} onChange={event => setState(previous => setVolume(previous, event.target.valueAsNumber))} />
        <div className="range-labels"><span>0 m³</span><span>{state.capacity} m³</span></div>
        <button className="button secondary reset-button" onClick={() => applyScenario('reset')}><RotateCcw size={15} /> Reset demo</button>
        <p className="drawer-notice" role="status">{message}</p>
      </div>
    </Dialog>}

    {decision && <Dialog title={actionLabels[decision.action]} onClose={() => setDecision(null)}>
      <form className="dialog-body" onSubmit={event => {
        event.preventDefault()
        const reason = String(new FormData(event.currentTarget).get('reason') ?? '').trim()
        const target = state.incidents.find(item => item.id === decision.id)
        if (!reason || !target || !allowAction(state, target, decision.action)) return
        setState(previous => applyAction(previous, decision.id, decision.action, reason))
        setDecision(null)
        setMessage('Decision recorded in the incident timeline')
      }}>
        <p>{decision.action === 'approve' ? 'Record operator approval for a simulated irrigation cycle. This only adds a decision to the timeline.' : 'Add a reason for the incident timeline.'}</p>
        <label className="reason-label" htmlFor="reason">Decision reason</label>
        <textarea id="reason" name="reason" required minLength={3} maxLength={240} rows={3} placeholder="Include the evidence behind this decision." autoFocus />
        <div className="dialog-actions"><button className="button secondary" type="button" onClick={() => setDecision(null)}>Cancel</button><button className="button primary" type="submit">Record decision</button></div>
      </form>
    </Dialog>}
    {!demo && <div className={message ? 'toast' : 'sr-only'} role="status">{message}</div>}
    {showIntro && <StartupIntro onFinish={finishIntro} />}
  </div>
}

function IncidentList({ state }: { state: DashboardState }) {
  const [filter, setFilter] = useState<'All' | 'Active' | 'Resolved'>('All')
  const incidents = state.incidents.filter(item => filter === 'All' || (filter === 'Resolved' ? item.status === 'Resolved' : item.status !== 'Resolved'))
  return <>
    <section className="panel table-panel">
      <div className="panel-heading"><div><h2>Incident log</h2><p>{incidents.length} {incidents.length === 1 ? 'incident' : 'incidents'}</p></div>
        <div className="segmented" aria-label="Filter incidents">{(['All', 'Active', 'Resolved'] as const).map(value => <button key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{value}</button>)}</div>
      </div>
      {incidents.length ? <div className="table-scroll"><table><thead><tr><th>Incident</th><th>Area</th><th>Severity</th><th>Status</th><th>Opened</th><th><span className="sr-only">Open details</span></th></tr></thead>
        <tbody>{incidents.map(item => <tr key={item.id}><td><a className="table-link" href={'#/incidents/' + item.id}><TriangleAlert size={16} /><span><strong>Sustained low pressure</strong><small>{item.id}</small></span></a></td><td>Zone A</td><td><Severity incident={item} /></td><td><Badge tone={item.status === 'Resolved' ? 'teal' : 'neutral'}>{item.status}</Badge></td><td>{formatTime(item.openedAt)}</td><td><a className="icon-button" href={'#/incidents/' + item.id} aria-label={'Review ' + item.id}><ArrowRight size={17} /></a></td></tr>)}</tbody></table></div> : <Empty><p>No {filter.toLowerCase()} incidents.</p></Empty>}
    </section>
  </>
}

function IncidentPage({ state, incident, onDecision, onInspectReserve }: { state: DashboardState; incident: Incident; onDecision: (action: Action) => void; onInspectReserve: () => void }) {
  const reserve = availableReserve(state)
  const approvalAvailable = allowAction(state, incident, 'approve')
  const recovery = supplyStatus(state)
  return <>
    <a className="back-link" href="#/incidents"><ArrowLeft size={15} /> All incidents</a>
    <PageTitle title="Sustained low pressure" subtitle={incident.id + ' · Zone A, Borj Eras · Opened ' + formatTime(incident.openedAt)}><div className="chip-row"><Severity incident={incident} /><Badge tone={incident.status === 'Resolved' ? 'teal' : 'neutral'}>{incident.status}</Badge></div></PageTitle>
    <div className="overview-grid incident-grid">
      <div className="stack">
        <Disclosure title="Incident evidence" detail="Open observations" initiallyOpen>
          <div className="evidence-box"><strong>{incident.observations.length} monitoring points reported low pressure</strong><p>Inlet readings of {incident.observations.map(formatNumber).join(' and ')} bar were below the 1 bar demo threshold. Severity reflects the affected area and reserve available when the scenario ran.</p></div>
        </Disclosure>
        <Trend state={state} pressure />
        <SensorPanel state={state} />
      </div>
      <div className="stack">
        <section className="panel decision-panel">
          <div className="panel-heading"><div><h2>Operator response</h2><p>Review the shared reserve before acting.</p></div><ClipboardList size={20} /></div>
          <a className="reserve-context reserve-detail-link" href="#/reserves/park" onClick={onInspectReserve}><span className="metric-icon available"><Droplet size={17} /></span><div><strong>Inspect Basin 01</strong><small>{reserve === null ? 'Irrigation verification expired' : formatNumber(reserve) + ' m³ available · ' + Math.floor(reserve / state.demand) + ' planned cycles'}</small></div><ArrowRight size={15} /></a>
          {incident.status !== 'Resolved' ? <>
            <p className="decision-help">{incident.actions.includes('approve') ? 'Simulated use approval is recorded in the timeline.' : incident.status === 'Monitoring' ? recovery === 'Normal' ? 'Supply has recovered. Confirm the current readings before resolving.' : 'Wait for normal reporting before resolving.' : reserve === null ? 'Simulated reserve use is unavailable while verification is expired.' : reserve < state.demand ? 'Available reserve is below the demand for one planned cycle.' : incident.status === 'Open' ? 'Acknowledge the incident before approving simulated reserve use.' : 'Operator approval is required for the simulated action.'}</p>
            <div className="decision-buttons">
              {allowAction(state, incident, 'review') && <button className="button primary" onClick={() => onDecision('review')}>{actionLabels.review}<ArrowRight size={16} /></button>}
              {approvalAvailable && <button className="button primary" onClick={() => onDecision('approve')}><FlaskConical size={16} />{actionLabels.approve}</button>}
              {allowAction(state, incident, 'resolve') && <button className="button primary" onClick={() => onDecision('resolve')}>{actionLabels.resolve}<ArrowRight size={16} /></button>}
              {allowAction(state, incident, 'inspect') && <button className="button secondary" onClick={() => onDecision('inspect')}>{actionLabels.inspect}</button>}
            </div>
          </> : <p className="decision-help">This incident is resolved. Decisions remain available in the timeline.</p>}
        </section>
        <ActivityList items={state.activity.filter(item => item.incidentId === incident.id)} timeline />
      </div>
    </div>
  </>
}

createRoot(document.getElementById('root')!).render(<App />)
