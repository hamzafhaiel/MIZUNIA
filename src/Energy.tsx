import { Activity, ArrowRight, ArrowUpRight, Droplet, Gauge, LayoutGrid, Route, Sun, Waves, Zap } from 'lucide-react'
import { useState } from 'react'
import type { CSSProperties } from 'react'
import type { DashboardState } from './model.ts'
import type { Weather } from './twin/config.ts'
import { stationLines } from './valves.ts'
import type { ValveId } from './valves.ts'
import './energy.css'

const number = new Intl.NumberFormat('fr-TN', { maximumFractionDigits: 2 })
const solar = [
  { id: 'PV-01', name: 'Toiture de la station', panels: 8 },
  { id: 'PV-02', name: 'Abri de la citerne', panels: 6 },
  { id: 'PV-03', name: 'Secteur du jardin', panels: 4 },
] as const
const weatherFactors = { sunny: { factor: 1, label: 'Ensoleillé' }, cloudy: { factor: .45, label: 'Nuageux' }, rain: { factor: .2, label: 'Pluie' } }
const profile = [.04, .24, .65, .94, 1, .67, .27, .04]
const moduleCapacity = .45

interface EnergyProps {
  initialView: 'solar' | 'pumps' | 'circuits'
  weather: Weather
  flows: Record<ValveId, number>
  wateringTest: boolean
  sensors: DashboardState['sensors']
  stopped: boolean
}

