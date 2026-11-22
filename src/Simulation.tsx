import { Activity, ArrowDown, ChartNoAxesCombined, Cloud, CloudRain, Droplet, Gauge, Layers3, Route, Sun } from 'lucide-react'
import { useState } from 'react'
import type { ReactNode } from 'react'
import { Chart } from './components.tsx'
import { historyWindow, ranges } from './history.ts'
import type { RangeId } from './history.ts'
import { lowReserve } from './model.ts'
import type { DashboardState } from './model.ts'
import { annex } from './twin/config.ts'
import type { Mode, Weather } from './twin/config.ts'
import { SimulationDiagnostics } from './SimulationDiagnostics.tsx'
import type { SimulationResult, SimulationTest } from './SimulationDiagnostics.tsx'
import { TankGauge } from './TankGauge.tsx'
import './simulation.css'

const weatherOptions = [
  { id: 'sunny', label: 'Soleil', icon: Sun },
  { id: 'rain', label: 'Pluie', icon: CloudRain },
  { id: 'cloudy', label: 'Nuages', icon: Cloud },
] as const

const views = [
  { id: 'neighborhood', label: 'Vue générale' },
  { id: 'inspection', label: 'Sources d’eau' },
  { id: 'cutaway', label: 'Canalisations' },
] as const

const volumeFormat = new Intl.NumberFormat('fr-TN', { maximumFractionDigits: 1 })

type VolumeSeries = { values: number[]; times: number[] }

interface SimulationProps {
  twin: ReactNode
  weather: Weather
  mode: Mode
  stored: number
  capacity: number
  annexVolume: number
  onWeather: (weather: Weather) => void
  onMode: (mode: Mode) => void
  onCentral: (volume: number) => void
  onAnnex: (volume: number) => void
  onTest: (test: SimulationTest) => void
  results: SimulationResult[]
  sensors: DashboardState['sensors']
  irrigationFlow: number
  transferFlow: number
  centralSeries: VolumeSeries
  annexSeries: VolumeSeries
  available: number | null
  demand: number
}

const sections = [
  { id: 'sim-reservoirs', label: 'Réservoirs', icon: Droplet },
  { id: 'sim-pumping', label: 'Pompage', icon: Gauge },
]

