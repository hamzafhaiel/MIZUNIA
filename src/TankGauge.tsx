import type { CSSProperties } from 'react'
import './tank-gauge.css'

const number = new Intl.NumberFormat('fr-TN', { maximumFractionDigits: 1 })

export function TankGauge({ label, volume, max, unit = 'm³', kind = 'water' }: { label: string; volume: number | null; max: number; unit?: string; kind?: 'water' | 'fuel' }) {
  const fill = volume === null ? null : volume / max * 100
  return <figure className="simulation-gauge" data-tank-kind={kind}>
    <div className="simulation-tank" role={volume === null ? 'img' : 'meter'}
      aria-label={volume === null ? label + ' · relevé indisponible' : label}
      aria-valuemin={volume === null ? undefined : 0} aria-valuemax={volume === null ? undefined : max}
      aria-valuenow={volume ?? undefined} aria-valuetext={volume === null ? undefined : number.format(volume) + ' / ' + number.format(max) + ' ' + unit}
      style={{ '--tank-fill': (fill ?? 0) + '%' } as CSSProperties}>
      {fill !== null && <span className="simulation-water" />}
      <span className="simulation-depth" aria-hidden="true">{fill === null ? '—' : Math.round(fill) + ' %'}</span>
    </div>
    <figcaption>
      <strong>{label}</strong>
      <span>{volume === null ? 'Sans relevé' : number.format(volume) + ' / ' + number.format(max) + ' ' + unit}</span>
      {volume === null && <span>Capacité {number.format(max)} {unit}</span>}
    </figcaption>
  </figure>
}
