import { ArrowLeft, ArrowRight, ChevronRight, ClipboardList, CloudRain, Droplet, FlaskConical, Gauge, LogOut, MapPin, Radio, RotateCcw, ShieldCheck, SlidersHorizontal, TriangleAlert } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { createRoot } from 'react-dom/client'
import { ActivityList, Badge, Brand, Dialog, Disclosure, Empty, formatNumber, formatTime, Header, navigation, PageTitle, SensorPanel, Severity, Trend } from './components.tsx'
import type { Theme } from './components.tsx'
import { activeIncident, allowAction, applyAction, availableReserve, runScenario, sampleState, setVolume, supplyStatus } from './model.ts'
import type { Action, DashboardState, Incident, Scenario } from './model.ts'
import { annex } from './twin/config.ts'
import type { Weather } from './twin/config.ts'
import { appendTimes, seedTimes } from './history.ts'
import { motion } from './motion.ts'
import { CisternWorkspace } from './CisternMap.tsx'
import { StartupIntro } from './StartupIntro.tsx'
import { Login, readDemoSession, saveDemoSession } from './Login.tsx'
import { ValveStation } from './ValveStation.tsx'
import { Energy } from './Energy.tsx'
import { KizunaPageLink, KizunaPanels } from './KizunaPanels.tsx'
import { networkAlerts, NetworkIncidents, useNetworkJournal } from './NetworkIncidents.tsx'
import { PilotControl } from './KizunaPilotPanel.tsx'
import { useKizuna } from './useKizuna.ts'
import { useKizunaPage } from './useKizunaPage.ts'
import type { KizunaSource } from './kizuna-model.ts'
import { advanceStation, closedValves, initialStation } from './valves.ts'
import type { ValveId } from './valves.ts'
import { useStationAdvice } from './useStationAdvice.ts'
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

const themeKey = 'fas9ia-theme'

