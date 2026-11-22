import { ArrowLeft, ArrowRight, CircleStop, Droplet, Gauge, Radio, Route } from 'lucide-react'
import { useRef } from 'react'
import type { CSSProperties, PointerEvent } from 'react'
import { stationLines, stationProfiles } from './valves.ts'
import type { advanceStation, StationControl, StationProfile, ValveId } from './valves.ts'
import './valve-station.css'

const number = new Intl.NumberFormat('fr-TN', { maximumFractionDigits: 2 })

interface StationProps {
  station: StationControl
  status: ReturnType<typeof advanceStation>
  profile: StationProfile | null
  central: number
  annexVolume: number
  onMode: (mode: StationControl['mode']) => void
  onAdjust: (id: ValveId, opening: number) => void
  onStop: () => void
  onResume: () => void
}

export function ValveStation({ station, status, profile, central, annexVolume, onMode, onAdjust, onStop, onResume }: StationProps) {
  const canAdjust = station.mode === 'manual' && !station.stopped
  const active = Object.values(status.rates).filter(rate => rate > 0).length
  return <section className="valve-station" lang="fr" aria-labelledby="station-title">
    <header className="station-heading">
      <div><a className="back-link" href="#/simulation"><ArrowLeft size={15} /> Simulation</a><h1 id="station-title">Station de vannes</h1></div>
      <button className={'button ' + (station.stopped ? 'primary' : 'secondary station-stop')} type="button" onClick={station.stopped ? onResume : onStop}>
        <CircleStop size={17} /> {station.stopped ? 'Réarmer la station' : 'Arrêt général'}
      </button>
    </header>
    <section className="panel station-pilot" aria-labelledby="station-pilot-title">
      <div className="station-pilot-head">
        <div><h2 id="station-pilot-title"><Radio size={18} /> Pilotage du réseau</h2><p role="status">{status.reason}</p></div>
        <div className="segmented" role="group" aria-label="Mode de pilotage">
          <button type="button" disabled={station.stopped} aria-pressed={station.mode === 'manual'} onClick={() => onMode('manual')}>Manuel</button>
          <button type="button" disabled={station.stopped} aria-pressed={station.mode === 'auto'} onClick={() => onMode('auto')}>Agent automatique</button>
        </div>
      </div>
      {station.mode === 'auto' && !station.stopped && <p className="station-advice">
        <strong>{profile === null ? 'Règles locales' : 'Profil Groq'}</strong>
        {profile === null ? ' · Pilotage automatique local' : ' · ' + stationProfiles[profile]}
      </p>}
      <dl className="station-meter-strip">
        <div><dt><Gauge size={15} /> Lignes en débit</dt><dd>{active} <small>/ {stationLines.length}</small></dd></div>
        <div><dt><Droplet size={15} /> Citerne centrale</dt><dd>{number.format(central)} <small>m³</small></dd></div>
        <div><dt><Droplet size={15} /> Réservoir annexe</dt><dd>{number.format(annexVolume)} <small>m³</small></dd></div>
      </dl>
    </section>
    <div className="station-bank-heading"><h2><Route size={18} /> Lignes hydrauliques</h2><p>1 seconde réelle = 1 minute simulée</p></div>
    <p id="valve-instruction" className="station-valve-instruction">{canAdjust ? 'Fais pivoter la poignée : à gauche pour fermer, à droite pour ouvrir.' : station.stopped ? 'Poignées verrouillées par l’arrêt général.' : 'Les poignées suivent les réglages de l’agent.'}</p>
    <div className="station-bank">
      {stationLines.map(line => {
        const opening = status.openings[line.id]
        const rate = status.rates[line.id]
        return <section key={line.id} className="panel station-line" data-flowing={rate > 0} aria-labelledby={'line-' + line.id}>
          <header>
            <div><h3 id={'line-' + line.id}>{line.label}</h3><p>{line.from} <ArrowRight size={12} /> {line.to}</p></div>
            <span className="station-line-state">{opening === 0 ? 'Fermée' : rate > 0 ? 'En débit' : 'Sans débit'}</span>
          </header>
          <ValveHandle label={line.label} opening={opening} disabled={!canAdjust} onAdjust={value => onAdjust(line.id, value)} />
          <dl className="station-line-level">
            <div><dt>Ouverture</dt><dd>{opening} <small>%</small></dd></div>
            <div><dt>Débit simulé</dt><dd>{number.format(rate)} <small>m³/h</small></dd></div>
          </dl>
        </section>
      })}
    </div>
  </section>
}

const travel = 49
const clampOpening = (value: number) => Math.max(0, Math.min(100, Math.round(value)))

export function ValveHandle({ label, opening, disabled, onAdjust }: { label: string; opening: number; disabled: boolean; onAdjust: (opening: number) => void }) {
  const pivot = useRef<HTMLSpanElement>(null)
  const angle = (opening / 100 * 2 - 1) * travel

  function turn(event: PointerEvent<HTMLDivElement>) {
    const center = pivot.current?.getBoundingClientRect()
    if (!center) return
    const pointerAngle = Math.atan2(event.clientX - center.x, Math.max(1, center.y - event.clientY)) * 180 / Math.PI
    onAdjust(clampOpening((pointerAngle + travel) / (2 * travel) * 100))
  }

  return <div className="valve-illustration" role="slider" aria-label={'Ouverture · ' + label}
    aria-describedby="valve-instruction" aria-disabled={disabled} tabIndex={disabled ? -1 : 0}
    aria-valuemin={0} aria-valuemax={100} aria-valuenow={opening}
    aria-valuetext={opening === 0 ? 'Fermée' : opening === 100 ? 'Ouverte à fond' : 'Ouverte à ' + number.format(opening) + ' %'}
    style={{ '--valve-angle': angle + 'deg' } as CSSProperties}
    onPointerDown={event => {
      if (disabled || !event.isPrimary || event.button !== 0) return
      event.currentTarget.focus({ preventScroll: true })
      event.currentTarget.setPointerCapture(event.pointerId)
      if (!(event.target instanceof Element && event.target.closest('.valve-arm'))) turn(event)
    }}
    onPointerMove={event => {
      if (!disabled && event.currentTarget.hasPointerCapture(event.pointerId)) turn(event)
    }}
    onKeyDown={event => {
      if (disabled) return
      const adjustments: Record<string, number> = { ArrowRight: opening + 5, ArrowUp: opening + 5, ArrowLeft: opening - 5, ArrowDown: opening - 5,
        PageUp: opening + 10, PageDown: opening - 10, Home: 0, End: 100 }
      if (!Object.hasOwn(adjustments, event.key)) return
      event.preventDefault()
      onAdjust(clampOpening(adjustments[event.key]))
    }}>
    <span aria-hidden="true" className="valve-track" />
    <span aria-hidden="true" className="valve-pipe" />
    <span aria-hidden="true" className="valve-collar" />
    <span aria-hidden="true" className="valve-pivot" ref={pivot} />
    <span aria-hidden="true" className="valve-arm"><i /></span>
  </div>
}