export function Simulation({ twin, weather, mode, stored, capacity, annexVolume, onWeather, onMode, onCentral, onAnnex, onTest, results, sensors, irrigationFlow, transferFlow, centralSeries, annexSeries, available, demand }: SimulationProps) {
  return <section className="section-workspace simulation-workspace" lang="fr" aria-labelledby="simulation-title">
    <header className="overview-title">
      <div><p>Parc Hydraulique · Borj Râs</p><h1 id="simulation-title">Simulation hydraulique</h1></div>
      <div className="simulation-section-links" role="group" aria-label="Sections de la simulation">
        {sections.map(({ id, label, icon: Icon }) => <button key={id} className="button secondary" type="button" onClick={() => {
          const target = document.getElementById(id)
          target?.focus({ preventScroll: true })
          target?.scrollIntoView({ block: 'start' })
        }}><Icon size={15} />{label}<ArrowDown size={13} /></button>)}
        <a className="button secondary" href="#/vannes"><Route size={15} /> Station de vannes</a>
      </div>
    </header>
    <section className="simulation-section" aria-labelledby="sim-reservoirs">
      <h2 id="sim-reservoirs" className="simulation-section-title" tabIndex={-1}><Droplet size={20} /> Réservoirs</h2>
      <div className="simulation-grid">
      <section className="panel simulation-model" aria-labelledby="sim-model-title">
        <header><h2 id="sim-model-title"><Layers3 size={18} /> Modèle hydraulique</h2><span className="simulation-model-state"><i /> {weather === 'rain' ? 'Apport de pluie' : views.find(view => view.id === mode)?.label}</span></header>
        <div className="simulation-scene" lang="en">{twin}</div>
        <div className="simulation-camera">
          <h3 id="sim-view">Position de la caméra</h3>
          <div className="simulation-views" role="group" aria-labelledby="sim-view">
            {views.map(({ id, label }) => <button key={id} type="button" aria-pressed={mode === id} onClick={() => onMode(id)}>
              <span className="simulation-view-preview" data-view={id} aria-hidden="true"><i /><i /><i /></span>
              <span>{label}</span>
            </button>)}
          </div>
        </div>
      </section>
      <div className="simulation-controls">
        <section className="panel simulation-card" aria-labelledby="sim-weather">
          <h2 id="sim-weather"><Cloud size={18} /> Météo</h2>
          <div className="simulation-weather">
            {weatherOptions.map(({ id, label, icon: Icon }) => <button key={id} type="button" aria-pressed={weather === id} onClick={() => onWeather(id)}>
              <Icon size={21} /><span>{label}</span>
            </button>)}
          </div>
          <p>La pluie alimente les deux réservoirs tant qu’elle est active.</p>
        </section>
        <section className="panel simulation-card" aria-labelledby="sim-levels">
          <h2 id="sim-levels"><Droplet size={18} /> Niveau des réservoirs</h2>
          <div className="simulation-tanks">
            <TankGauge label="Citerne centrale" volume={stored} max={capacity} />
            <TankGauge label="Réservoir annexe" volume={annexVolume} max={annex.capacity} />
          </div>
          <details className="simulation-adjust">
            <summary>Régler les volumes</summary>
            <VolumeInput id="sim-central" label="Citerne centrale" max={capacity} onChange={onCentral} />
            <VolumeInput id="sim-annex" label="Réservoir annexe" max={annex.capacity} onChange={onAnnex} />
          </details>
        </section>
        <section className="panel simulation-card simulation-balance" aria-labelledby="sim-balance">
          <h2 id="sim-balance"><Activity size={18} /> Disponibilité de l’eau</h2>
          <dl>
            <div><dt>Stock total</dt><dd>{volumeFormat.format(stored + annexVolume)} <small>m³</small></dd></div>
            <div><dt>Eau disponible pour l’arrosage</dt><dd>{available === null ? '—' : volumeFormat.format(available) + ' m³'}</dd></div>
            <div><dt>Réserve conservée · citerne centrale</dt><dd>{available === null ? '—' : volumeFormat.format(stored - available) + ' m³'}</dd></div>
            <div><dt>Cycles possibles</dt><dd>{available === null ? '—' : Math.floor(available / demand)}</dd></div>
          </dl>
          <p>{available === null ? 'La vérification de la réserve centrale est expirée.' : 'Chaque cycle utilise ' + volumeFormat.format(demand) + ' m³ de la réserve centrale.'}</p>
        </section>
      </div>
      <ReservoirHistory central={centralSeries} supplemental={annexSeries} />
      </div>
    </section>
    <section className="simulation-section" aria-labelledby="sim-pumping">
      <div className="simulation-section-heading">
        <h2 id="sim-pumping" className="simulation-section-title" tabIndex={-1}><Gauge size={20} /> Pompage</h2>
        <a className="button secondary" href="#/energie/pompes">Suivi des pompes</a>
      </div>
      <PumpingReadout sensors={sensors} irrigationFlow={irrigationFlow} transferFlow={transferFlow} />
      <SimulationDiagnostics results={results} onTest={onTest} connectedSensors={sensors.filter(sensor => sensor.online).length} sensorCount={sensors.length} />
    </section>
  </section>
}