export function Energy({ initialView, weather, flows, wateringTest, sensors, stopped }: EnergyProps) {
  const [view, setView] = useState(initialView)
  const [selectedSolar, setSelectedSolar] = useState(0)
  const [selectedPump, setSelectedPump] = useState(0)
  const weatherNow = weatherFactors[weather]
  const panels = solar.map(panel => {
    const capacity = panel.panels * moduleCapacity
    const power = capacity * weatherNow.factor
    const projection = profile.reduce((sum, value, index) => index ? sum + (value + profile[index - 1]) * .75 * power : sum, 0)
    return { ...panel, capacity, power, projection }
  })
  const units = [
    { id: 'PMP-01', name: 'Pompe d’arrosage', route: 'Citerne centrale → Jardin', rate: flows.irrigation, max: 6, nominalPower: 1.5 },
    { id: 'PMP-02', name: 'Pompe de transfert', route: 'Citerne centrale → Réservoir annexe', rate: flows.transfer, max: 12, nominalPower: 2.2 },
  ].map(pump => ({ ...pump,
    power: pump.nominalPower * pump.rate / pump.max,
    status: stopped ? 'Isolée' : pump.rate > 0 ? 'En marche' : 'À l’arrêt',
  }))
  const totalPV = panels.reduce((sum, panel) => sum + panel.power, 0)
  const totalDemand = units.reduce((sum, pump) => sum + pump.power, 0)
  const panel = panels[selectedSolar]
  const pump = units[selectedPump]
  const pressures = sensors.filter(sensor => sensor.online).map(sensor => sensor.pressure)
  const solarView = view === 'solar'
  const solarImage = import.meta.env.BASE_URL + 'energy-solar.png'
  const pumpImage = import.meta.env.BASE_URL + 'energy-pump.png'
  const image = solarView ? solarImage : pumpImage

  return <section className="energy-page" lang="fr" aria-labelledby="energy-title">
    <header className="energy-heading">
      <div><p>Parc Hydraulique · Borj Râs</p><h1 id="energy-title">Énergie et pompage</h1></div>
      <div className="segmented" role="group" aria-label="Équipements affichés">
        <button type="button" aria-pressed={solarView} onClick={() => setView('solar')}><Sun size={15} /> Parc solaire</button>
        <button type="button" aria-pressed={view === 'pumps'} onClick={() => setView('pumps')}><Waves size={15} /> Pompes</button>
        <button type="button" aria-pressed={view === 'circuits'} onClick={() => setView('circuits')}><Route size={15} /> Circuits</button>
      </div>
    </header>
    {view === 'circuits' ? <EnergyCircuits panels={panels} pumps={units} totalPV={totalPV} totalDemand={totalDemand}
      flows={flows} wateringTest={wateringTest} stopped={stopped} /> : <div className="energy-grid">
      <section className="panel energy-card energy-monitor" aria-labelledby="energy-monitor">
        <header><div><h2 id="energy-monitor">{solarView ? 'Suivi des panneaux solaires' : 'Suivi des pompes'}</h2><p>{solarView ? panel.name : pump.route}</p></div>
          <span className="energy-state" data-active={solarView || pump.rate > 0}>{solarView ? weatherNow.label : pump.status}</span>
        </header>
        <div className="energy-monitor-body">
          <dl className="energy-metrics">
            <div><dt>{solarView ? 'Puissance installée' : 'Débit simulé'}</dt><dd>{number.format(solarView ? panel.capacity : pump.rate)} <small>{solarView ? 'kWc' : 'm³/h'}</small></dd></div>
            <div><dt>{solarView ? 'Projection journalière' : 'Débit nominal'}</dt><dd>{number.format(solarView ? panel.projection : pump.max)} <small>{solarView ? 'kWh' : 'm³/h'}</small></dd></div>
            <div className="energy-metric-primary"><dt><Zap size={15} /> {solarView ? 'Puissance solaire estimée' : 'Puissance absorbée estimée'}</dt>
              <dd>{number.format(solarView ? panel.power : pump.power)} <small>kW</small></dd>
            </div>
          </dl>
          <figure className="energy-equipment" data-equipment={view}>
            <img src={image} alt="" />
            <figcaption><span>{solarView ? panel.id : pump.id}</span><strong>{solarView ? panel.panels + ' panneaux' : pump.name}</strong></figcaption>
          </figure>
        </div>
      </section>
      <section className="panel energy-card energy-points" aria-labelledby="energy-points">
        <header><div><h2 id="energy-points">{solarView ? 'Points solaires' : 'Pompes du réseau'}</h2><p>{solarView ? panels.length : units.length} équipements simulés</p></div><LayoutGrid size={17} /></header>
        <ul>
          {solarView ? panels.map((item, index) => <li key={item.id}>
            <button type="button" aria-pressed={index === selectedSolar} onClick={() => setSelectedSolar(index)}>
              <img src={solarImage} alt="" /><span><strong>{item.name}</strong><small>{item.id} · {item.panels} panneaux</small></span><b>{number.format(item.power)} kW</b>
            </button>
          </li>) : units.map((item, index) => <li key={item.id}>
            <button type="button" aria-pressed={index === selectedPump} onClick={() => setSelectedPump(index)}>
              <img src={pumpImage} alt="" /><span><strong>{item.name}</strong><small>{item.id} · {item.status}</small></span><b>{number.format(item.rate)} m³/h</b>
            </button>
          </li>)}
        </ul>
        <dl className="energy-fleet-total"><dt>{solarView ? 'Puissance solaire totale' : 'Puissance totale estimée'}</dt><dd>{number.format(solarView ? totalPV : totalDemand)} kW</dd></dl>
      </section>
      {solarView ? <SolarProfile power={panel.power} capacity={panel.capacity} /> : <section className="panel energy-card energy-chart" aria-labelledby="energy-flow">
        <header><div><h2 id="energy-flow">Débit des pompes</h2><p>Débits de la station et du test d’arrosage</p></div><Gauge size={18} /></header>
        <ul className="energy-flow">{units.map(item => <li key={item.id}>
          <div><span>{item.name}</span><strong>{number.format(item.rate)} / {item.max} m³/h</strong></div>
          <meter min={0} max={item.max} value={item.rate} aria-label={item.name} aria-valuetext={number.format(item.rate) + ' m³/h'} />
        </li>)}</ul>
        <p className="energy-note">La puissance des pompes est estimée proportionnellement au débit.</p>
      </section>}
      <section className="panel energy-card energy-balance" aria-labelledby="energy-balance">
        <header><h2 id="energy-balance">{solarView ? 'Puissance disponible' : 'Pression du réseau'}</h2><Activity size={18} /></header>
        {solarView ? <>
          <dl><div><dt>Solaire estimé</dt><dd>{number.format(totalPV)} kW</dd></div><div><dt>Pompes estimées</dt><dd>{number.format(totalDemand)} kW</dd></div><div><dt>{totalPV >= totalDemand ? 'Marge théorique' : 'Appoint théorique'}</dt><dd>{number.format(Math.abs(totalPV - totalDemand))} kW</dd></div></dl>
          <a href="#/reserves">Autonomie du groupe électrogène <ArrowUpRight size={15} /></a>
        </> : <>
          <dl><div><dt>Pression minimale à l’arrivée</dt><dd>{pressures.length ? number.format(Math.min(...pressures)) + ' bar' : '—'}</dd></div>
            {sensors.map(sensor => <div key={sensor.id}><dt>{sensor.id}</dt><dd>{sensor.online ? number.format(sensor.pressure) + ' bar' : 'Hors ligne'}</dd></div>)}</dl>
          <a href="#/vannes">Station de vannes <ArrowUpRight size={15} /></a>
        </>}
      </section>
    </div>}
  </section>
}

