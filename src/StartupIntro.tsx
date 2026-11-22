import { ArrowRight, Droplet } from 'lucide-react'
import { useLayoutEffect, useRef } from 'react'
import type { CSSProperties } from 'react'
import { demoCisterns, project } from './cisterns.ts'
import './startup-intro.css'

const duration = 6020
const impactTime = 1880
const basins = demoCisterns()

const particles = Array.from({ length: 56 }, (_, index) => ({
  angle: index * 2.399963,
  speed: 0.22 + ((index * 19) % 29) / 44,
  size: 0.6 + (index % 5) * .22,
}))

function drawSplash(ctx: CanvasRenderingContext2D, width: number, height: number, time: number) {
  ctx.clearRect(0, 0, width, height)
  const x = width / 2
  const y = height / 2
  const reach = Math.min(width, height) * .53
  for (let index = 0; index < 5; index++) {
    const age = (time - index * .093) / 1.27
    if (age <= 0 || age >= 1) continue
    const radius = 10 + Math.pow(age, .64) * reach
    ctx.strokeStyle = `rgba(154, 244, 220, ${(1 - age) * (1 - age) * .78})`
    ctx.lineWidth = 1 + (1 - age) * 2
    ctx.beginPath()
    ctx.ellipse(x, y, radius, radius * .36, -.10, 0, Math.PI * 2)
    ctx.stroke()
  }
  const age = time / .84
  if (age < 0 || age > 1) return
  ctx.fillStyle = `rgba(219, 255, 232, ${(1 - age) * .8})`
  for (const { angle, speed, size } of particles) {
    const distance = age * reach * speed
    ctx.beginPath()
    ctx.arc(x + Math.cos(angle) * distance, y + Math.sin(angle) * distance * .4 - Math.sin(age * Math.PI) * 21 * speed, size, 0, 2 * Math.PI)
    ctx.fill()
  }
}

export function StartupIntro({ onFinish }: { onFinish: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const splash = useRef<HTMLCanvasElement>(null)
  const droplet = useRef<HTMLCanvasElement>(null)

  useLayoutEffect(() => {
    const element = dialog.current
    if (!element) return
    element.showModal()
    const oldOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const timer = window.setTimeout(onFinish, duration)
    const started = performance.now()
    const canvas = splash.current
    const context = canvas?.getContext('2d')
    let frame = 0
    let splashTimer = 0
    let dropFrame = 0
    let disposeDrop: (() => void) | undefined
    let cancelled = false
    const dropCanvas = droplet.current
    if (dropCanvas) {
      void import('./intro-droplet.ts').then(({ createDroplet }) => {
        if (cancelled || performance.now() - started > 1100) return
        const renderer = createDroplet(dropCanvas)
        if (!renderer) return
        disposeDrop = renderer.dispose
        const paintDrop = renderer.draw
        let last = -Infinity
        function draw(now: number) {
          const elapsed = now - started
          if (elapsed > 1640) return
          if (now - last >= 30) {
            paintDrop(elapsed / 1000)
            last = now
          }
          dropFrame = requestAnimationFrame(draw)
        }
        element.dataset.glass = 'true'
        dropFrame = requestAnimationFrame(draw)
      }).catch(() => { /* The CSS droplet is already visible. */ })
    }
    if (canvas && context) {
      const paint = context
      const { width, height } = canvas.getBoundingClientRect()
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5)
      canvas.width = Math.round(width * pixelRatio)
      canvas.height = Math.round(height * pixelRatio)
      context.scale(pixelRatio, pixelRatio)
      const impactAt = started + impactTime
      function step(now: number) {
        const elapsed = (now - impactAt) / 1000
        drawSplash(paint, width, height, elapsed)
        if (elapsed < 1.65) frame = requestAnimationFrame(step)
      }
      splashTimer = window.setTimeout(() => { frame = requestAnimationFrame(step) }, impactTime - 25)
    }
    return () => {
      window.clearTimeout(timer)
      window.clearTimeout(splashTimer)
      cancelled = true
      cancelAnimationFrame(frame)
      cancelAnimationFrame(dropFrame)
      disposeDrop?.()
      element.close()
      document.body.style.overflow = oldOverflow
    }
  }, [onFinish])

  return <dialog ref={dialog} className="fas-intro" data-full-motion aria-labelledby="fas-intro-title" onCancel={event => { event.preventDefault(); onFinish() }}>
    <div className="fas-intro-stage" aria-hidden="true">
      <div className="fas-intro-coast" />
      <div className="fas-intro-macro">
        <div className="fas-intro-optics" />
        <div className="fas-intro-macro-drop">
          <div />
          <canvas ref={droplet} width={400} height={440} />
        </div>
        <div className="fas-intro-macro-caption">A drop of resilience</div>
      </div>
      <div className="fas-intro-water">
        <div className="fas-intro-drop" />
        <canvas ref={splash} />
      </div>
      <div className="fas-intro-atlas">
        <div className="fas-intro-atlas-grid" />
        <div className="fas-intro-scanner" />
        {basins.map((basin, index) => <span key={basin.id} className="fas-intro-point" style={{ ...project(basin), '--ping': 3.68 + index * .25 + 's' } as CSSProperties}>
          <i /><small>{basin.id}</small>
        </span>)}
      </div>
      <div className="fas-intro-grade" />
    </div>
    <div className="fas-intro-layout">
      <div className="fas-intro-top">
        <span className="fas-intro-place"><Droplet size={15} /> BORJ RÂS <i /> MAHDIA</span>
        <button className="fas-intro-skip" type="button" autoFocus onClick={onFinish}>Skip intro <ArrowRight size={15} /></button>
      </div>
      <div className="fas-intro-copy">
        <h1 id="fas-intro-title"><span>FAS9IA</span></h1>
        <p>Water resilience pilot</p>
      </div>
      <div className="fas-intro-footer"><span role="status">Opening workspace</span><span className="fas-intro-credit">© OpenStreetMap contributors</span></div>
      <div className="fas-intro-edge" aria-hidden="true" />
    </div>
  </dialog>
}
