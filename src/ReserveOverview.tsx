import { ChartNoAxesCombined, Droplet, Fuel } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { Cistern } from './cisterns.ts'
import { estimateReserves } from './reserve-estimates.ts'
import { TankGauge } from './TankGauge.tsx'
import { resourceNumber } from './generator.ts'
import type { useKizuna } from './useKizuna.ts'
import './reserves-overview.css'

const number = new Intl.NumberFormat('fr-TN', { maximumFractionDigits: 1 })
const powerNumber = new Intl.NumberFormat('fr-TN', { maximumFractionDigits: 2 })
const percentage = new Intl.NumberFormat('fr-TN', { style: 'percent', maximumFractionDigits: 1 })
const format = (value: number | null, unit: string) => value === null ? '—' : number.format(value) + ' ' + unit
const formatPower = (value: number | null, unit: string) => value === null ? '—' : powerNumber.format(value) + ' ' + unit

function inventory(cisterns: Cistern[]) {
  const measured = cisterns.filter(cistern => cistern.reading !== null)
  return {
    measuredCount: measured.length,
    measuredLiters: measured.reduce((sum, cistern) => sum + (cistern.reading?.liters ?? 0), 0),
    measuredCapacity: measured.reduce((sum, cistern) => sum + cistern.capacity, 0),
    capacity: cisterns.reduce((sum, cistern) => sum + cistern.capacity, 0),
  }
}

export function ReserveOverview({ cisterns, selectedId }: { cisterns: Cistern[]; selectedId: string }) {
  const totals = inventory(cisterns)
  return <section className="panel reserve-overview" aria-labelledby="reserve-overview-title">
    <h2 id="reserve-overview-title"><Droplet size={19} /> Niveau des fasqiyas</h2>
    <dl className="reserve-metrics">
      <div><dt>Stock relevé</dt><dd>{format(totals.measuredCount ? totals.measuredLiters : null, 'L')}</dd></div>
      <div><dt>Capacité du parc</dt><dd>{format(totals.capacity, 'L')}</dd></div>
      <div><dt>Remplissage des citernes suivies</dt><dd>{totals.measuredCapacity ? percentage.format(totals.measuredLiters / totals.measuredCapacity) : '—'}</dd></div>
      <div><dt>Citernes avec relevé</dt><dd>{totals.measuredCount} / {cisterns.length}</dd></div>
    </dl>
    <ul className="reserve-gauges">
      {cisterns.map(cistern => <li key={cistern.id}>
        <a href={'#/reserves/' + cistern.id} aria-current={selectedId === cistern.id ? 'true' : undefined}>
          <TankGauge label={cistern.name} volume={cistern.reading?.liters ?? null} max={cistern.capacity} unit="L" />
          <span>{cistern.id} · {cistern.sensorId}</span>
        </a>
      </li>)}
    </ul>
  </section>
}

const defaultInputs = { dailyUse: '400', minimum: '200' }
const milestones = [0, 1, 3, 7]
const waterTips = {
  coverage: 'Un nouveau relevé affinera l’estimation du stock utilisable.',
  consumption: 'Le graphique suit la baisse du stock au rythme de consommation saisi.',
  reserve: 'Le stock à conserver est déduit avant de calculer l’autonomie.',
}
const powerTips = {
  fuel: 'L’autonomie dépend du carburant restant et de la consommation à cette charge.',
  load: 'Les kWh correspondent à la puissance utilisée multipliée par l’autonomie.',
  pump: 'Le volume pompable est limité par l’eau utilisable et la durée de fonctionnement.',
}

export type ReserveGenerator = Pick<ReturnType<typeof useKizuna>, 'generator' | 'generatorSettings' | 'setGeneratorField'>

