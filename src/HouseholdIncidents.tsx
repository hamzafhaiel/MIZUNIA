import { ArrowLeft, ArrowRight, Check, Droplet, House, Plus } from 'lucide-react'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { Badge, formatTime } from './components.tsx'
import { areaIds, areas, canRecordPickup, homes, pickupLiters, reserveRemaining } from './households.ts'
import type { AreaId, Assistance, HomeId, HouseholdReport, HouseholdState, Issue } from './households.ts'
import './households.css'

const homeIds = Object.keys(homes) as HomeId[]
const issueTimes = ['Within the last hour', '1–6 hours ago', '6–24 hours ago', 'More than 24 hours ago', 'Unknown']

export function ReportWaterCut({ state, phone, onSubmit }: {
  state: HouseholdState
  phone: boolean
  onSubmit: (home: HomeId, issue: Issue, started: string, channel: HouseholdReport['channel']) => string
}) {
  const [reference, setReference] = useState('')
  const [tracking, setTracking] = useState('')
  const [showTracking, setShowTracking] = useState(false)
  const matched = state.reports.find(report => report.id === tracking)

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const fields = new FormData(event.currentTarget)
    setReference(onSubmit(fields.get('home') as HomeId, fields.get('issue') as Issue, String(fields.get('started')), phone ? 'Phone intake' : 'Resident form'))
  }

  return <div className="household-workspace household-form-page">
    <a href="#/incidents" className="household-back"><ArrowLeft size={16} /> Incidents</a>
    <section className="panel household-form-card">
      <div className="household-form-heading"><span className="household-symbol"><House size={24} /></span><div>
        <span className="command-location">Borj Eras <i /> Mahdia</span>
        <h1>{phone ? 'Log a phone report' : 'Report a water cut'}</h1>
      </div></div>
      {reference ? <div className="report-receipt" role="status">
        <h2><Check size={20} /> Report registered</h2>
        <p>Keep this reference to check the case. Repeat reports for the same demo household use its existing reference.</p>
        <strong className="tracking-code">{reference}</strong>
        <a href={'#/incidents/' + reference} className="button primary">View report <ArrowRight size={16} /></a>
      </div> : <form className="report-form" onSubmit={submit}>
        <p>Choose a fictional household to report an interruption. Reports stay in this demo browser.</p>
        <label>Household<select defaultValue="" name="home" required>
          <option value="" disabled>Select a demo household</option>
          {areaIds.map(area => <optgroup key={area} label={areas[area].name}>
            {homeIds.filter(id => homes[id].area === area).map(id => <option key={id} value={id}>House {id}</option>)}
          </optgroup>)}
        </select></label>
        <div className="report-form-columns">
          <label>Water supply<select name="issue"><option>No water</option><option>Low pressure</option></select></label>
          <label>When did it start?<select name="started">{issueTimes.map(time => <option key={time}>{time}</option>)}</select></label>
        </div>
        <button type="submit" className="button primary">{phone ? 'Save phone report' : 'Submit report'} <ArrowRight size={16} /></button>
      </form>}
      <details className="report-tracking">
        <summary>Track an existing report</summary>
        <form onSubmit={event => {
          event.preventDefault()
          setTracking(String(new FormData(event.currentTarget).get('reference')).trim().toUpperCase())
          setShowTracking(true)
        }}>
          <label><span className="sr-only">Tracking code</span><input name="reference" placeholder="e.g. BR-101" required /></label>
          <button className="button secondary" type="submit">Check status</button>
        </form>
        {showTracking && <p role="status">{matched
          ? matched.assistance ?? (state.confirmed[homes[matched.home].area] ? 'Area outage confirmed in simulation' : 'Report received · Awaiting verification')
          : 'No report found with that reference.'}</p>}
      </details>
    </section>
  </div>
}

