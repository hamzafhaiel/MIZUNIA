import { Activity, Cloud, CloudRain, Droplet, ExternalLink, Fuel, Gauge, Moon, Route, Sun, Waves, Zap } from 'lucide-react'
import { Badge, Chart } from './components.tsx'
import { TankGauge } from './TankGauge.tsx'
import { ValveHandle } from './ValveStation.tsx'
import { PilotControl } from './KizunaPilotPanel.tsx'
import type { KizunaPilot } from './kizuna-pilot.ts'
import type { useKizuna } from './useKizuna.ts'
import { pilotPumpBlock } from './kizuna-pilot.ts'
import {
  estimateKizunaPressure, kizunaAvailable, kizunaBackupFlow,
  kizunaBasinFlow, kizunaVolume, KIZUNA_CAPACITY_M3, KIZUNA_CISTERNS, KIZUNA_DIAMETER_M,
} from './kizuna-model.ts'
import type { KizunaAction, KizunaBasin, KizunaHistory, KizunaState, KizunaWeather, PressureTest, WeatherName } from './kizuna-model.ts'
import './kizuna-panels.css'

const number = new Intl.NumberFormat('fr-TN', { maximumFractionDigits: 2 })
const value = (reading: number | null | undefined, unit: string) => reading == null ? '—' : number.format(reading) + ' ' + unit
const basinName = (id: number) => 'Bassin ' + id
const weatherOptions = [
  { id: 'sun', label: 'Ensoleillé', Icon: Sun }, { id: 'clouds', label: 'Nuageux', Icon: Cloud },
  { id: 'rain', label: 'Pluie', Icon: CloudRain }, { id: 'night', label: 'Nuit', Icon: Moon },
] as const

type Source = 'kizuna' | 'wokwi'
type Shared = {
  source: Source; state: KizunaState | null; weather: KizunaWeather; pressureTest: PressureTest;
  openings?: Record<number, number>; pending: boolean; onCommand: (action: KizunaAction, id: number) => void;
}
type PanelProps = Shared & {
  section: 'simulation' | 'reserves' | 'vannes' | 'energie'; routeId?: string; history: KizunaHistory;
  weatherName: WeatherName; onWeather: (weather: WeatherName) => void; onPressureTest: (test: PressureTest) => void;
  onOpening: (id: number, value: number) => void; automatic: boolean; onAutomatic: (enabled: boolean) => void;
  onDistance: (id: number, distance: number) => void; sceneHref?: string;
  pilot: KizunaPilot | null; pilotControls: ReturnType<typeof useKizuna>['pilotControls'];
  generator: ReturnType<typeof useKizuna>['generator']; onGenerator: (running: boolean) => void;
}

export function KizunaPageLink({ href }: { href: string }) {
  return <a className="button primary" href={href} target="_blank" rel="noopener">
    Ouvrir la simulation 3D <ExternalLink size={16} aria-hidden="true" />
  </a>
}

function KizunaPageCard({ href }: { href: string }) {
  return <section className="panel kz-panel kz-page-card" aria-labelledby="kz-scene-title">
    <header><h2 id="kz-scene-title">Maquette hydraulique KIZUNA</h2><KizunaPageLink href={href} /></header>
  </section>
}

function Weather({ props }: { props: PanelProps }) {
  const { source, state, weather, weatherName, pending, onWeather, onCommand } = props
  return <section className="panel kz-panel" aria-labelledby="kz-weather">
    <h2 id="kz-weather"><Sun size={19} /> Météo et ensoleillement</h2>
    {source === 'kizuna' ? <div className="kz-weather-options" aria-label="Météo de la simulation">
      {weatherOptions.map(({ id, label, Icon }) => <button type="button" className="button secondary" key={id} aria-pressed={weatherName === id} onClick={() => onWeather(id)}><Icon size={17} /> {label}</button>)}
    </div> : <button type="button" className="button secondary" disabled={!state || pending || state.basins.some(basin => basin.rainOn)} onClick={() => onCommand('start_rain', 1)}><CloudRain size={17} /> Lancer la pluie Wokwi</button>}
    <dl className="kz-stats"><Stat label={source === 'wokwi' ? 'Température ESP32' : 'Température'} reading={value(state?.temperatureC, '°C')} />
      <Stat label="Irradiance simulée" reading={state ? value(weather.irradiance, 'W/m²') : '—'} />
      <Stat label="Pluie simulée" reading={state ? value(weather.rain, 'mm/h') : '—'} /></dl>
  </section>
}

