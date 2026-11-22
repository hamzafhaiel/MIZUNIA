import { Activity, ArrowUpRight, TriangleAlert, Waves } from 'lucide-react'
import { useState } from 'react'

const tests = {
  sensor: { label: 'Test de capteur', detail: 'Pression et connectivité', icon: Activity },
  leak: { label: 'Test de fuite', detail: 'Perte simulée de 1 m³ maximum', icon: TriangleAlert },
  watering: { label: 'Test d’arrosage', detail: 'Un cycle vers le jardin', icon: Waves },
}

export type SimulationTest = keyof typeof tests
type Outcome = 'done' | 'warning' | 'blocked'
export type SimulationResult = {
  id: number
  at: number
  test: SimulationTest
  outcome: Outcome
  message: string
  sensors?: { id: string; pressure: number | null }[]
  volume?: { before: number; after: number; capacity: number }
}

const testIds: SimulationTest[] = ['sensor', 'leak', 'watering']
const outcomeLabel = { done: 'Terminé', warning: 'À vérifier', blocked: 'Non exécuté' }
const measure = new Intl.NumberFormat('fr-TN', { maximumFractionDigits: 1 })
const clock = new Intl.DateTimeFormat('fr-TN', { timeZone: 'Africa/Tunis', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })

export function SimulationDiagnostics({ results, onTest, connectedSensors, sensorCount }: {
  results: SimulationResult[]
  onTest: (test: SimulationTest) => void
  connectedSensors: number
  sensorCount: number
}) {
  const [selectedId, setSelectedId] = useState<number>()
  const selected = results.find(result => result.id === selectedId) ?? results[0]
  const draw = results.reduce((total, { volume }) => total + (volume ? volume.before - volume.after : 0), 0)

  return <section className="panel simulation-card simulation-test-panel" aria-labelledby="sim-tests">
    <h3 id="sim-tests" tabIndex={-1}><Activity size={18} /> Tests des canalisations</h3>
    <dl className="diagnostic-stats">
      <div><dt>Tests lancés</dt><dd>{results.length}</dd></div>
      <div><dt>Capteurs en ligne</dt><dd>{connectedSensors}<small> / {sensorCount}</small></dd></div>
      <div><dt>Volume prélevé par les tests</dt><dd>{measure.format(draw)} <small>m³</small></dd></div>
    </dl>
    <div className="simulation-tests">
      {testIds.map(id => {
        const { label, detail, icon: Icon } = tests[id]
        const last = results.find(result => result.test === id)
        return <article key={id} className="diagnostic-test">
          <div><span className="diagnostic-icon"><Icon size={18} /></span><span className="diagnostic-badge" data-outcome={last?.outcome}>{last ? outcomeLabel[last.outcome] : 'En attente'}</span></div>
          <h4>{label}</h4>
          <p>{detail}</p>
          <button type="button" aria-label={label} onClick={() => { setSelectedId(undefined); onTest(id) }}>Lancer <ArrowUpRight size={15} /></button>
        </article>
      })}
    </div>
    <div className="diagnostic-details">
      <section className="diagnostic-report" aria-labelledby="sim-test-result">
        <h4 id="sim-test-result">{selected ? tests[selected.test].label : 'Résultat du test'}</h4>
        <p className="simulation-result" role="status">{selected?.message ?? 'Lance un test pour consulter ses mesures.'}</p>
        {selected && <ResultMeasurements result={selected} />}
      </section>
      <section className="diagnostic-history" aria-labelledby="sim-test-history">
        <h4 id="sim-test-history">Exécutions récentes</h4>
        {results.length === 0 ? <p>Aucun test lancé.</p> : <ol>
          {results.slice(0, 5).map(result => <li key={result.id}>
            <button type="button" aria-pressed={selected?.id === result.id} onClick={() => setSelectedId(result.id)}>
              <span>{tests[result.test].label}<small>{outcomeLabel[result.outcome]}</small></span>
              <time dateTime={new Date(result.at).toISOString()}>{clock.format(result.at)}</time>
            </button>
          </li>)}
        </ol>}
      </section>
    </div>
  </section>
}

function ResultMeasurements({ result }: { result: SimulationResult }) {
  if (result.sensors) {
    const max = Math.max(3, ...result.sensors.map(sensor => sensor.pressure ?? 0))
    return <ul className="diagnostic-measures">
      {result.sensors.map(({ id, pressure }) => <li key={id}>
        {pressure === null
          ? <div className="diagnostic-reading"><span>{id}</span><strong>Hors ligne</strong></div>
          : <ReadingBar label={id} value={pressure} max={max} unit="bar" />}
      </li>)}
    </ul>
  }
  if (!result.volume) return null
  const { before, after, capacity } = result.volume
  return <ul className="diagnostic-measures">
    <li><ReadingBar label="Volume avant" value={before} max={capacity} unit="m³" /></li>
    <li><ReadingBar label="Volume après" value={after} max={capacity} unit="m³" /></li>
  </ul>
}

function ReadingBar({ label, value, max, unit }: { label: string; value: number; max: number; unit: string }) {
  return <>
    <div className="diagnostic-reading"><span>{label}</span><strong>{measure.format(value)} {unit}</strong></div>
    <meter aria-label={label} aria-valuetext={measure.format(value) + ' ' + unit} min={0} max={max} value={value} />
  </>
}