function PumpingReadout({ sensors, irrigationFlow, transferFlow }: { sensors: DashboardState['sensors']; irrigationFlow: number; transferFlow: number }) {
  const pressures = sensors.filter(sensor => sensor.online).map(sensor => sensor.pressure)
  const minimum = pressures.length ? Math.min(...pressures) : null
  return <section className="panel simulation-card pumping-readout" aria-labelledby="pump-readout">
    <h3 id="pump-readout">État du réseau de pompage</h3>
    <div className="pumping-grid">
      <div className="pumping-tile">
        <h4>État des pompes</h4>
        <dl className="pumping-pumps">
          <div><dt>Pompe d’arrosage</dt><dd data-running={irrigationFlow > 0}>{irrigationFlow > 0 ? 'En marche' : 'À l’arrêt'}</dd></div>
          <div><dt>Pompe de transfert</dt><dd data-running={transferFlow > 0}>{transferFlow > 0 ? 'En marche' : 'À l’arrêt'}</dd></div>
        </dl>
      </div>
      <div className="pumping-tile">
        <h4>Débit d’arrosage</h4>
        <strong>{volumeFormat.format(irrigationFlow)} <small>m³/h</small></strong>
        <p>Transfert vers l’annexe · {volumeFormat.format(transferFlow)} m³/h</p>
      </div>
      <div className="pumping-tile">
        <h4>Pression minimale à l’entrée</h4>
        <strong>{minimum === null ? '—' : volumeFormat.format(minimum) + ' bar'}</strong>
        <ul>{sensors.map(sensor => <li key={sensor.id}>{sensor.id} <span>{sensor.online ? volumeFormat.format(sensor.pressure) + ' bar' : 'Hors ligne'}</span></li>)}</ul>
      </div>
    </div>
  </section>
}

const historyLabels = { '15m': '15 min', '1h': '1 h', all: 'Complet' }

function ReservoirHistory({ central, supplemental }: { central: VolumeSeries; supplemental: VolumeSeries }) {
  const [basin, setBasin] = useState<'central' | 'annex'>('central')
  const [range, setRange] = useState<RangeId>('all')
  const selected = basin === 'central' ? central : supplemental
  const series = historyWindow(selected.values, selected.times, range)
  const values = series.readings.map(reading => reading.value)
  const first = values[0]
  const last = values.at(-1)
  const change = first === undefined || last === undefined ? 0 : Math.round((last - first) * 10) / 10
  return <section className="panel simulation-card simulation-history-panel" aria-labelledby="sim-history">
    <header>
      <div><h2 id="sim-history"><ChartNoAxesCombined size={18} /> Historique des réservoirs</h2><p>Volumes enregistrés pendant la simulation.</p></div>
      <div className="segmented" role="group" aria-label="Réservoir du graphique">
        <button type="button" aria-pressed={basin === 'central'} onClick={() => setBasin('central')}>Citerne centrale</button>
        <button type="button" aria-pressed={basin === 'annex'} onClick={() => setBasin('annex')}>Réservoir annexe</button>
      </div>
    </header>
    <div className="simulation-chart-summary">
      <strong>{change > 0 ? '+' : ''}{volumeFormat.format(change)} m³ <small>sur la période</small></strong>
      <div className="segmented" role="group" aria-label="Période du graphique">
        {ranges.map(item => <button key={item.id} type="button" aria-pressed={range === item.id} onClick={() => setRange(item.id)}>{historyLabels[item.id]}</button>)}
      </div>
    </div>
    {values.length > 0 ? <Chart key={basin + range} values={values} times={series.readings.map(reading => reading.at)} timeBounds={[series.start, series.end]}
      unit="m³" threshold={basin === 'central' ? lowReserve : undefined} language="fr" /> : <p>Aucun relevé pour cette période.</p>}
    {basin === 'central' && <div className="chart-key"><i /> Seuil de réserve basse · {lowReserve} m³</div>}
  </section>
}

function VolumeInput({ id, label, max, onChange }: { id: string; label: string; max: number; onChange: (volume: number) => void }) {
  return <form className="simulation-volume-form" onSubmit={event => {
    event.preventDefault()
    const form = event.currentTarget
    onChange(Number(new FormData(form).get('volume')))
    form.reset()
  }}>
    <label htmlFor={id}>{label} (m³)</label>
    <input id={id} name="volume" type="number" min={0} max={max} step={0.1} required />
    <button type="submit">Appliquer</button>
  </form>
}