export function ReservePlanner({ cisterns, protectedLiters = 0, power }: {
  cisterns: Cistern[]; protectedLiters?: number; power: ReserveGenerator
}) {
  const [inputs, setInputs] = useState(defaultInputs)
  const { generator, generatorSettings, setGeneratorField } = power
  const [tips, setTips] = useState<{ snapshot: string; water: keyof typeof waterTips; power: keyof typeof powerTips }>()
  const { measuredLiters, measuredCount } = inventory(cisterns)
  const dailyUse = resourceNumber(inputs.dailyUse)
  const tank = generator.tank
  const fuel = resourceNumber(generatorSettings.fuel)
  const minimum = resourceNumber(inputs.minimum)
  const estimate = estimateReserves({ measuredLiters, dailyUse, tank, fuel,
    minimum: minimum === null ? null : Math.max(minimum, protectedLiters),
    burn: resourceNumber(generatorSettings.burn), load: resourceNumber(generatorSettings.load), pump: resourceNumber(generatorSettings.pump),
  })
  const usable = measuredCount ? estimate.usable : null
  const days = measuredCount ? estimate.days : null
  const pumpable = measuredCount ? estimate.pumpable : null
  const fuelGauge = generator.fuelInTank
  const snapshot = JSON.stringify({
    stock: measuredCount ? measuredLiters : null, usable, days, fuel: fuelGauge, hours: estimate.runtime, kwh: estimate.energy, pumpable,
    unmeasured: cisterns.length - measuredCount,
  })

  useEffect(() => {
    const controller = new AbortController()
    const timeout = window.setTimeout(async () => {
      try {
        const response = await fetch(import.meta.env.BASE_URL + 'api/reserve-insight', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: snapshot, signal: controller.signal,
        })
        if (response.status !== 200) return
        const data = await response.json()
        if (!controller.signal.aborted && Object.hasOwn(waterTips, data.water) && Object.hasOwn(powerTips, data.power)) {
          setTips({ snapshot, water: data.water, power: data.power })
        }
      } catch {
        // Local estimates and their context remain available.
      }
    }, 900)
    return () => { window.clearTimeout(timeout); controller.abort() }
  }, [snapshot])

  const currentTips = tips?.snapshot === snapshot ? tips : undefined
  const waterTip = currentTips?.water ?? (cisterns.length > measuredCount ? 'coverage' : 'reserve')
  const powerTip = currentTips?.power ?? (estimate.runtime === null ? 'fuel' : pumpable !== null ? 'pump' : 'load')

  function field(key: keyof typeof defaultInputs, label: string) {
    return <label>{label}<input type="number" min={0} max={1_000_000_000} step="any" value={inputs[key]}
      onChange={event => setInputs(previous => ({ ...previous, [key]: event.target.value }))} /></label>
  }

  function generatorField(key: Exclude<keyof typeof generatorSettings, 'fuelType'>, label: string) {
    const flowingFuel = key === 'fuel' && generator.running
    return <label>{label}<input type="number" min={0} max={1_000_000_000} step="any"
      value={flowingFuel && fuel !== null ? Number(fuel.toFixed(2)) : generatorSettings[key]} readOnly={flowingFuel}
      onChange={event => setGeneratorField(key, event.target.value)} /></label>
  }

  return <section className="reserve-planner" aria-labelledby="reserve-planner-title">
    <header><h2 id="reserve-planner-title">Autonomie des ressources</h2><p>Valeurs d’exemple à remplacer par tes relevés et les données de ton groupe électrogène.</p></header>
    <div className="reserve-planner-grid">
      <section className="panel reserve-overview" aria-labelledby="water-plan">
        <h3 id="water-plan"><ChartNoAxesCombined size={18} /> Réserve d’eau</h3>
        <div className="reserve-inputs">{field('dailyUse', 'Consommation quotidienne (L/jour)')}{field('minimum', 'Stock à conserver (L)')}</div>
        {protectedLiters > 0 && <p>Réserve protégée par KIZUNA · {format(protectedLiters, 'L')}.</p>}
        <dl className="reserve-metrics reserve-pair"><div><dt>Eau utilisable estimée</dt><dd>{format(usable, 'L')}</dd></div><div><dt>Autonomie estimée</dt><dd>{format(days, 'jours')}</dd></div></dl>
        <h4>Projection du stock utilisable</h4>
        {usable !== null && dailyUse !== null && dailyUse > 0 ? <ol className="reserve-projection">
          {milestones.map(day => {
            const left = Math.max(0, usable - dailyUse * day)
            return <li key={day}><span>{day === 0 ? 'Aujourd’hui' : 'Jour ' + day}</span><meter min={0} max={Math.max(1, usable)} value={left} aria-label={'Stock utilisable, jour ' + day} /><strong>{format(left, 'L')}</strong></li>
          })}
        </ol> : <p>Renseigne une consommation positive et un stock à conserver.</p>}
        <p>Projection à consommation constante, sans nouvel apport. Les fasqiyas sans relevé sont exclues.</p>
        <p className="reserve-widget-tip">{waterTips[waterTip]}</p>
      </section>
      <section className="panel reserve-overview" id="power-plan" aria-labelledby="power-plan-title">
        <h3 id="power-plan-title"><Fuel size={18} /> Groupe électrogène</h3>
        <p>{generator.running ? 'En marche · ' + formatPower(generator.suppliedW, 'W') + ' fournis aux pompes'
          : fuelGauge === 0 ? 'Réservoir vide' : 'À l’arrêt'} · <a href="#/simulation">Ouvrir les commandes de simulation</a></p>
        <div className="reserve-generator">
          {tank !== null && tank > 0
            ? <TankGauge label={generatorSettings.fuelType} volume={fuelGauge} max={tank} unit="L" kind="fuel" />
            : <p>Indique la capacité du réservoir pour afficher la jauge.</p>}
          <div className="reserve-inputs">
            <label>Carburant<select value={generatorSettings.fuelType} onChange={event => setGeneratorField('fuelType', event.target.value)}><option>Essence</option><option>Diesel</option><option>Autre</option></select></label>
            {generatorField('tank', 'Capacité du réservoir (L)')}{generatorField('fuel', 'Carburant restant (L)')}{generatorField('burn', 'Consommation en marche (L/h)')}
            {generatorField('load', 'Puissance de secours (kW)')}{generatorField('pump', 'Débit de référence de la pompe (L/h)')}
          </div>
        </div>
        {fuel !== null && tank !== null && fuel > tank && <p role="status">Le carburant restant dépasse la capacité saisie.</p>}
        <dl className="reserve-metrics reserve-generator-stats">
          <div><dt>Autonomie moteur</dt><dd>{formatPower(generator.runtime, 'h')}</dd></div>
          <div><dt>Énergie estimée</dt><dd>{formatPower(estimate.energy, 'kWh')}</dd></div>
          <div><dt>Eau pompable estimée</dt><dd>{format(pumpable, 'L')}</dd></div>
        </dl>
        <p>Les estimations utilisent la puissance et le débit de référence saisis. Le volume pompable reste limité par l’eau utilisable.</p>
        <p className="reserve-widget-tip">{powerTips[powerTip]}</p>
      </section>
    </div>
  </section>
}