function Stat({ label, reading }: { label: string; reading: string }) {
  return <div><dt>{label}</dt><dd>{reading}</dd></div>
}

function Reservoirs({ state, history, full }: { state: KizunaState | null; history: KizunaHistory; full: boolean }) {
  const measured = state?.basins.filter(basin => basin.levelPct !== null) ?? []
  const total = measured.length ? measured.reduce((sum, basin) => sum + (kizunaVolume(basin) ?? 0), 0) : null
  const usable = measured.length ? measured.reduce((sum, basin) => sum + (kizunaAvailable(basin) ?? 0), 0) : null
  const protectedWater = total === null || usable === null ? null : total - usable
  return <section className="panel kz-panel" aria-labelledby="kz-reservoirs">
    <h2 id="kz-reservoirs"><Droplet size={19} /> Réservoirs KIZUNA</h2>
    <dl className="kz-stats"><Stat label="Eau mesurée" reading={value(total, 'm³')} /><Stat label="Eau disponible" reading={value(usable, 'm³')} /><Stat label="Eau protégée" reading={value(protectedWater, 'm³')} /></dl>
    <div className="kz-basin-grid">{KIZUNA_CISTERNS.map((id, index) => {
      const basin = state?.basins[index]
      return <div className="kz-tank" key={id}>
        <TankGauge label={basinName(index + 1)} volume={basin ? kizunaVolume(basin) : null} max={KIZUNA_CAPACITY_M3} />
        <a href={'#/reserves/' + id}>{id}</a>
        <small>{basin ? 'Seuil de réserve ' + basin.minLevelPct + ' %' : 'Relevé en attente'} · Ø {number.format(KIZUNA_DIAMETER_M)} m</small>
      </div>
    })}</div>
    {full && state && history.length > 1 && <details className="kz-history">
      <summary>Historique de remplissage de la session</summary>
      <div className="kz-basin-grid">{KIZUNA_CISTERNS.map((id, index) => {
        const known = history.filter(reading => reading.levels[index] != null)
        if (known.length < 2) return null
        return <div key={id}><strong>{basinName(index + 1)}</strong><Chart values={known.map(reading => reading.levels[index]!)} times={known.map(reading => reading.at)}
          timeBounds={[known[0].at, known.at(-1)!.at]} unit="%" language="fr" color="teal" /></div>
      })}</div>
    </details>}
  </section>
}

function pumpMode(basin: KizunaBasin) {
  return basin.irrigationMode === 'drip' ? 'Goutte-à-goutte' : 'Aspersion'
}

