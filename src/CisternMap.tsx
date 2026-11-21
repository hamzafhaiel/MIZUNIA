import { ArrowRight, ArrowUp, Check, CircleCheck, Droplet, ExternalLink, House, Landmark, MapPin, Plus, Radio, TriangleAlert, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { FormEvent, MouseEvent } from 'react'
import { Badge, formatTime } from './components.tsx'
import { applySensorReading, demoCisterns, isPilotLocation, project, readCisterns, registerCistern, registryStorageKey, saveCisterns, unproject } from './cisterns.ts'
import type { Cistern, Location } from './cisterns.ts'
import { homes } from './households.ts'
import type { HouseholdState } from './households.ts'
import type { Incident } from './model.ts'
import './cistern-map.css'

const landmarks = [
  { name: 'Grande Mosquée', latitude: 35.50399, longitude: 11.07205 },
  { name: 'Borj El Kebir', latitude: 35.50528, longitude: 11.07639 },
  { name: 'Phare de Mahdia', latitude: 35.508, longitude: 11.08044 },
] satisfies (Location & { name: string })[]

const formatLiters = (liters: number) => liters.toLocaleString('fr-TN', { maximumFractionDigits: 1 }) + ' L'
const sectorNames = { north: 'Secteur nord', central: 'Abords du parc', east: 'Secteur est' } as const
const reportLabels = { 'No water': 'Coupure d’eau', 'Low pressure': 'Pression faible' } as const
const parkStatus = { Open: 'Signalée', 'Under review': 'En cours d’examen', Monitoring: 'Sous surveillance', Resolved: 'Résolue' } as const

export function CisternWorkspace({ households, parkIncident, directory, routeId }: {
  households: HouseholdState
  parkIncident: Incident | undefined
  directory: boolean
  routeId?: string
}) {
  const [cisterns, setCisterns] = useState(() => readCisterns() ?? demoCisterns())
  const [selectedId, setSelectedId] = useState('FQ-001')
  const [adding, setAdding] = useState(false)
  const [latitude, setLatitude] = useState('')
  const [longitude, setLongitude] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [reportLayer, setReportLayer] = useState<boolean>()
  const showReports = reportLayer ?? routeId === 'reports'
  const selected = cisterns.find(cistern => cistern.id === (directory ? routeId ?? selectedId : selectedId)) ?? cisterns[0]
  const pendingReports = households.reports.filter(report => !report.assistance)
  const priorityReports = [...pendingReports].sort((a, b) =>
    Number(b.issue === 'No water') - Number(a.issue === 'No water') || a.submitted - b.submitted)
  const priorityReport = priorityReports[0]
  const firstCase = parkIncident ? {
    href: '#/incidents/' + parkIncident.id,
    title: parkIncident.status === 'Monitoring' ? 'Rétablissement à vérifier au parc' : 'Basse pression au Parc Hydraulique',
    detail: parkStatus[parkIncident.status] + ' · ' + parkIncident.id,
    critical: parkIncident.severity === 'Critical',
  } : priorityReport ? {
    href: '#/incidents/' + priorityReport.id,
    title: reportLabels[priorityReport.issue] + ' · Maison ' + priorityReport.home,
    detail: sectorNames[homes[priorityReport.home].area] + ' · ' + priorityReport.id,
    critical: false,
  } : null
  const queuedReports = parkIncident ? priorityReports : priorityReports.slice(1)
  const location = { latitude: latitude === '' ? NaN : Number(latitude), longitude: longitude === '' ? NaN : Number(longitude) }
  const pinPlaced = isPilotLocation(location)

  useEffect(() => {
    function sync(event: StorageEvent) {
      if (event.key !== registryStorageKey) return
      const saved = readCisterns()
      if (saved) setCisterns(saved)
    }
    window.addEventListener('storage', sync)
    return () => window.removeEventListener('storage', sync)
  }, [])

  function commit(updated: Cistern[], message: string) {
    setCisterns(updated)
    const stored = saveCisterns(updated)
    setNotice(stored ? message : message + ' Enregistrement limité à cette session.')
  }

  function pickLocation(event: MouseEvent<HTMLDivElement>) {
    if (!adding) return
    const rect = event.currentTarget.getBoundingClientRect()
    const point = unproject((event.clientX - rect.left) / rect.width, (event.clientY - rect.top) / rect.height)
    if (!isPilotLocation(point)) {
      setError('Choisissez un emplacement à terre dans la zone de la carte.')
      return
    }
    setLatitude(point.latitude.toFixed(6))
    setLongitude(point.longitude.toFixed(6))
    setError('')
  }

  function toggleRegistration() {
    setAdding(!adding)
    setLatitude('')
    setLongitude('')
    setError('')
    setNotice('')
  }

  function addCistern(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const fields = new FormData(event.currentTarget)
    const current = readCisterns() ?? cisterns
    const result = registerCistern(current, {
      ...location,
      name: String(fields.get('name')),
      sensorId: String(fields.get('sensor')),
      capacity: Number(fields.get('capacity')),
    })
    if ('error' in result) {
      setError(result.error)
      return
    }
    const { cistern } = result
    commit([...current, cistern], cistern.name + ' ajoutée à la carte. Premier relevé en attente.')
    setSelectedId(cistern.id)
    setAdding(false)
  }

  function simulateReading(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const liters = Number(new FormData(event.currentTarget).get('liters'))
    const current = readCisterns() ?? cisterns
    const next = applySensorReading(current, selected.sensorId, liters)
    if (next === current) {
      setNotice('Le relevé est hors capacité ou le capteur est inconnu.')
      return
    }
    commit(next, 'Relevé simulé reçu de ' + selected.sensorId + '.')
  }

  return <section className={'cistern-workspace' + (directory ? '' : ' operations-home')} lang="fr" aria-labelledby="cistern-title">
    <header className="cistern-header">
      <div><p className="command-location">Borj Râs <i /> Mahdia, Tunisie</p><h1 id="cistern-title">{directory ? 'Réserves partagées' : 'Opérations de l’eau'}</h1></div>
      {directory ? <a className="button secondary" href="#/map"><MapPin size={16} /> Ouvrir la carte</a> : <button type="button" className="button secondary" onClick={toggleRegistration} aria-expanded={adding} aria-controls="cistern-sidebar">
        {adding ? <X size={17} /> : <Plus size={17} />}{adding ? 'Annuler l’ajout' : 'Ajouter une citerne'}
      </button>}
    </header>

    {!directory && <div className="operations-status">
      {firstCase ? <a className="operations-priority" data-critical={firstCase.critical} href={firstCase.href}>
        <span className="operations-priority-icon"><TriangleAlert size={20} /></span>
        <span><strong>{firstCase.title}</strong><small>{firstCase.detail}</small></span>
        <span className="operations-priority-action">Examiner <ArrowRight size={16} /></span>
      </a> : <div className="operations-priority is-clear">
        <span className="operations-priority-icon"><CircleCheck size={20} /></span>
        <span><strong>Aucune alerte à traiter</strong><small>Borj Râs · Simulation</small></span>
      </div>}
      <dl className="operations-summary">
        <div><dt>Signalements à traiter</dt><dd>{pendingReports.length}</dd></div>
        <div><dt>Zones confirmées</dt><dd>{Object.keys(households.confirmed).length}</dd></div>
        <div><dt>Citernes cartographiées</dt><dd>{cisterns.length}</dd></div>
      </dl>
    </div>}
    <div className={'cistern-layout' + (directory ? ' cistern-directory' : '')}>
      {!directory && <section className="panel cistern-map-card" lang="fr" aria-labelledby="cistern-map-title">
        <div className="cistern-bar">
          <h2 id="cistern-map-title"><MapPin size={17} /> Carte de la presqu’île</h2>
          {adding ? <Badge tone="amber">Placement en cours</Badge> : <button type="button" className="map-layer" aria-pressed={showReports} onClick={() => setReportLayer(!showReports)}><House size={14} /> Signalements</button>}
        </div>
        {adding && <p className="cistern-pick-help" role="status">{pinPlaced ? 'Emplacement sélectionné. Complétez la fiche de la citerne.' : 'Cliquez sur la carte pour placer la citerne ou saisissez ses coordonnées dans la fiche.'}</p>}
        <div className={'cistern-map-frame' + (adding ? ' is-picking' : '')} onClick={pickLocation} aria-label="Carte de la presqu’île de Borj Râs" role="group">
          <img src={import.meta.env.BASE_URL + 'borj-ras-map.webp'} alt="" width={1680} height={1175} />
          <div className="cistern-compass" aria-hidden="true"><ArrowUp size={16} /> N</div>
          {landmarks.map(landmark => <span className="cistern-landmark" style={project(landmark)} key={landmark.name}><Landmark size={12} /><span>{landmark.name}</span></span>)}
          {cisterns.map(cistern => <button key={cistern.id} type="button" className="cistern-pin" style={project(cistern)} data-ready={Boolean(cistern.reading)}
            aria-label={cistern.id + ' · ' + cistern.name} aria-pressed={selected.id === cistern.id && !adding} disabled={adding}
            onClick={() => { setSelectedId(cistern.id); setNotice('') }}><Droplet size={16} /><span>{cistern.id}</span></button>)}
          {showReports && !adding && households.reports.map(report => {
            const home = homes[report.home]
            return <a key={report.id} href={'#/incidents/' + report.id} className="cistern-report-pin" data-confirmed={Boolean(households.confirmed[home.area])} style={project(home)}
              aria-label={'Examiner le signalement ' + report.id}><House size={15} /></a>
          })}
          {adding && pinPlaced && <span className="cistern-draft-pin" style={project(location)} aria-hidden="true"><MapPin size={21} /></span>}
          <a className="cistern-attribution" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" onClick={event => event.stopPropagation()}>© OpenStreetMap contributors <ExternalLink size={11} /></a>
        </div>
        <div className="cistern-bar cistern-legend"><span><i /> Relevé simulé reçu</span><span><i /> Premier relevé en attente</span>{showReports && !adding && <><span><House size={13} /> Signalement</span><span className="confirmed-key"><House size={13} /> Zone confirmée</span></>}<span>Emplacements fictifs</span></div>
      </section>}

      <aside id="cistern-sidebar" className="panel cistern-sidebar">
        {adding && !directory ? <form className="cistern-registration" lang="fr" onSubmit={addCistern}>
          <h2>Nouvelle فاسقية</h2>
          <label>Nom de la citerne<input name="name" placeholder="Ex. Citerne de la médina" required maxLength={60} /></label>
          <div className="cistern-form-pair">
            <label>Latitude<input value={latitude} onChange={event => setLatitude(event.target.value)} inputMode="decimal" type="number" step="any" placeholder="35.506000" required /></label>
            <label>Longitude<input value={longitude} onChange={event => setLongitude(event.target.value)} inputMode="decimal" type="number" step="any" placeholder="11.076000" required /></label>
          </div>
          <label>Capacité (L)<input name="capacity" type="number" inputMode="numeric" min="1" max="1000000" step="1" placeholder="2 000" required /></label>
          <label>Identifiant du capteur<input name="sensor" placeholder="Ex. WOKWI-04" maxLength={32} required /></label>
          {error && <p className="cistern-error" role="alert">{error}</p>}
          <button type="submit" className="button primary"><Check size={17} /> Enregistrer et associer</button>
        </form> : directory ? <div className="cistern-directory-content" lang="fr">
          <div><div className="cistern-inventory-heading"><h2>{cisterns.length} citernes cartographiées</h2><p>360 évoquées par l’équipe, total à vérifier sur le terrain.</p></div>
          <ul className="cistern-list" aria-label="Citernes cartographiées">
            {cisterns.map(cistern => <li key={cistern.id}><a href={'#/reserves/' + cistern.id} aria-current={cistern.id === selected.id ? 'true' : undefined} onClick={() => { setSelectedId(cistern.id); setNotice('') }}>
              <span className="cistern-list-icon" data-ready={Boolean(cistern.reading)}><Droplet size={16} /></span>
              <span><strong>{cistern.name}</strong><small>{cistern.id} · {cistern.sensorId}</small></span>
              <span>{cistern.reading ? formatLiters(cistern.reading.liters) : 'En attente'}</span>
            </a></li>)}
          </ul></div>
          <section className="cistern-reading" aria-labelledby="cistern-reading-title">
            <div className="cistern-reading-heading"><h3 id="cistern-reading-title">{selected.name}</h3><Radio size={17} /></div>
            <p>{selected.sensorId} · {selected.reading ? 'Relevé simulé à ' + formatTime(selected.reading.at) : 'Associé · Premier relevé en attente'}</p>
            <dl><div><dt>Volume relevé</dt><dd>{selected.reading ? formatLiters(selected.reading.liters) : '—'}</dd></div><div><dt>Capacité</dt><dd>{formatLiters(selected.capacity)}</dd></div></dl>
            <form key={selected.id} onSubmit={simulateReading}>
              <label>Volume simulé (L)<input name="liters" type="number" inputMode="decimal" min="0" max={selected.capacity} step="0.1" required defaultValue={selected.reading?.liters ?? Math.floor(selected.capacity / 2)} /></label>
              <button type="submit" className="button secondary">Envoyer le relevé</button>
            </form>
          </section>
        </div> : <>
          <section className="operations-queue" aria-labelledby="operations-queue-title">
            <div className="operations-queue-heading"><h2 id="operations-queue-title">Signalements</h2><a href="#/incidents">Voir les incidents <ArrowRight size={15} /></a></div>
            {queuedReports.length ? <ul className="operations-cases">{queuedReports.slice(0, 3).map(report => <li key={report.id}>
              <a href={'#/incidents/' + report.id}><House size={16} /><span><strong>Maison {report.home} · {reportLabels[report.issue]}</strong><small>{sectorNames[homes[report.home].area]} · {report.id}</small></span><ArrowRight size={15} /></a>
            </li>)}</ul> : <p className="operations-clear">{priorityReport ? 'Aucun autre signalement à traiter.' : 'Aucun signalement à traiter.'}</p>}
          </section>
          <section className="cistern-reading" aria-labelledby="map-selection-title">
            <div className="cistern-reading-heading"><h3 id="map-selection-title">{selected.name}</h3><Droplet size={18} /></div>
            <p>{selected.id} · {selected.sensorId}{selected.reading && ' · ' + formatTime(selected.reading.at)}</p>
            <dl><div><dt>Dernier relevé simulé</dt><dd>{selected.reading ? formatLiters(selected.reading.liters) : 'En attente'}</dd></div><div><dt>Capacité</dt><dd>{formatLiters(selected.capacity)}</dd></div></dl>
            <a className="button secondary" href={'#/reserves/' + selected.id}>Ouvrir la fiche <ArrowRight size={15} /></a>
          </section>
        </>}
        {notice && <p className="cistern-notice" role="status">{notice}</p>}
      </aside>
    </div>
  </section>
}
