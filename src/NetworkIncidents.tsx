import { Activity, Download, Mail, Share2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { estimateKizunaPressure } from './kizuna-model.ts'
import type { KizunaState, PressureTest } from './kizuna-model.ts'
import type { KizunaPilot } from './kizuna-pilot.ts'
import { pilotDate } from './KizunaPilotPanel.tsx'

type Alert = { code: string; title: string; detail: string; action: string; share?: boolean }
type Entry = Alert & { opened: number }
const storageKey = 'fas9ia-network-incidents-v1'

export function networkAlerts(state: KizunaState | null, pilot: KizunaPilot | null, pressureTest: PressureTest, offline: boolean, parkSensors: string[]) {
  const alerts: Alert[] = []
  if (state?.backupLeak) alerts.push({
    code: 'backup-leak', title: 'Fuite sur la conduite de secours',
    detail: 'La simulation a détecté une perte sur le circuit entre la pompe de secours et les secteurs de Borj Râs.',
    action: pilot?.automatic ? 'L’agent a isolé la conduite. Simulez une réparation avant de reprendre le transfert.' : 'Arrêter le secours et vérifier la conduite avant de reprendre le transfert.',
    share: true,
  })
  if (pressureTest === 'leak') {
    const pressure = estimateKizunaPressure(4.32, true)
    const format = new Intl.NumberFormat('fr-TN', { maximumFractionDigits: 2 })
    alerts.push({
      code: 'pressure-test', title: 'Fuite suspectée pendant le test de pression',
      detail: 'Test simulé sur 100 m à 4,32 m³/h. Perte mesurée ' + format.format(pressure.measuredDropBar)
        + ' bar, contre ' + format.format(pressure.expectedDropBar) + ' bar attendus.',
      action: 'Inspecter la conduite testée et relancer le test après vérification.', share: true,
    })
  }
  if (pilot?.outageAt != null) alerts.push({
    code: 'sonede-' + pilot.outageAt, title: 'Coupure SONEDE simulée à 12 h',
    detail: 'Borj Râs · ' + pilotDate.format(pilot.outageAt) + ' (heure locale).',
    action: 'Suivre la réserve disponible et le débit de secours depuis Simulation.',
  })
  if (offline) alerts.push({
    code: 'mqtt-offline', title: 'Télémétrie Wokwi indisponible',
    detail: 'L’ESP32 ne publie plus de mesures récentes.', action: 'Vérifier la simulation ESP32 et la connexion MQTT.',
  })
  for (const id of parkSensors) alerts.push({
    code: 'park-' + id, title: 'Capteur de pression hors ligne · ' + id,
    detail: 'Le point de mesure du parc n’envoie pas de relevé.', action: 'Vérifier l’alimentation et la liaison du capteur.',
  })
  for (const basin of state?.basins ?? []) {
    if (!pilot && basin.networkOutage) alerts.push({
      code: 'wokwi-outage-' + basin.id, title: 'Coupure simulée Wokwi · Bassin ' + basin.id,
      detail: 'L’ESP32 signale une coupure sur ce bassin.', action: 'Consulter la télémétrie et le circuit Wokwi.',
    })
    if (basin.levelPct === null) alerts.push({
      code: 'basin-sensor-' + basin.id, title: 'Capteur de niveau indisponible · Bassin ' + basin.id,
      detail: 'Aucun niveau utilisable. Ce bassin est exclu du plan de secours.',
      action: 'Vérifier le capteur et confirmer le retour d’un relevé valide.',
    })
    if (basin.masonryInspection) alerts.push({
      code: 'masonry-' + basin.id, title: 'Inspection de maçonnerie · Bassin ' + basin.id,
      detail: 'Une inspection a été demandée dans la simulation.', action: 'Examiner la maçonnerie puis clôturer l’inspection.',
    })
  }
  if (state?.cleaningCheck || pilot && pilot.clock >= pilot.nextCleaning) alerts.push({
    code: 'cleaning', title: 'Tandifa à vérifier',
    detail: state?.cleaningCheck ? 'La télémétrie signale un nettoyage à vérifier.' : 'La date annuelle de nettoyage est atteinte.',
    action: 'Contrôler les bassins et consigner la tandifa.',
  })
  if (pilot && (pilot.hotMotors.length > 0 || pilot.waterC >= 45)) alerts.push({
    code: 'thermal', title: 'Protection thermique déclenchée',
    detail: 'Température de l’eau ou d’un moteur au-dessus du seuil de la simulation.',
    action: 'Suivre le refroidissement depuis Simulation.',
  })
  return alerts
}

function readJournal(): Entry[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(storageKey) ?? '[]')
    return Array.isArray(stored) ? stored.filter(item => typeof item?.opened === 'number' && typeof item?.code === 'string'
      && typeof item?.title === 'string' && typeof item?.detail === 'string' && typeof item?.action === 'string') : []
  } catch {
    return []
  }
}