function Pumps({ props }: { props: PanelProps }) {
  const { state, pending, source, openings, onCommand, onDistance, pilot, pilotControls } = props
  const raining = state?.basins.some(basin => basin.rainOn)
  return <section className="panel kz-panel" aria-labelledby="kz-pumps">
    <h2 id="kz-pumps"><Gauge size={19} /> Pompage</h2>
    <dl className="kz-stats">
      <Stat label="Pompes d’arrosage actives" reading={state ? String(state.basins.filter(basin => basin.pumpOn).length) + ' / 3' : '—'} />
      <Stat label="Charge des pompes" reading={value(state?.pumpLoadW, 'W')} />
      <Stat label="Humidité du sol" reading={value(state?.soilMoisturePct, '%')} />
    </dl>
    <div className="kz-basin-grid">{state?.basins.map(basin => {
      const selectable = !pending && !raining && state.backupBasin !== basin.id
      const aboveReserve = basin.levelPct !== null && basin.levelPct > basin.minLevelPct
      const canStart = source === 'kizuna' || basin.mode === 'manual' || basin.phase === 'outage'
      const agentDistributing = pilot?.automatic && pilot.outageAt !== null && pilot.clock >= pilot.outageAt
      const pumpBlock = pilot && pilotPumpBlock(pilot, basin.id, basin.id)
      return <article className="kz-equipment" key={basin.id}>
        <header><h3>{basinName(basin.id)}</h3><Badge tone={basin.pumpOn ? 'teal' : 'neutral'}>{basin.pumpOn ? 'En marche' : 'À l’arrêt'}</Badge></header>
        <dl className="kz-equipment-data">
          <Stat label="Arrosage" reading={pumpMode(basin)} />
          <Stat label="Débit" reading={source === 'kizuna' ? value(kizunaBasinFlow(basin, openings?.[basin.id]), 'm³/h') : 'Non transmis'} />
          <Stat label="Capteur de niveau" reading={value(basin.distanceCm, 'cm')} />
        </dl>
        <div className="kz-actions">
          <button type="button" className={'button ' + (basin.pumpOn ? 'secondary' : 'primary')}
            disabled={pending || (!basin.pumpOn && (!selectable || !aboveReserve || !canStart || Boolean(agentDistributing || pumpBlock)))}
            onClick={() => onCommand(basin.pumpOn ? 'stop_pump' : 'start_pump', basin.id)} aria-label={(basin.pumpOn ? 'Arrêter' : 'Démarrer') + ' la pompe du bassin ' + basin.id}>
            {basin.pumpOn ? 'Arrêter' : 'Démarrer'}
          </button>
          <button type="button" className="button secondary" disabled={pending} onClick={() => onCommand(basin.irrigationMode === 'drip' ? 'set_sprinkler' : 'set_drip', basin.id)}>{basin.irrigationMode === 'drip' ? 'Aspersion' : 'Goutte-à-goutte'}</button>
        </div>
        <details>
          <summary>Capteur et inspection</summary>
          <div className="kz-actions">
            <button type="button" className="button secondary" disabled={!selectable} onClick={() => onCommand('set_manual', basin.id)}>Mode capteur</button>
            <button type="button" className="button secondary" disabled={!selectable} onClick={() => onCommand('reset', basin.id)}>Réinitialiser</button>
            <button type="button" className="button secondary" disabled={pending} onClick={() => onCommand(basin.masonryInspection ? 'clear_masonry_inspection' : 'request_masonry_inspection', basin.id)}>{basin.masonryInspection ? 'Clôturer l’inspection' : 'Demander une inspection'}</button>
            {pilot && <button type="button" className="button secondary" onClick={() => pilotControls.sensor(basin.id)}>{basin.levelPct === null ? 'Rétablir le capteur' : 'Simuler une panne du capteur'}</button>}
          </div>
          {source === 'kizuna' && basin.mode === 'manual' && basin.levelPct !== null && <label className="kz-distance">Distance simulée · {value(basin.distanceCm, 'cm')}
            <input type="range" min={10} max={70} step={0.1} value={basin.distanceCm ?? 70} onChange={event => onDistance(basin.id, event.currentTarget.valueAsNumber)} />
          </label>}
        </details>
      </article>
    })}</div>
    {!state && <p>En attente de mesures pour afficher les pompes.</p>}
  </section>
}

