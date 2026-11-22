import { ArrowRight, ArrowUp, Check, CircleCheck, Droplet, ExternalLink, Landmark, MapPin, Plus, Radio, TriangleAlert, X } from 'lucide-react'
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import type { FormEvent, MouseEvent } from 'react'
import { Badge, formatTime } from './components.tsx'
import { applySensorReading, demoCisterns, isPilotLocation, project, readCisterns, registerCistern, registryStorageKey, saveCisterns, unproject, updateCisternDiameter } from './cisterns.ts'
import type { Cistern, Location } from './cisterns.ts'
import type { Incident } from './model.ts'
import { KIZUNA_CAPACITY_M3, KIZUNA_CISTERNS, KIZUNA_DIAMETER_M, kizunaAvailable, kizunaVolume } from './kizuna-model.ts'
import type { KizunaState } from './kizuna-model.ts'
import { ReserveOverview, ReservePlanner } from './ReserveOverview.tsx'
import type { ReserveGenerator } from './ReserveOverview.tsx'
import './cistern-map.css'

const landmarks = [
  { name: 'Grande Mosquée', latitude: 35.50399, longitude: 11.07205 },
  { name: 'Borj El Kebir', latitude: 35.50528, longitude: 11.07639 },
  { name: 'Phare de Mahdia', latitude: 35.508, longitude: 11.08044 },
] satisfies (Location & { name: string })[]

const formatLiters = (liters: number) => liters.toLocaleString('fr-TN', { maximumFractionDigits: 1 }) + ' L'
const formatDiameter = (diameter?: number) => diameter === undefined ? 'Non renseigné' : diameter.toLocaleString('fr-TN', { maximumFractionDigits: 2 }) + ' m'
const freeCapacity = (cistern: Cistern) => cistern.reading === null ? 'Inconnue' : formatLiters(cistern.capacity - cistern.reading.liters)
const readDiameter = (fields: FormData) => {
  const value = String(fields.get('diameter') ?? '').trim()
  return value ? Number(value) : undefined
}
const readingDate = new Intl.DateTimeFormat('fr-TN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Tunis' })
const parkStatus = { Open: 'Signalée', 'Under review': 'En cours d’examen', Monitoring: 'Sous surveillance', Resolved: 'Résolue' } as const
const parkSeverity = { Low: 'Faible', Moderate: 'Modérée', Critical: 'Critique' } as const