export function HouseholdIncidents({ state, reportId, onConfirmation, onAssistance }: {
  state: HouseholdState
  reportId?: string
  onConfirmation: (area: AreaId) => void
  onAssistance: (id: string, assistance: Assistance) => void
}) {
  const initialReport = state.reports.find(report => report.id === reportId)
  const [area, setArea] = useState<AreaId>(() => initialReport ? homes[initialReport.home].area : 'north')
  const [selection, setSelection] = useState(reportId)
  const zone = areas[area]
  const reports = state.reports.filter(report => homes[report.home].area === area)
  const selected = reports.find(report => report.id === selection) ?? reports[0]
  const open = reports.filter(report => !report.assistance).length
  const confirmed = state.confirmed[area]
  const remaining = reserveRemaining(state, area)
  const served = state.reports.filter(report => report.assistance === 'Non-drinking water').length
  const referrals = state.reports.filter(report => report.assistance === 'Drinking-water referral').length

  function chooseArea(id: AreaId) {
    setArea(id)
    setSelection(undefined)
  }

  return <section className="household-workspace" aria-labelledby="household-title">
    <div className="household-title">
      <div><span className="command-location">Borj Eras <i /> Mahdia, Tunisia</span><h1 id="household-title">Water incidents</h1></div>
      <div className="household-title-actions"><a href="#/report/phone" className="button secondary">Log phone report</a><a href="#/report" className="button primary"><Plus size={17} /> Report a water cut</a></div>
    </div>

    <dl className="household-summary">
      <div><dt>Households reporting</dt><dd>{state.reports.length}</dd></div>
      <div><dt>Confirmed areas</dt><dd>{Object.keys(state.confirmed).length}</dd></div>
      <div><dt>Households supplied</dt><dd>{served}</dd></div>
      <div><dt>Drinking-water referrals</dt><dd>{referrals}</dd></div>
    </dl>

    <div className="household-grid">
      <section className="panel household-queue" aria-labelledby="household-queue-title">
        <div className="panel-heading"><div><h2 id="household-queue-title">Household reports</h2><p>{open} awaiting action in {zone.name}</p></div><a className="household-map-link" href="#/map/reports">Show reports on map <ArrowRight size={14} /></a></div>
        <div className="household-area-tabs" aria-label="Filter by service area">
          {areaIds.map(id => <button key={id} type="button" aria-pressed={id === area} onClick={() => chooseArea(id)}>{areas[id].name}</button>)}
        </div>
        <div className="household-area-status">
          <Badge tone={confirmed ? 'red' : open >= 2 ? 'amber' : 'neutral'}>{confirmed ? 'Confirmed in simulation' : open >= 2 ? 'Suspected area outage' : 'Awaiting area verification'}</Badge>
          {reports.length > 0 && !confirmed && <button className="household-text-button" type="button" onClick={() => onConfirmation(area)}>Record simulated confirmation</button>}
          {confirmed && <small>Recorded at {formatTime(confirmed)}</small>}
        </div>
        {reports.length ? <ul className="household-report-list">{reports.map(report => <li key={report.id}>
          <button type="button" aria-pressed={selected?.id === report.id} onClick={() => setSelection(report.id)}>
            <span className="household-row-icon"><House size={16} /></span>
            <span><strong>House {report.home}</strong><small>{report.assistance ?? report.issue}</small></span>
            <time dateTime={new Date(report.submitted).toISOString()}>{formatTime(report.submitted)}</time>
          </button>
        </li>)}</ul> : <p className="household-no-reports">No household reports in this area.</p>}
        {selected && <div className="household-case"><span>{selected.id} · {selected.channel}</span><strong>{selected.started}</strong></div>}
      </section>
    <section className="panel household-response" aria-labelledby="household-response-title">
      <div className="response-area">
        <span className="household-symbol"><Droplet size={21} /></span>
        <div><h2 id="household-response-title">Water assistance · {zone.name}</h2><p>{zone.basin} <b lang="ar" dir="rtl">فاسقية</b> · {zone.status}</p></div>
      </div>
      <dl><dt>Available for non-drinking use</dt><dd>{remaining.toLocaleString('en')} L</dd></dl>
      <div className="response-actions">
        {!selected ? <p>Select a household report to record assistance.</p>
          : selected.assistance ? <p role="status"><Check size={16} /> {selected.assistance} recorded for House {selected.home}.</p>
          : <>
            <p>House {selected.home} · {canRecordPickup(state, area) ? `Simulated pickup at ${zone.basin} · ${pickupLiters} L` : 'Pickup requires area confirmation and an available reserve.'}</p>
            <div><button className="button primary" type="button" disabled={!canRecordPickup(state, area)} onClick={() => onAssistance(selected.id, 'Non-drinking water')}>Record pickup</button>
              <button className="button secondary" type="button" onClick={() => onAssistance(selected.id, 'Drinking-water referral')}>Record drinking-water referral</button></div>
          </>}
      </div>
    </section>
    </div>
  </section>
}
