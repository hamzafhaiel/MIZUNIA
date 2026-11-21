import { CloudRain, Droplet, Focus, Layers3, LocateFixed, Maximize2, Minimize2, ScanLine, TriangleAlert } from 'lucide-react'
import { Component, lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import type { DashboardState } from '../model.ts'
import { basinIds, siteBasins } from './config.ts'
import type { BasinId, Mode } from './config.ts'
import { deriveTwinState, getBasinReading } from './state.ts'

const TwinCanvas = lazy(() => import('./TwinCanvas.tsx'))
const debug = new URLSearchParams(window.location.search).has('debug')
const fallbackQuery = '(max-width: 620px)'
const modes = [
  { id: 'neighborhood', label: 'Neighborhood', icon: Layers3 },
  { id: 'inspection', label: 'Inspection', icon: Focus },
  { id: 'cutaway', label: 'Cutaway', icon: ScanLine },
] as const

class TwinBoundary extends Component<{ children: ReactNode; fallback: ReactNode; onError: () => void }, { broken: boolean }> {
  state = { broken: false }
  static getDerivedStateFromError() { return { broken: true } }
  componentDidCatch() { this.props.onError() }
  render() { return this.state.broken ? this.props.fallback : this.props.children }
}

interface TwinViewProps {
  state: DashboardState
  selected: BasinId
  annexVolume: number
  mode: Mode
  raining: boolean
  onMode: (mode: Mode) => void
  onPick: (id: BasinId) => void
}

export function TwinView({ state, selected, annexVolume, mode, raining, onMode, onPick }: TwinViewProps) {
  const mount = useRef<HTMLDivElement>(null)
  const viewport = useRef<HTMLElement>(null)
  const expandControl = useRef<HTMLButtonElement>(null)
  const frameRef = useRef<HTMLSpanElement>(null)
  const labelRefs = useRef<Partial<Record<BasinId | 'zone' | 'level', HTMLElement>>>({})
  const [inView, setInView] = useState(true)
  const [visibleDocument, setVisibleDocument] = useState(!document.hidden)
  const [lightweight, setLightweight] = useState(() => window.matchMedia(fallbackQuery).matches)
  const [scenePreference, setScenePreference] = useState<boolean | null>(null)
  const [contextLost, setContextLost] = useState(false)
  const [reset, setReset] = useState(0)
  const [hovered, setHovered] = useState<BasinId | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [slotHeight, setSlotHeight] = useState(0)
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)

  useEffect(() => {
    const media = window.matchMedia(fallbackQuery)
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => {
      setLightweight(media.matches)
      setReduced(motion.matches)
    }
    const visibility = () => setVisibleDocument(!document.hidden)
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting))
    if (mount.current) observer.observe(mount.current)
    media.addEventListener('change', update)
    motion.addEventListener('change', update)
    document.addEventListener('visibilitychange', visibility)
    return () => {
      observer.disconnect()
      media.removeEventListener('change', update)
      motion.removeEventListener('change', update)
      document.removeEventListener('visibilitychange', visibility)
    }
  }, [])

  function toggleExpanded() {
    if (expanded) {
      setExpanded(false)
      return
    }
    setSlotHeight(viewport.current?.getBoundingClientRect().height ?? 0)
    setExpanded(true)
    if (mode === 'neighborhood') onMode('inspection')
  }

  useLayoutEffect(() => {
    if (!expanded || !viewport.current) return
    const oldOverflow = document.body.style.overflow
    const active = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const changed: HTMLElement[] = []
    for (let node: HTMLElement | null = viewport.current; node && node !== document.body; node = node.parentElement) {
      for (const sibling of Array.from(node.parentElement?.children ?? [])) {
        if (sibling !== node && sibling instanceof HTMLElement && !sibling.inert) {
          sibling.inert = true
          changed.push(sibling)
        }
      }
    }
    document.body.style.overflow = 'hidden'
    expandControl.current?.focus({ preventScroll: true })
    return () => {
      changed.forEach(element => { element.inert = false })
      document.body.style.overflow = oldOverflow
      if (active && active !== document.body && active.isConnected) active.focus({ preventScroll: true })
    }
  }, [expanded])

  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      if (event.defaultPrevented || event.repeat || event.altKey || event.ctrlKey || event.metaKey
        || (event.target instanceof HTMLElement && event.target.closest('input, textarea, select, [contenteditable]'))
        || document.querySelector('dialog[open]')) return
      if (event.key === 'Escape' && expanded) {
        event.preventDefault()
        setExpanded(false)
      } else if (!expanded && !(event.target instanceof Node && viewport.current?.contains(event.target))) {
        return
      } else if (event.key.toLowerCase() === 'f') {
        event.preventDefault()
        toggleExpanded()
      } else {
        const next = modes[Number(event.key) - 1]
        if (next) { event.preventDefault(); onMode(next.id) }
      }
    }
    document.addEventListener('keydown', shortcut)
    return () => document.removeEventListener('keydown', shortcut)
  })

  const readings = useMemo(() => ({
    'B-01': getBasinReading(state, 'B-01', annexVolume),
    'B-02': getBasinReading(state, 'B-02', annexVolume),
  }), [state, annexVolume])
  const visualState = deriveTwinState(state)
  const lost = useCallback(() => setContextLost(true), [])
  const useScene = (scenePreference ?? !lightweight) && !contextLost
  const overlayState = visualState.outage ? 'Zone A · Low pressure' : visualState.unknown ? 'Supply unknown' : 'Supply normal'
  const schematic = <Schematic mode={mode} id={selected} reading={readings[selected]} outage={visualState.outage} onPick={onPick} />

  return <div className="twin-slot" style={expanded && slotHeight ? { minHeight: slotHeight } : undefined}>
  <section ref={viewport} className={'panel twin-panel' + (expanded ? ' twin-expanded' : '')} role={expanded ? 'dialog' : undefined} aria-modal={expanded ? true : undefined} aria-label="Interactive digital twin">
    <div className="twin-heading">
      <label className="asset-select"><span>Asset</span><select value={selected} onChange={event => onPick(event.target.value as BasinId)}>{basinIds.map(id => <option key={id} value={id}>{siteBasins[id].name}</option>)}</select></label>
      <div className="twin-modes" aria-label="Twin camera mode">
        {modes.map(({ id, icon: Icon, label }, index) => <button key={id} title={label + ' (' + (index + 1) + ')'} aria-keyshortcuts={String(index + 1)} aria-pressed={mode === id} onClick={() => onMode(id)}><Icon size={15} />{label}</button>)}
        <button ref={expandControl} type="button" className="expand-twin" aria-label={expanded ? 'Close expanded inspection' : 'Expand 3D inspection'} aria-keyshortcuts={expanded ? 'Escape F' : 'F'} aria-pressed={expanded} title={expanded ? 'Exit inspection (Esc)' : 'Expand inspection (F)'} onClick={toggleExpanded}>{expanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}</button>
      </div>
    </div>
    <div className={'twin-stage' + (hovered && useScene ? ' has-hover' : '')} ref={mount}>
      {useScene ? <TwinBoundary fallback={schematic} onError={lost}>
        <Suspense fallback={<div className="twin-message" role="status">Loading the 3D site…</div>}>
          <TwinCanvas mode={mode} selected={selected} hovered={hovered} reset={reset} reduced={reduced} visible={inView && visibleDocument} readings={readings}
            state={visualState} raining={raining} frameRef={debug ? frameRef : undefined} labelRefs={labelRefs}
            onPick={onPick} onHover={setHovered} onContextLost={lost} />
        </Suspense>
      </TwinBoundary> : schematic}
      {useScene && <div className="world-labels">
        {basinIds.filter(id => mode !== 'cutaway' || id !== selected).map(id => <button type="button" key={id} className={'world-basin world-pick' + (selected === id ? ' picked' : '')}
          ref={node => { if (node) labelRefs.current[id] = node; else delete labelRefs.current[id] }}
          aria-label={'Inspect ' + readings[id].name} onClick={() => onPick(id)} onPointerEnter={() => setHovered(id)} onPointerLeave={() => setHovered(null)}>
          <i /><b>{id}</b><span>{readings[id].volume.toFixed(1)} m³</span>
        </button>)}

        {mode === 'cutaway' && <div className="waterline-note" ref={node => { if (node) labelRefs.current.level = node; else delete labelRefs.current.level }}>
          <span>{readings[selected].ratio > 0 ? 'WATERLINE' : 'EMPTY BASIN'}</span>
          <strong>{(siteBasins[selected].depth * readings[selected].ratio).toFixed(2)} m</strong>
        </div>}
      </div>}
      <div className="twin-top-overlay">
        <span className={visualState.outage ? 'scene-chip warning' : 'scene-chip'}>
          {visualState.outage ? <TriangleAlert size={14} /> : <i />}{overlayState}
        </span>
        <div className="scene-tools">
          <button type="button" className="scene-icon" title="Reset camera" aria-label="Reset camera" onClick={() => setReset(value => value + 1)} disabled={!useScene}><LocateFixed size={17} /></button>
        </div>
      </div>
      {visualState.route && <span className="scene-route-tag"><i /> Approved route · simulated</span>}
      {raining && <span className="scene-rain-tag"><CloudRain size={14} /> Rainfall simulation</span>}
      <div className="twin-bottom-overlay">
        <span className="scene-help">{useScene ? 'Drag to orbit · Scroll to zoom' : contextLost ? '3D unavailable' : 'Schematic view'}</span>
      </div>
      {mode === 'cutaway' && <span className="section-legend">Below grade <i /> Inlet and outlet section</span>}
      {debug && <div className="scene-debug">
        {useScene ? <span className="frame-metrics" ref={frameRef} /> : <span>Schematic view · GPU renderer paused</span>}
        <span>Selected {selected} · {mode}</span>
      </div>}
    </div>
    <div className="twin-footer">
      <span className="twin-caption">Modeled site · Simulated telemetry</span>
      {!contextLost && <button className="twin-toggle" onClick={() => setScenePreference(!useScene)}>{useScene ? 'Use schematic' : 'Enable 3D'}</button>}
    </div>
  </section></div>
}

function Schematic({ mode, id, reading, outage, onPick }: {
  mode: Mode; id: BasinId; reading: ReturnType<typeof getBasinReading>; outage: boolean; onPick: (id: BasinId) => void
}) {
  if (mode === 'cutaway') return <div className="fallback-cutaway">
    <div className="tank" role="img" aria-label={siteBasins[id].name + ' filled to ' + Math.round(reading.ratio * 100) + ' percent'}>
      <div className="tank-water" style={{ '--fill': (reading.ratio * 100) + '%' } as CSSProperties} /><span className="tank-volume">{reading.volume.toFixed(1)} <small>m³</small></span>
    </div>
  </div>
  return <div className={'schematic ' + mode}>
    <img src={import.meta.env.BASE_URL + 'borj-eras.png'} alt="Illustrative coastal model of the Borj Eras pilot site" />
    {outage && <span className="schematic-outage" />}
    {basinIds.map(basin => <button key={basin} className={'schematic-marker ' + basin} aria-label={'Inspect ' + siteBasins[basin].name} aria-pressed={id === basin} onClick={() => onPick(basin)}><Droplet size={14} />{basin}</button>)}
  </div>
}