function Circuits({ props }: { props: PanelProps }) {
  const { state, source, pending, openings, pressureTest, onPressureTest, onCommand, pilot } = props
  const agentControlsBackup = pilot?.automatic && pilot.outageAt !== null
  const active = state?.backupBasin ?? 0
  const simulatedFlow = state && source === 'kizuna' ? kizunaBackupFlow(state, openings?.[active]) : null
  const leak = active ? Boolean(state?.backupLeak) : pressureTest === 'leak'
  const outletFlow = simulatedFlow === null ? null : simulatedFlow / (leak ? 1.75 : 1)
  const testFlow = active ? outletFlow : pressureTest ? 4.32 : null
  const pressure = testFlow === null ? null : estimateKizunaPressure(testFlow, leak)
  return <section className="panel kz-panel" aria-labelledby="kz-circuits">
    <h2 id="kz-circuits"><Route size={19} /> Circuits et tests de conduite</h2>
    <div className="kz-circuit-path"><span>Réservoirs</span><i /><span>Pompe de secours</span><i /><span>Habitations</span></div>
    <dl className="kz-stats"><Stat label="Alimentation de secours" reading={state ? active ? basinName(active) : 'À l’arrêt' : '—'} />
      <Stat label="Débit de secours simulé" reading={source === 'kizuna' ? value(simulatedFlow, 'm³/h') : 'Non transmis'} />
      <Stat label="Fuite de secours" reading={state ? state.backupLeak ? 'Simulée' : 'Inactive' : '—'} /></dl>
    {state && <div className="kz-actions">
      {agentControlsBackup ? <small>La pompe de secours suit le scénario SONEDE.</small>
        : active ? <button className="button primary" type="button" disabled={pending} onClick={() => onCommand('stop_backup', active)}>Arrêter le secours</button>
        : state.basins.map(basin => <button className="button secondary" key={basin.id} type="button" disabled={pending || basin.pumpOn || basin.levelPct === null || basin.levelPct <= basin.minLevelPct || state.basins.some(item => item.rainOn) || Boolean(pilot && pilotPumpBlock(pilot, 0, basin.id))} onClick={() => onCommand('start_backup', basin.id)}>Secours via le bassin {basin.id}</button>)}
      <button className="button secondary" type="button" disabled={pending} onClick={() => onCommand(state.backupLeak ? 'clear_backup_leak' : 'enable_backup_leak', active || 1)}>{state.backupLeak ? 'Colmater la fuite' : 'Simuler une fuite sur le secours'}</button>
    </div>}
    <div className="kz-diagnostics">
      <h3>Test de pression simulé · 100 m</h3>
      {!active && <div className="kz-actions">
        <button className="button secondary" type="button" aria-pressed={pressureTest === 'normal'} onClick={() => onPressureTest('normal')}>Conduite normale</button>
        <button className="button secondary" type="button" aria-pressed={pressureTest === 'leak'} onClick={() => onPressureTest('leak')}>Conduite avec fuite</button>
        {pressureTest && <button className="button secondary" type="button" onClick={() => onPressureTest(null)}>Terminer le test</button>}
      </div>}
      {pressure ? <dl className="kz-stats">
        <Stat label="Pression en entrée A" reading={value(pressure.inletBar, 'bar')} /><Stat label="Pression en sortie B" reading={value(pressure.outletBar, 'bar')} />
        <Stat label="Diagnostic" reading={testFlow === 0 ? 'Sans débit' : pressure.suspectedLeak ? 'Fuite suspectée' : 'Pression normale'} />
      </dl> : active > 0 && source === 'wokwi' ? <p>Le firmware Wokwi ne publie pas la pression de cette conduite.</p> : null}
    </div>
  </section>
}

function Valves({ props }: { props: PanelProps }) {
  const { state, source, automatic, onAutomatic, openings, onOpening } = props
  if (source === 'wokwi') return <section className="panel kz-panel"><h2><Route size={19} /> Commandes du réseau Wokwi</h2><p>Le firmware commande les pompes et les circuits d’arrosage. Les positions des vannes sont disponibles dans KIZUNA local.</p></section>
  return <section className="panel kz-panel" aria-labelledby="kz-valves">
    <h2 id="kz-valves"><Route size={19} /> Station de vannes</h2>
    <div className="segmented" role="group" aria-label="Mode de pilotage">
      <button type="button" aria-pressed={!automatic} onClick={() => onAutomatic(false)}>Manuel</button>
      <button type="button" aria-pressed={automatic} onClick={() => onAutomatic(true)}>Agent automatique</button>
    </div>
    <p id="valve-instruction">{automatic ? 'Les vannes suivent les décisions de l’agent et se referment à l’approche de la réserve.' : 'Faites pivoter chaque poignée ou utilisez les flèches du clavier. Le débit commence lorsque la pompe est en marche.'}</p>
    <div className="kz-basin-grid">{state?.basins.map(basin => {
      const opening = openings?.[basin.id] ?? 0
      const flow = state.backupBasin === basin.id ? kizunaBackupFlow(state, opening) : kizunaBasinFlow(basin, opening)
      return <article className="kz-equipment" key={basin.id} data-valve-flow={flow > 0}>
        <h3>{basinName(basin.id)} · distribution</h3>
        <ValveHandle label={basinName(basin.id)} opening={opening} disabled={automatic} onAdjust={next => onOpening(basin.id, next)} />
        <dl className="kz-equipment-data"><Stat label="Ouverture" reading={value(opening, '%')} /><Stat label="Débit simulé" reading={value(flow, 'm³/h')} /></dl>
      </article>
    })}</div>
    <small>Une seconde réelle représente 15 minutes simulées pour les débits.</small>
  </section>
}