export function CisternWorkspace({ networkIncidents, parkIncident, directory, routeId, liveRegistry, power }: {
  networkIncidents: number
  parkIncident: Incident | undefined
  directory: boolean
  routeId?: string
  liveRegistry?: { state: KizunaState | null; at: number | null; outage: boolean }
  power: ReserveGenerator
}) {
  const [storedCisterns, setCisterns] = useState(() => readCisterns() ?? demoCisterns())
  const cisterns = liveRegistry ? storedCisterns.map(cistern => {
    const id = KIZUNA_CISTERNS.indexOf(cistern.id) + 1
    if (!id) return cistern
    const basin = liveRegistry.state?.basins.find(item => item.id === id)
    const volume = basin ? kizunaVolume(basin) : null
    return { ...cistern, sensorId: 'KIZUNA-0' + id, capacity: KIZUNA_CAPACITY_M3 * 1000, diameter: KIZUNA_DIAMETER_M,
      reading: volume !== null && liveRegistry.at !== null ? { liters: volume * 1000, at: liveRegistry.at } : null }
  }) : storedCisterns
  const protectedLiters = liveRegistry?.state?.basins.reduce((total, basin) =>
    total + ((kizunaVolume(basin) ?? 0) - (kizunaAvailable(basin) ?? 0)) * 1000, 0) ?? 0
  const [selectedId, setSelectedId] = useState('FQ-001')
  const [adding, setAdding] = useState(false)
  const [latitude, setLatitude] = useState('')
  const [longitude, setLongitude] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [hoveredId, setHoveredId] = useState<string>()
  const [focusedId, setFocusedId] = useState<string>()
  const closePreviewTimer = useRef<number | undefined>(undefined)
  const previewId = useId()
  const preview = !directory && !adding ? cisterns.find(cistern => cistern.id === (hoveredId ?? focusedId)) : undefined
  const selected = cisterns.find(cistern => cistern.id === (directory ? routeId ?? selectedId : selectedId)) ?? cisterns[0]
  const managed = Boolean(liveRegistry && KIZUNA_CISTERNS.includes(selected.id))
  const reportingCisterns = cisterns.filter(cistern => cistern.reading !== null).length
  const networkAlert = liveRegistry?.state?.backupLeak ? 'Fuite simulée sur la conduite de secours'
    : liveRegistry?.outage ? 'Réseau d’eau en coupure simulée' : null
  const firstCase = parkIncident ? {
    href: '#/incidents/' + parkIncident.id,
    title: parkIncident.status === 'Monitoring' ? 'Rétablissement à vérifier au parc' : 'Basse pression au Parc Hydraulique',
    detail: parkSeverity[parkIncident.severity] + ' · ' + parkStatus[parkIncident.status] + ' · ' + parkIncident.id,
    action: parkIncident.status === 'Monitoring' ? 'Vérifier' : 'Examiner',
    critical: parkIncident.severity === 'Critical',
  } : networkAlert ? {
    href: '#/incidents', title: networkAlert, detail: 'État du réseau KIZUNA', action: 'Voir les incidents', critical: true,
  } : null
  const selectedFill = selected.reading === null ? null : selected.reading.liters / selected.capacity * 100
  const location = { latitude: latitude === '' ? NaN : Number(latitude), longitude: longitude === '' ? NaN : Number(longitude) }
  const pinPlaced = isPilotLocation(location)

  useEffect(() => {
    setHoveredId(undefined)
    setFocusedId(undefined)
    return () => window.clearTimeout(closePreviewTimer.current)
  }, [directory, routeId])

  useEffect(() => {
    if (!preview) return
    function dismiss(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      window.clearTimeout(closePreviewTimer.current)
      setHoveredId(undefined)
      setFocusedId(undefined)
    }
    window.addEventListener('keydown', dismiss)
    return () => window.removeEventListener('keydown', dismiss)
  }, [preview])

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
    setHoveredId(undefined)
    setFocusedId(undefined)
    setAdding(!adding)
    setLatitude('')
    setLongitude('')
    setError('')
    setNotice('')
  }

  function addCistern(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const fields = new FormData(event.currentTarget)
    const current = readCisterns() ?? storedCisterns
    const result = registerCistern(current, {
      ...location,
      name: String(fields.get('name')),
      sensorId: String(fields.get('sensor')),
      capacity: Number(fields.get('capacity')),
      diameter: readDiameter(fields),
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
    if (managed) return
    const liters = Number(new FormData(event.currentTarget).get('liters'))
    const current = readCisterns() ?? storedCisterns
    const next = applySensorReading(current, selected.sensorId, liters)
    if (next === current) {
      setNotice('Le relevé est hors capacité ou le capteur est inconnu.')
      return
    }
    commit(next, 'Relevé simulé reçu de ' + selected.sensorId + '.')
  }

  function changeDiameter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (managed) return
    const current = readCisterns() ?? storedCisterns
    const diameter = readDiameter(new FormData(event.currentTarget))
    const next = updateCisternDiameter(current, selected.id, diameter)
    if (next === current) {
      setNotice('Indiquez un diamètre d’au moins 0,01 m.')
      return
    }
    commit(next, diameter === undefined ? 'Diamètre retiré de la fiche.' : 'Diamètre enregistré.')
  }

  function startPreview(id: string) {
    window.clearTimeout(closePreviewTimer.current)
    setHoveredId(id)
  }

  function endPreview() {
    window.clearTimeout(closePreviewTimer.current)
    closePreviewTimer.current = window.setTimeout(() => setHoveredId(undefined), 160)
  }

  return <section className={'cistern-workspace' + (directory ? '' : ' operations-home')} lang="fr" aria-labelledby="cistern-title">
    <header className="cistern-header">
      <h1 id="cistern-title">{directory ? 'Réserves partagées' : 'Opérations de l’eau'}</h1>
      {directory ? <a className="button secondary" href="#/map"><MapPin size={16} /> Ouvrir la carte</a> : <button type="button" className={'button ' + (adding ? 'secondary' : 'primary')} onClick={toggleRegistration} aria-expanded={adding} aria-controls="cistern-sidebar">
        {adding ? <X size={17} /> : <Plus size={17} />}{adding ? 'Annuler l’ajout' : 'Ajouter une citerne'}
      </button>}
    </header>

    {directory && <ReserveOverview cisterns={cisterns} selectedId={selected.id} />}
    <div className={'cistern-layout' + (directory ? ' cistern-directory' : adding ? ' is-registering' : '')}>
      {!directory && <section className="panel operations-overview" aria-labelledby="operations-overview-title">
        <h2 id="operations-overview-title">Vue du réseau</h2>
        <dl className="operations-summary">
          <div><dt>Incidents techniques actifs</dt><dd>{networkIncidents + Number(Boolean(parkIncident))}<TriangleAlert size={18} aria-hidden="true" /></dd></div>
          <div><dt>Citernes sans relevé</dt><dd>{cisterns.length - reportingCisterns}<Radio size={18} aria-hidden="true" /></dd></div>
          <div><dt>Citernes avec relevé</dt><dd>{reportingCisterns}<small>/{cisterns.length}</small><Radio size={18} aria-hidden="true" /></dd></div>
        </dl>
        <div className="operations-alert">
          <h3>Alerte prioritaire</h3>
          {firstCase ? <a className="operations-priority" data-critical={firstCase.critical} href={firstCase.href}>
            <span className="operations-priority-icon"><TriangleAlert size={18} /></span>
            <span><strong>{firstCase.title}</strong><small>{firstCase.detail}</small></span>
            <span className="operations-priority-action">{firstCase.action} <ArrowRight size={15} /></span>
          </a> : <div className="operations-priority is-clear">
            <span className="operations-priority-icon"><CircleCheck size={18} /></span>
            <span><strong>Aucune nouvelle intervention</strong><small>Consultez les incidents pour le suivi des dossiers.</small></span>
          </div>}
        </div>
      </section>}
      {!directory && <section className="panel cistern-map-card" lang="fr" aria-labelledby="cistern-map-title">
        <div className="cistern-bar">
          <h2 id="cistern-map-title"><MapPin size={17} /> Carte de la presqu’île</h2>
          {adding && <Badge tone="amber">Placement en cours</Badge>}
        </div>
        {adding && <p className="cistern-pick-help" role="status">{pinPlaced ? 'Emplacement sélectionné. Complétez la fiche de la citerne.' : 'Cliquez sur la carte pour placer la citerne ou saisissez ses coordonnées dans la fiche.'}</p>}
        <div className={'cistern-map-frame' + (adding ? ' is-picking' : '')} onClick={pickLocation} aria-label="Carte de la presqu’île de Borj Râs" role="group">
          <img src={import.meta.env.BASE_URL + 'borj-ras-map.webp'} alt="" width={1680} height={1175} />
          <div className="cistern-compass" aria-hidden="true"><ArrowUp size={16} /> N</div>
          {landmarks.map(landmark => <span className="cistern-landmark" style={project(landmark)} key={landmark.name}><Landmark size={12} /><span>{landmark.name}</span></span>)}
          {cisterns.map(cistern => <button key={cistern.id} type="button" className="cistern-pin" style={project(cistern)} data-ready={Boolean(cistern.reading)}
            aria-label={cistern.id + ' · ' + cistern.name} aria-pressed={selected.id === cistern.id && !adding} disabled={adding}
            aria-describedby={preview?.id === cistern.id ? previewId : undefined}
            onPointerEnter={event => { if (event.pointerType !== 'touch' && !adding) startPreview(cistern.id) }} onPointerLeave={endPreview}
            onFocus={event => { if (event.currentTarget.matches(':focus-visible')) setFocusedId(cistern.id) }}
            onBlur={() => setFocusedId(undefined)}
            onClick={() => { setSelectedId(cistern.id); setNotice('') }}><Droplet size={16} /><span>{cistern.id}</span></button>)}
          {preview && <CisternPreview id={previewId} cistern={preview} onEnter={() => startPreview(preview.id)} onLeave={endPreview} />}
          {adding && pinPlaced && <span className="cistern-draft-pin" style={project(location)} aria-hidden="true"><MapPin size={21} /></span>}
          <a className="cistern-attribution" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" onClick={event => event.stopPropagation()}>© OpenStreetMap contributors <ExternalLink size={11} /></a>
        </div>
        <div className="cistern-bar cistern-legend"><span><i /> Relevé reçu</span><span><i /> Relevé en attente</span><span>Emplacements fictifs</span></div>
      </section>}

      <aside id="cistern-sidebar" className={directory ? 'cistern-sidebar' : 'panel cistern-sidebar'}>
        {adding && !directory ? <form className="cistern-registration" lang="fr" onSubmit={addCistern}>
          <h2>Nouvelle فاسقية</h2>
          <label>Nom de la citerne<input name="name" placeholder="Ex. Citerne de la médina" required maxLength={60} /></label>
          <div className="cistern-form-pair">
            <label>Latitude<input value={latitude} onChange={event => setLatitude(event.target.value)} inputMode="decimal" type="number" step="any" placeholder="35.506000" required /></label>
            <label>Longitude<input value={longitude} onChange={event => setLongitude(event.target.value)} inputMode="decimal" type="number" step="any" placeholder="11.076000" required /></label>
          </div>
          <label>Capacité (L)<input name="capacity" type="number" inputMode="numeric" min="1" max="1000000" step="1" placeholder="2 000" required /></label>
          <label>Diamètre (m), facultatif<input name="diameter" type="number" inputMode="decimal" min="0.01" step="any" placeholder="1,6" /></label>
          <label>Identifiant du capteur<input name="sensor" placeholder="Ex. WOKWI-04" maxLength={32} required /></label>
          {error && <p className="cistern-error" role="alert">{error}</p>}
          <button type="submit" className="button primary"><Check size={17} /> Enregistrer et associer</button>
        </form> : directory ? <div className="cistern-directory-content" lang="fr">
          <div className="panel"><div className="cistern-inventory-heading"><h2>{cisterns.length} citernes cartographiées</h2><p>{liveRegistry ? 'FQ-001 à FQ-003 suivent les trois bassins KIZUNA. Les autres fiches suivent leur propre capteur.' : 'Inventaire pilote. L’équipe évoque 360 citernes, un total à vérifier sur le terrain.'}</p></div>
          <ul className="cistern-list" aria-label="Citernes cartographiées">
            {cisterns.map(cistern => <li key={cistern.id}><a href={'#/reserves/' + cistern.id} aria-current={cistern.id === selected.id ? 'true' : undefined} onClick={() => { setSelectedId(cistern.id); setNotice('') }}>
              <span className="cistern-list-icon" data-ready={Boolean(cistern.reading)}><Droplet size={16} /></span>
              <span><strong>{cistern.name}</strong><small>{cistern.id} · {cistern.sensorId}</small></span>
              <span>{cistern.reading ? formatLiters(cistern.reading.liters) : 'En attente'}</span>
            </a></li>)}
          </ul></div>
          <section className="panel cistern-reading" aria-labelledby="cistern-reading-title">
            <div className="cistern-reading-heading"><h2 id="cistern-reading-title">{selected.name}</h2><Radio size={17} /></div>
            <p>{selected.sensorId} · {selected.reading ? 'Relevé du ' + readingDate.format(selected.reading.at) : 'Associé · Premier relevé en attente'}</p>
            <CisternFacts cistern={selected} />
            {managed ? <p>Mesures et dimensions fournies par KIZUNA. <a href="#/simulation">Ouvrir la simulation</a></p> : <><form key={selected.id} onSubmit={simulateReading}>
              <label>Volume simulé (L)<input name="liters" type="number" inputMode="decimal" min="0" max={selected.capacity} step="0.1" required defaultValue={selected.reading?.liters ?? Math.floor(selected.capacity / 2)} /></label>
              <button type="submit" className="button secondary">Envoyer le relevé</button>
            </form>
            <form className="cistern-diameter-form" key={'diameter-' + selected.id + '-' + selected.diameter} onSubmit={changeDiameter}>
              <label>Diamètre (m), facultatif<input name="diameter" type="number" inputMode="decimal" min="0.01" step="any" defaultValue={selected.diameter} /></label>
              <button type="submit" className="button secondary">Enregistrer le diamètre</button>
            </form></>}
          </section>
        </div> :
          <section className="cistern-reading" aria-labelledby="map-selection-title">
            <div className="cistern-reading-top">
              <div>
                <div className="cistern-reading-heading"><Droplet size={17} /><h2 id="map-selection-title">{selected.name}</h2></div>
                <p>{selected.id} · {selected.reading ? 'Relevé du ' + readingDate.format(selected.reading.at) : 'Premier relevé en attente'}</p>
              </div>
              <a className="button secondary" href={'#/reserves/' + selected.id}>Consulter la citerne <ArrowRight size={15} /></a>
            </div>
            <CisternFacts cistern={selected} />
            {selectedFill !== null && <div className="cistern-fill">
              <label htmlFor="cistern-fill">Remplissage <span>{selectedFill.toLocaleString('fr-TN', { maximumFractionDigits: 1 })} %</span></label>
              <meter id="cistern-fill" min={0} max={100} value={selectedFill} />
            </div>}
          </section>
        }
        {notice && <p className="cistern-notice" role="status">{notice}</p>}
      </aside>
      {!directory && !adding && <section className="panel operations-queue" aria-labelledby="operations-queue-title">
        <div className="operations-queue-heading"><h2 id="operations-queue-title">Incidents du réseau</h2><a href="#/incidents">Ouvrir le journal <ArrowRight size={14} /></a></div>
        <p className="operations-clear">{networkIncidents ? networkIncidents + ' incident(s) technique(s) à suivre.' : 'Aucune alerte technique KIZUNA active.'}</p>
      </section>}
    </div>
    {directory && <ReservePlanner cisterns={cisterns} protectedLiters={protectedLiters} power={power} />}
  </section>
}