export function useNetworkJournal(alerts: Alert[], enabled: boolean) {
  const [entries, setEntries] = useState(readJournal)
  const seen = useRef(new Set<string>())
  const snapshot = enabled ? JSON.stringify(alerts) : '[]'
  useEffect(() => {
    const current: Alert[] = JSON.parse(snapshot)
    const added = current.filter(alert => !seen.current.has(alert.code))
    seen.current = new Set(current.map(alert => alert.code))
    if (!added.length) return
    const opened = Date.now()
    setEntries(previous => [...added.map(alert => ({ ...alert, opened })), ...previous].slice(0, 50))
  }, [snapshot])
  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(entries)) } catch { /* Session journal remains available. */ }
  }, [entries])
  return entries
}

function report(entry: Entry) {
  return [
    'FAS9IA · Rapport d’incident simulé', 'Site pilote de Borj Râs, Mahdia', 'Objet : ' + entry.title,
    'Détecté le : ' + pilotDate.format(entry.opened) + ' (heure de Borj Râs)',
    'Constat : ' + entry.detail, 'Intervention : ' + entry.action,
  ].join('\n')
}

function ShareReport({ entry }: { entry: Entry }) {
  const [status, setStatus] = useState('')
  const text = report(entry)
  const canShare = typeof navigator.share === 'function'
  async function share() {
    try {
      if (canShare) await navigator.share({ title: entry.title, text })
      else {
        await navigator.clipboard.writeText(text)
        setStatus('Rapport copié. Vous pouvez le coller dans votre outil d’envoi.')
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) setStatus('Partage indisponible. Utilisez le téléchargement ou l’e-mail.')
    }
  }
  return <div className="kz-actions">
    <button className="button secondary" onClick={() => void share()}><Share2 size={16} /> {canShare ? 'Partager' : 'Copier le rapport'}</button>
    <a className="button secondary" href={'mailto:?subject=' + encodeURIComponent(entry.title) + '&body=' + encodeURIComponent(text)}><Mail size={16} /> Préparer un e-mail</a>
    <a className="button secondary" href={'data:text/plain;charset=utf-8,' + encodeURIComponent(text)} download={'fas9ia-' + entry.code + '.txt'}><Download size={16} /> Télécharger</a>
    <small role="status">{status}</small>
  </div>
}

export function NetworkIncidents({ alerts, entries }: { alerts: Alert[]; entries: Entry[] }) {
  return <section className="panel kz-panel" aria-labelledby="network-incidents">
    <h2 id="network-incidents"><Activity size={19} /> Incidents techniques</h2>
    {!entries.length && <p>Aucun incident technique enregistré.</p>}
    <div className="kz-stack">{entries.map(entry => {
      const active = entries.find(latest => latest.code === entry.code) === entry ? alerts.find(alert => alert.code === entry.code) : undefined
      return <article className="kz-equipment" key={entry.code + '-' + entry.opened}>
        <header><h3>{entry.title}</h3><small>{active ? 'En cours' : 'Historique'} · {pilotDate.format(entry.opened)}</small></header>
        <p>{entry.detail}</p><p>{active?.action ?? entry.action}</p>
        {entry.share && <details>
          <summary>Consulter le rapport de fuite</summary>
          <pre className="kz-report">{report(entry)}</pre>
          <ShareReport entry={entry} />
        </details>}
      </article>
    })}</div>
  </section>
}
