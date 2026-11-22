import { Activity, CalendarDays, Gauge, Thermometer } from 'lucide-react'
import { KIZUNA_DISTRIBUTION_SECTORS, KIZUNA_HOUSEHOLD_DEMAND, pilotPlan, thermalRate } from './kizuna-pilot.ts'
import type { KizunaPilot } from './kizuna-pilot.ts'
import type { useKizuna } from './useKizuna.ts'

const number = new Intl.NumberFormat('fr-TN', { maximumFractionDigits: 2 })
export const pilotDate = new Intl.DateTimeFormat('fr-TN', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Tunis', hourCycle: 'h23',
})

export function PilotControl({ pilot, controls, maintenance }: {
  pilot: KizunaPilot
  controls: ReturnType<typeof useKizuna>['pilotControls']
  maintenance?: boolean
}) {
  const { outageAt, clock, automatic, advice } = pilot
  const outage = outageAt !== null && clock >= outageAt
  const plan = pilotPlan(pilot)
  const calendarFree = outageAt === null && pilot.state.pumpLoadW === 0 && pilot.rainLeft === 0
  const nextRelease = Math.min(...Object.values(pilot.settlingUntil).filter((until): until is number => typeof until === 'number' && until > clock))

  return <>
    <section className="panel kz-panel" aria-labelledby="pilot-title">
      <h2 id="pilot-title"><Activity size={19} /> {automatic ? advice ? 'Agent IA · Groq' : 'Agent automatique · règles locales' : 'Scénario SONEDE'}</h2>
      <p>Coupure simulée à Borj Râs à 12 h. Le secours distribue de l’eau non potable aux trois secteurs de démonstration.</p>
      <p>{outageAt === null ? 'Aucune coupure programmée.' : (outage ? 'Coupure en cours · ' : 'Coupure prévue · ') + pilotDate.format(outageAt) + ' · Heure simulée ' + pilotDate.format(clock)}</p>
      <div className="kz-actions">
        {outageAt === null ? <button className="button primary" onClick={controls.schedule}>Simuler la coupure de 12 h</button>
          : <button className="button secondary" onClick={controls.cancel}>Rétablir le réseau simulé</button>}
        <a className="button secondary" href="#/incidents">Voir les incidents</a>
      </div>
      <p role="status">{automatic ? plan.block ?? (outage ? 'Distribution automatique en cours.' : outageAt === null ? 'Plan de distribution prêt.' : 'Bassin de secours sélectionné. Le transfert démarrera à midi.') : 'Le pilotage automatique est en pause.'}</p>
      <dl className="kz-stats">
        <div><dt>Bassin prévu ou actif</dt><dd>{plan.selected ? 'Bassin ' + plan.selected.id : '—'}</dd></div>
        <div><dt>Stock mobilisable</dt><dd>{number.format(plan.stock)} m³</dd></div>
        <div><dt>Autonomie théorique au débit cible</dt><dd>{number.format(plan.hours)} h</dd></div>
        <div><dt>Demande des secteurs</dt><dd>{number.format(KIZUNA_HOUSEHOLD_DEMAND)} m³/h</dd></div>
        <div><dt>Débit cible / livré</dt><dd>{number.format(plan.target)} / {number.format(plan.delivered)} m³/h</dd></div>
        <div><dt>Demande restant à couvrir</dt><dd>{number.format(plan.shortfall)} m³/h</dd></div>
      </dl>
      <dl className="kz-stats" aria-label="Débit livré par secteur">{KIZUNA_DISTRIBUTION_SECTORS.map(sector => <div key={sector}>
        <dt>{sector}</dt><dd>{number.format(plan.delivered * 1000 / KIZUNA_DISTRIBUTION_SECTORS.length)} L/h</dd>
      </div>)}</dl>
    </section>
    {maintenance && <>
      <section className="panel kz-panel" aria-labelledby="thermal-title">
        <h2 id="thermal-title"><Thermometer size={19} /> Protection thermique des moteurs</h2>
        <label className="kz-distance">Température simulée de l’eau · {number.format(pilot.waterC)} °C
          <input type="range" min={10} max={60} value={pilot.waterC} onChange={event => controls.water(event.currentTarget.valueAsNumber)} />
        </label>
        <div className="kz-basin-grid">{[0, ...pilot.state.basins.map(basin => basin.id)].map(id => {
          const locked = pilot.hotMotors.includes(id) || pilot.waterC >= 45
          const running = id === 0 ? Boolean(pilot.state.backupBasin) : pilot.state.basins.some(basin => basin.id === id && basin.pumpOn)
          const left = Math.max(0, (75 - pilot.motorsC[id]) / thermalRate(pilot.waterC))
          return <article className="kz-equipment" key={id}>
            <h3><Gauge size={14} /> {id === 0 ? 'Moteur de secours' : 'Moteur du bassin ' + id}</h3>
            <p>{number.format(pilot.motorsC[id])} °C · {locked ? 'Arrêt thermique' : running ? 'En marche' : 'À l’arrêt'}</p>
            <small>{locked ? 'Refroidissement requis' : 'Arrêt thermique estimé après ' + number.format(left) + ' h de marche continue'}</small>
          </article>
        })}</div>
        <p>Seuils de la simulation · Eau à 45 °C ou moteur à 75 °C. Un moteur en surchauffe se réarme à 62 °C.</p>
      </section>
      <section className="panel kz-panel" aria-labelledby="cleaning-title">
        <h2 id="cleaning-title"><CalendarDays size={19} /> Tandifa annuelle et décantation</h2>
        <p>Prochaine tandifa · {pilotDate.format(pilot.nextCleaning)}{pilot.lastCleaning === null ? '' : ' · Dernière tandifa ' + pilotDate.format(pilot.lastCleaning)}</p>
        <p>Un dépôt simulé rend le bassin concerné indisponible pendant sept jours simulés.</p>
        <div className="kz-basin-grid">{pilot.state.basins.map(basin => {
          const release = pilot.settlingUntil[basin.id] ?? 0
          return <article className="kz-equipment" key={basin.id}>
            <h3>Bassin {basin.id}</h3>
            <p>{release > clock ? 'Décantation jusqu’au ' + pilotDate.format(release) : 'Aucune décantation en cours'}</p>
            <button className="button secondary" disabled={release > clock} onClick={() => controls.deposit(basin.id)}>Simuler un dépôt</button>
          </article>
        })}</div>
        <div className="kz-actions">
          {Number.isFinite(nextRelease) && <button className="button secondary" disabled={!calendarFree} onClick={() => controls.advanceCalendar(nextRelease)}>Avancer à la fin de la décantation</button>}
          <button className="button secondary" disabled={!calendarFree || pilot.nextCleaning <= clock} onClick={() => controls.advanceCalendar(pilot.nextCleaning)}>Avancer à la tandifa</button>
          <button className="button primary" disabled={!calendarFree || pilot.nextCleaning > clock} onClick={controls.clean}>Consigner la tandifa</button>
        </div>
        {!calendarFree && <small>Le calendrier d’entretien peut avancer lorsque le scénario de coupure, la pluie et les pompes sont à l’arrêt.</small>}
      </section>
    </>}
  </>
}