function CisternFacts({ cistern }: { cistern: Cistern }) {
  return <dl>
    <div><dt>Volume stocké</dt><dd>{cistern.reading === null ? 'Sans relevé' : formatLiters(cistern.reading.liters)}</dd></div>
    <div><dt>Capacité maximale</dt><dd>{formatLiters(cistern.capacity)}</dd></div>
    <div><dt>Diamètre</dt><dd>{formatDiameter(cistern.diameter)}</dd></div>
    <div><dt>Place restante</dt><dd>{freeCapacity(cistern)}</dd></div>
  </dl>
}

function CisternPreview({ id, cistern, onEnter, onLeave }: { id: string; cistern: Cistern; onEnter: () => void; onLeave: () => void }) {
  const tooltip = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const element = tooltip.current
    const frame = element?.parentElement
    if (!element || !frame) return
    const { left, top } = project(cistern)
    function reposition() {
      if (!element || !frame) return
      const pinX = parseFloat(left) * frame.clientWidth / 100
      const pinY = parseFloat(top) * frame.clientHeight / 100
      const width = element.offsetWidth
      const height = element.offsetHeight
      const gap = 21
      const margin = 7
      const y = pinY - height - gap >= margin ? pinY - height - gap : pinY + gap
      element.style.left = Math.max(margin, Math.min(pinX - width / 2, frame.clientWidth - width - margin)) + 'px'
      element.style.top = Math.max(margin, Math.min(y, frame.clientHeight - height - margin)) + 'px'
    }
    reposition()
    const resize = new ResizeObserver(reposition)
    resize.observe(frame)
    resize.observe(element)
    return () => resize.disconnect()
  }, [cistern])

  const fill = cistern.reading === null ? null : cistern.reading.liters / cistern.capacity * 100
  return <div ref={tooltip} id={id} className="cistern-preview" role="tooltip" onPointerEnter={onEnter} onPointerLeave={onLeave}>
    <div className="cistern-preview-title"><Droplet size={16} /><strong>{cistern.name}</strong><span>{cistern.id}</span></div>
    <CisternFacts cistern={cistern} />
    {fill !== null && <div className="cistern-preview-fill"><meter min={0} max={100} value={fill} aria-label="Remplissage" /><span>{Math.round(fill)} %</span></div>}
    <p>{cistern.sensorId} · {cistern.reading ? 'Relevé du ' + readingDate.format(cistern.reading.at) : 'Premier relevé en attente'}</p>
  </div>
}