function readTheme(): Theme {
  try {
    return localStorage.getItem(themeKey) === 'light' ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

function readRoute() {
  const [page, id] = window.location.hash.replace(/^#\/?/, '').split('/')
  return { page: navigation.find(item => item.id === page)?.id ?? (page === 'report' ? 'incidents' : 'map'), id: page === 'report' ? undefined : id }
}

function annexReading(series: { values: number[]; times: number[] }, requested: number, now = Date.now()) {
  const volume = series.values.at(-1) ?? annex.initialVolume
  if (!Number.isFinite(requested)) return series
  const next = Math.max(0, Math.min(annex.capacity, requested))
  if (next === volume) return series
  return { values: [...series.values.slice(-23), next], times: appendTimes(series.times, 23, 1, now) }
}

function stationInputs(state: DashboardState, annexVolume: number, raining: boolean) {
  return { central: state.stored, centralCapacity: state.capacity, annex: annexVolume, annexCapacity: annex.capacity,
    holdback: state.holdback, verified: state.verified, supply: supplyStatus(state), raining,
    criticalIncident: state.incidents.some(incident => incident.status !== 'Resolved' && incident.severity === 'Critical'),
  }
}

function App() {
  const [route, setRoute] = useState(readRoute)
  const [theme, setTheme] = useState(readTheme)
  const [showIntro, setShowIntro] = useState(true)
  const [signedIn, setSignedIn] = useState(readDemoSession)
  const simulation = route.page === 'simulation'
  const parkModel = route.page === 'reserves' && route.id === 'park'
  const kizuna = useKizuna(signedIn && !showIntro, simulation || parkModel)
  const kizunaPage = useKizunaPage(signedIn && !showIntro, kizuna)
  const useKizunaViews = kizuna.source !== null
  const [{ state, annexSeries }, setHydraulics] = useState(() => {
    const state = sampleState()
    return { state, annexSeries: { values: annex.history, times: seedTimes(annex.history.length, state.basinReadingAt) } }
  })
  const setState = useCallback((update: (state: DashboardState) => DashboardState) => {
    setHydraulics(previous => {
      const state = update(previous.state)
      return state === previous.state ? previous : { ...previous, state }
    })
  }, [])
  const alerts = networkAlerts(kizuna.state, kizuna.pilot, kizuna.pressureTest, kizuna.offline,
    state.sensors.filter(sensor => !sensor.online).map(sensor => sensor.id))
  const networkHistory = useNetworkJournal(alerts, signedIn && !showIntro)
  const [station, setStation] = useState(initialStation)
  const [weather, setWeather] = useState<Weather>('sunny')
  const [rainPulse, setRainPulse] = useState(false)
  const raining = weather === 'rain' || rainPulse
  const [demo, setDemo] = useState(false)
  const [decision, setDecision] = useState<{ id: string; action: Action } | null>(null)
  const [message, setMessage] = useState('')
  const currentIncident = activeIncident(state)
  const annexVolume = annexSeries.values.at(-1) ?? annex.initialVolume
  const simulatedWeather = raining ? 'rain' : weather
  const inputs = stationInputs(state, annexVolume, raining)
  const advisoryActive = !useKizunaViews && signedIn && !showIntro && station.mode === 'auto' && !station.stopped
  const localOpenings = advanceStation(station, inputs).openings
  const adviceSnapshot = advisoryActive ? JSON.stringify({
    centralPercent: Math.round(state.stored / state.capacity * 20) * 5,
    annexPercent: Math.round(annexVolume / annex.capacity * 20) * 5,
    weather: simulatedWeather,
    supply: inputs.supply,
    verified: state.verified,
    pressures: state.sensors.map(sensor => sensor.online ? sensor.pressure : null),
    incidents: state.incidents.filter(incident => incident.status !== 'Resolved').slice(0, 5).map(({ status, severity }) => ({ status, severity })),
    tests: [],
    wateringTest: false,
    openings: localOpenings,
  }) : ''
  const profile = useStationAdvice(advisoryActive, adviceSnapshot)
  const stationStatus = advanceStation(station, inputs, profile ?? undefined)

  const finishIntro = useCallback(() => setShowIntro(false), [])

  useEffect(() => {
    if (showIntro) return
    window.scrollTo({ top: 0, behavior: 'instant' })
    document.getElementById(signedIn ? 'main-content' : 'login-email')?.focus({ preventScroll: true })
  }, [showIntro, signedIn])

  function changeSession(active: boolean) {
    saveDemoSession(active)
    setSignedIn(active)
    if (!active) {
      kizuna.select(null)
      setDemo(false)
      setDecision(null)
      setMessage('')
      setStation(initialStation)
    }
  }


  useEffect(() => {
    try {
      localStorage.setItem(themeKey, theme)
    } catch {
      // The selected theme remains available during this session.
    }
  }, [theme])

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

  const updateAnnex = useCallback((update: (volume: number) => number) => {
    setHydraulics(previous => {
      const series = previous.annexSeries
      const annexSeries = annexReading(series, update(series.values.at(-1) ?? annex.initialVolume))
      return annexSeries === series ? previous : { ...previous, annexSeries }
    })
  }, [])

  useEffect(() => {
    const running = !station.stopped && (station.mode === 'auto' || Object.values(station.openings).some(value => value > 0))
    if (useKizunaViews || !signedIn || showIntro || (!raining && !running)) return
    const clock = window.setInterval(() => {
      const now = Date.now()
      setHydraulics(previous => {
        const next = advanceStation(station, stationInputs(previous.state, previous.annexSeries.values.at(-1) ?? annex.initialVolume, raining), profile ?? undefined)
        const state = setVolume(previous.state, next.central, now)
        const annexSeries = annexReading(previous.annexSeries, next.annex, now)
        return state === previous.state && annexSeries === previous.annexSeries ? previous : { state, annexSeries }
      })
    }, 1000)
    return () => window.clearInterval(clock)
  }, [raining, signedIn, showIntro, station, profile, useKizunaViews])

  useEffect(() => {
    if (!rainPulse) return
    const stop = window.setTimeout(() => setRainPulse(false), 8200)
    return () => window.clearTimeout(stop)
  }, [rainPulse])

  const incident = state.incidents.find(item => item.id === route.id)

  function chooseWeather(next: Weather) {
    setWeather(next)
    setRainPulse(false)
  }

  function adjustValve(id: ValveId, opening: number) {
    if (!Number.isFinite(opening)) return
    setStation(previous => previous.stopped || previous.mode === 'auto' ? previous : {
      ...previous, openings: { ...previous.openings, [id]: Math.max(0, Math.min(100, opening)) },
    })
  }

  function stopStation() {
    setStation({ ...initialStation, stopped: true })
  }

  function applyScenario(scenario: Scenario) {
    setState(previous => runScenario(previous, scenario))
    if (scenario === 'reset') {
      chooseWeather('sunny')
      setHydraulics(previous => ({ ...previous, annexSeries: { values: annex.history, times: seedTimes(annex.history.length, Date.now()) } }))
      setStation(initialStation)
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

  const connectedSource = kizuna.source
  const shared = connectedSource ? {
    source: connectedSource, state: kizuna.state, weather: kizuna.weather, pressureTest: kizuna.pressureTest,
    openings: kizuna.openings, pending: kizuna.pending, onCommand: kizuna.command,
  } : null
  const connectedSection = route.page === 'simulation' || route.page === 'vannes' || route.page === 'reserves' || route.page === 'energie' ? route.page : null
  const liveRegistry = connectedSource ? {
    state: kizuna.state, at: kizuna.receivedAt,
    outage: kizuna.pilot
      ? kizuna.pilot.outageAt !== null && kizuna.pilot.clock >= kizuna.pilot.outageAt
      : Boolean(kizuna.state?.basins.some(basin => basin.networkOutage)),
  } : undefined

  if (showIntro) return <StartupIntro onFinish={finishIntro} />
  if (!signedIn) return <div className="app-shell login-shell" data-theme={theme}><Login onSignIn={() => changeSession(true)} /></div>

  return <div className={'app-shell' + (parkModel ? ' is-section' : '')} data-theme={theme} style={{ '--motion-control': motion.control + 's', '--motion-panel': motion.panel + 's', '--motion-data': motion.data + 's', '--motion-ease': motion.easing } as CSSProperties}>
    <a className="skip-link" href="#main-content" onClick={event => { event.preventDefault(); document.getElementById('main-content')?.focus() }}>Skip to content</a>


    <aside className="command-sidebar" lang="fr">
      <a href="#/map" className="command-brand" aria-label="FAS9IA, accueil"><Brand /><span>FAS9IA</span></a>
      <div className="sidebar-site"><span><MapPin size={17} /></span><div><strong>Borj Râs</strong><small>Site pilote · Mahdia</small></div></div>
      <nav aria-label="Navigation principale">
        {navigation.map(({ id, label, icon: Icon }) => <a key={id} href={'#/' + id} aria-current={route.page === id ? 'page' : undefined}>
          <Icon size={18} /><span>{label}</span><ChevronRight className="nav-arrow" size={14} aria-hidden="true" />
        </a>)}
      </nav>
      {!useKizunaViews && <button className="button secondary demo-button" type="button" onClick={() => setDemo(true)}><SlidersHorizontal size={16} /> Scénarios</button>}
      <div className="sidebar-account">
        <span className="sidebar-initials" aria-hidden="true">D</span>
        <span className="sidebar-account-name"><strong>Compte démo</strong><small>Session locale</small></span>
        <button className="sidebar-logout" type="button" aria-label="Se déconnecter" title="Se déconnecter" onClick={() => changeSession(false)}><LogOut size={17} /></button>
      </div>
    </aside>

    <div className="main-shell">
      <Header state={state} theme={theme} onThemeChange={setTheme} connected={connectedSource ? {
        label: connectedSource === 'wokwi' ? 'Wokwi MQTT' : 'KIZUNA local',
        reporting: kizuna.state?.basins.filter(basin => basin.levelPct !== null).length ?? 0,
        count: 3,
      } : undefined} />
      <main id="main-content" className="main-content" tabIndex={-1}>
        {connectedSource && <section className="panel kz-source" aria-label="Source de simulation">
          <label>Source de simulation
            <select value={connectedSource} onChange={event => {
              setDemo(false)
              setDecision(null)
              kizuna.select(event.currentTarget.value as KizunaSource)
            }}>
              <option value="kizuna">KIZUNA · Simulation locale</option>
              <option value="wokwi">KIZUNA · ESP32 Wokwi</option>
            </select>
          </label>
          <p role="status">{kizuna.pending ? 'En attente de confirmation Wokwi…' : kizuna.status}</p>
          {kizuna.result && <p role={kizuna.result.error ? 'alert' : 'status'}>{kizuna.result.message}</p>}
        </section>}
        {parkModel && <a className="back-link" href="#/reserves"><ArrowLeft size={15} /> Réserves</a>}
        {shared && connectedSection && <KizunaPanels key={kizuna.source} {...shared} section={connectedSection} routeId={route.id}
          weatherName={kizuna.weatherName} onWeather={kizuna.setWeather} onPressureTest={kizuna.setPressureTest}
          history={kizuna.history} automatic={kizuna.automatic} onAutomatic={kizuna.setAutomatic}
          onOpening={kizuna.setOpening} onDistance={kizuna.setDistance} pilot={kizuna.pilot} pilotControls={kizuna.pilotControls}
          generator={kizuna.generator} onGenerator={kizuna.setGeneratorRunning}
          sceneHref={simulation || parkModel ? kizunaPage : undefined} />}
        {!shared && route.page === 'vannes' && <ValveStation station={station} status={stationStatus} profile={profile} central={state.stored} annexVolume={annexVolume}
          onMode={mode => setStation(previous => previous.stopped || previous.mode === mode ? previous : { ...previous, mode, openings: closedValves })}
          onAdjust={adjustValve} onStop={stopStation} onResume={() => setStation(initialStation)} />}
        {!shared && route.page === 'energie' && <Energy key={route.id} initialView={route.id === 'circuits' ? 'circuits' : route.id === 'pompes' ? 'pumps' : 'solar'}
          weather={simulatedWeather} sensors={state.sensors} stopped={station.stopped} wateringTest={false}
          flows={stationStatus.rates} />}
        {(route.page === 'map' || route.page === 'reserves' && !parkModel) && <>
          <CisternWorkspace networkIncidents={alerts.length} parkIncident={shared ? undefined : currentIncident} directory={route.page === 'reserves'}
            routeId={route.id} liveRegistry={liveRegistry} power={kizuna} />
          {route.page === 'reserves' && <section className="panel technical-link"><div><h2>Maquette KIZUNA</h2><p>Observer les trois bassins et leurs conduites en 3D.</p></div><KizunaPageLink href={kizunaPage} /></section>}
        </>}

        {route.page === 'incidents' && (incident ?
          <IncidentPage state={state} incident={incident} onDecision={action => setDecision({ id: incident.id, action })} />
          : <div className="kz-stack">
            <h1>Incidents</h1>
            <NetworkIncidents alerts={alerts} entries={networkHistory} />
            {kizuna.pilot ? <PilotControl pilot={kizuna.pilot} controls={kizuna.pilotControls} />
              : <div className="kz-actions"><a href="#/simulation" className="button primary">Ouvrir le scénario SONEDE</a></div>}
            {!shared && <Disclosure title="Incidents de pression du parc" detail={`${state.incidents.filter(item => item.status !== 'Resolved').length} actif(s)`}><IncidentList state={state} /></Disclosure>}
          </div>)}

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
          <button className="scenario" aria-pressed={raining} onClick={() => raining ? chooseWeather(weather === 'rain' ? 'sunny' : weather) : setRainPulse(true)}><span className="metric-icon water"><CloudRain size={17} /></span><span><strong>{raining ? 'Stop demo rainfall' : 'Simulate rainfall'}</strong><small>Watch the simulated inflow fill both reservoirs.</small></span><ArrowRight size={16} /></button>
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

function IncidentPage({ state, incident, onDecision }: { state: DashboardState; incident: Incident; onDecision: (action: Action) => void }) {
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
          <div className="reserve-context"><span className="metric-icon available"><Droplet size={17} /></span><div><strong>Basin 01</strong><small>{reserve === null ? 'Irrigation verification expired' : formatNumber(reserve) + ' m³ available · ' + Math.floor(reserve / state.demand) + ' planned cycles'}</small></div></div>
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