function EnergyCircuits({ panels, pumps, totalPV, totalDemand, flows, wateringTest, stopped }: {
  panels: { id: string; name: string; power: number }[]
  pumps: { id: string; name: string; power: number; status: string }[]
  totalPV: number
  totalDemand: number
  flows: Record<ValveId, number>
  wateringTest: boolean
  stopped: boolean
}) {
  const balance = totalPV - totalDemand
  return <div className="energy-circuits">
    <section className="panel energy-card circuit-card" aria-labelledby="electrical-title">
      <header><div><h2 id="electrical-title">Circuit électrique</h2><p>Schéma de principe · Production et demande estimées</p></div><Zap size={20} /></header>
      <div className="circuit-electrical">
        <div className="circuit-stage">
          <h3><Sun size={16} /> Production solaire</h3>
          <ul>{panels.map(panel => <li key={panel.id}><span>{panel.id} · {panel.name}</span><strong>{number.format(panel.power)} kW</strong></li>)}</ul>
        </div>
        <ArrowRight className="circuit-arrow" size={19} aria-hidden="true" />
        <div className="circuit-stage circuit-distribution">
          <h3><Zap size={16} /> Distribution</h3>
          <strong>{number.format(totalPV)} kW</strong>
          <span>{balance < 0 ? 'Appoint théorique' : 'Marge théorique'} · {number.format(Math.abs(balance))} kW</span>
          <a href="#/reserves">Groupe électrogène <ArrowUpRight size={14} /></a>
        </div>
        <ArrowRight className="circuit-arrow" size={19} aria-hidden="true" />
        <div className="circuit-stage">
          <h3><Waves size={16} /> Pompes</h3>
          <ul>{pumps.map(pump => <li key={pump.id}><span>{pump.name}<small>{pump.status}</small></span><strong>{number.format(pump.power)} kW</strong></li>)}</ul>
          <p className="circuit-total">Demande totale <strong>{number.format(totalDemand)} kW</strong></p>
        </div>
      </div>
    </section>
    <section className="panel energy-card circuit-card" aria-labelledby="hydraulic-title">
      <header><div><h2 id="hydraulic-title">Circuit hydraulique</h2><p>Trajet et débit de chaque ligne</p></div><a className="button secondary" href="#/vannes">Station de vannes <ArrowUpRight size={15} /></a></header>
      <ol className="circuit-hydraulic">
        {stationLines.map(line => {
          const rate = flows[line.id]
          return <li key={line.id} data-flowing={rate > 0}>
            <span className="circuit-endpoint"><Droplet size={15} /> {line.from}</span>
            <div className="circuit-pipe"><ArrowRight size={15} aria-hidden="true" /><div><strong>{line.label}</strong>
              <small>{stopped ? 'Isolée' : wateringTest && line.id === 'irrigation' ? 'Test d’arrosage' : rate > 0 ? 'En débit' : 'Sans débit'}</small></div>
              <b>{number.format(rate)} m³/h</b>
            </div>
            <span className="circuit-endpoint"><ArrowRight size={15} aria-hidden="true" /> {line.to}</span>
          </li>
        })}
      </ol>
    </section>
  </div>
}

function SolarProfile({ power, capacity }: { power: number; capacity: number }) {
  const times = ['07 h', '08 h 30', '10 h', '11 h 30', '13 h', '14 h 30', '16 h', '17 h 30']
  return <section className="panel energy-card energy-chart" aria-labelledby="energy-profile">
    <header><div><h2 id="energy-profile">Profil solaire journalier</h2><p>Projection à météo constante, en kW</p></div><Sun size={18} /></header>
    <ol className="energy-bars" aria-label="Puissance solaire estimée par heure">
      {profile.map((fraction, index) => <li key={times[index]} aria-label={times[index] + ' · ' + number.format(power * fraction) + ' kW'}>
        <div className="energy-bar-track" title={number.format(power * fraction) + ' kW'}><i style={{ '--bar-height': power * fraction / capacity * 100 + '%' } as CSSProperties} /></div>
        <span>{times[index]}</span>
      </li>)}
    </ol>
    <p className="energy-note">Profil de démonstration, module de 450 Wc. Les valeurs sont simulées.</p>
  </section>
}