function GeneratorPanel({ generator, onGenerator }: Pick<PanelProps, 'generator' | 'onGenerator'>) {
  return <section className="panel kz-panel" aria-labelledby="kz-generator">
    <h2 id="kz-generator"><Fuel size={19} /> Groupe électrogène</h2>
    <p>{generator.running ? 'En marche' : generator.fuelInTank === 0 ? 'Réservoir vide' : 'À l’arrêt'}</p>
    <dl className="kz-stats">
      <Stat label="Carburant restant" reading={value(generator.fuelInTank, 'L')} />
      <Stat label="Autonomie moteur" reading={value(generator.runtime, 'h')} />
      <Stat label="Puissance fournie aux pompes" reading={value(generator.suppliedW, 'W')} />
    </dl>
    <div className="kz-actions">
      <button className="button primary" type="button" disabled={!generator.running && !generator.canStart}
        onClick={() => onGenerator(!generator.running)}>{generator.running ? 'Arrêter le groupe électrogène' : 'Démarrer le groupe électrogène'}</button>
      <a className="button secondary" href="#/reserves">Régler le carburant et la puissance dans Réserves</a>
    </div>
    <small>Le groupe complète le solaire. En marche, il consomme du carburant au rythme saisi dans Réserves.</small>
  </section>
}

function Solar({ state, weather, source, generator }: PanelProps) {
  const supplied = generator.suppliedW
  const deficit = state ? Math.max(0, state.pumpLoadW - weather.watts - supplied) : 0
  return <section className="panel kz-panel" aria-labelledby="kz-solar">
    <h2 id="kz-solar"><Zap size={19} /> Production solaire et alimentation</h2>
    <dl className="kz-stats">
      <Stat label="Panneaux · puissance nominale" reading={value(state?.solarNominalW, 'Wc')} />
      <Stat label="Production solaire estimée" reading={state ? value(weather.watts, 'W') : '—'} />
      <Stat label="Consommation des pompes" reading={value(state?.pumpLoadW, 'W')} />
      {source === 'kizuna' && <Stat label="Groupe électrogène · puissance fournie" reading={value(supplied, 'W')} />}
    </dl>
    {state && <><div className="kz-circuit-path"><span>Panneaux solaires</span><i /><span>Distribution électrique</span><i /><span>Pompes</span></div>
      <p>{deficit === 0 ? 'La production estimée couvre la charge actuelle.' : 'Puissance complémentaire estimée de ' + value(deficit, 'W') + '.'}</p></>}
  </section>
}

export function KizunaPanels(props: PanelProps) {
  const { section, routeId, state, history, sceneHref, pilot, pilotControls } = props
  const scene = sceneHref && <KizunaPageCard href={sceneHref} />
  if (section === 'reserves') return <div className="kz-stack">{scene}<Reservoirs state={state} history={history} full /></div>
  if (section === 'simulation') return <div className="kz-stack">
    <h1>Simulation KIZUNA</h1>
    {scene}<Weather props={props} />
    {pilot && <GeneratorPanel {...props} />}
    {pilot && <PilotControl pilot={pilot} controls={pilotControls} maintenance />}
    <Reservoirs state={state} history={history} full={false} /><Pumps props={props} /><Circuits props={props} />
  </div>
  if (section === 'vannes') return <div className="kz-stack"><h1>Vannes KIZUNA</h1><Valves props={props} />
    {pilot && <PilotControl pilot={pilot} controls={pilotControls} />}<Pumps props={props} /><Circuits props={props} /></div>
  return <div className="kz-stack">
    <h1>Énergie KIZUNA</h1>
    <nav className="kz-actions" aria-label="Vues énergie">
      <a className="button secondary" href="#/energie" aria-current={!routeId ? 'page' : undefined}><Sun size={16} /> Solaire</a>
      <a className="button secondary" href="#/energie/pompes" aria-current={routeId === 'pompes' ? 'page' : undefined}><Waves size={16} /> Pompes</a>
      <a className="button secondary" href="#/energie/circuits" aria-current={routeId === 'circuits' ? 'page' : undefined}><Activity size={16} /> Circuits</a>
    </nav>
    {routeId === 'pompes' ? <Pumps props={props} /> : routeId === 'circuits' ? <Circuits props={props} /> : <Solar {...props} />}
  </div>
}
