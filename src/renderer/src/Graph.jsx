import React, { useMemo, useRef, useState, useCallback, useEffect } from 'react'

const W = 1300
const H = 700
const M = { top: 24, right: 50, bottom: 52, left: 74 }
const PW = W - M.left - M.right
const PH = H - M.top - M.bottom

export function smoothPoints(points, octaves) {
  if (octaves <= 0 || !octaves) return points
  const sorted = [...points].sort((a, b) => a[0] - b[0])
  const halfLife = Math.pow(2, octaves / 2)
  return sorted.map(([f, _], i) => {
    let sum = 0
    let wsum = 0
    for (let j = i; j < sorted.length; j++) {
      const [f2, v2] = sorted[j]
      if (f2 / f > halfLife) break
      const w = Math.exp(-Math.abs(Math.log2(f2 / f)) / octaves)
      sum += v2 * w
      wsum += w
    }
    for (let j = i - 1; j >= 0; j--) {
      const [f2, v2] = sorted[j]
      if (f / f2 > halfLife) break
      const w = Math.exp(-Math.abs(Math.log2(f2 / f)) / octaves)
      sum += v2 * w
      wsum += w
    }
    return [f, sum / wsum]
  })
}

export function tiltPoints(points, tiltDbPerOct) {
  if (!tiltDbPerOct) return points
  return points.map(([f, v]) => [f, v + tiltDbPerOct * Math.log2(f / 1000)])
}

export function adjustPoints(points, { tilt = 0, earGain = 0, bass = 0, treble = 0 }) {
  return points.map(([f, v]) => {
    // tilt: dB per octave dari 1kHz (positif = bright)
    let nv = v + tilt * Math.log2(f / 1000)
    // ear gain: gaussian boost centered at 3kHz
    nv += earGain * Math.exp(-Math.pow((Math.log(f / 3000)) / 0.35, 2))
    // bass: shelf — penuh di sub-bass (≤50Hz), fade ke 0 pada ~400Hz
    if (f <= 50) nv += bass
    else if (f < 400) nv += bass * Math.max(0, 1 - Math.log(f / 50) / Math.log(400 / 50))
    // treble: shelf — 0 pada 6kHz ke bawah, naik ke penuh di 12kHz+
    if (f >= 12000) nv += treble
    else if (f > 4000) nv += treble * (Math.log(f / 4000) / Math.log(3))
    return [f, nv]
  })
}

export function toPath(points, xScale, yScale) {
  return points.map(([f, v], i) => `${i === 0 ? 'M' : 'L'}${xScale(f).toFixed(2)},${yScale(v).toFixed(2)}`).join(' ')
}

function interp(points, f) {
  if (f <= points[0][0]) return points[0][1]
  if (f >= points[points.length - 1][0]) return points[points.length - 1][1]
  let lo = 0
  let hi = points.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (points[mid][0] < f) lo = mid
    else hi = mid
  }
  const [f0, v0] = points[lo]
  const [f1, v1] = points[hi]
  if (f1 === f0) return v0  // elak div-by-zero bila freq duplicate
  const t = (Math.log(f) - Math.log(f0)) / (Math.log(f1) - Math.log(f0))
  return v0 + t * (v1 - v0)
}

const X_TICKS = [20, 30, 40, 50, 60, 80, 100, 150, 200, 300, 400, 500, 600, 800, 1000, 1500, 2000, 3000, 4000, 5000, 6000, 8000, 10000, 12000, 15000, 20000]

const BANDS = [
  { name: 'Sub-Bass', from: 20, to: 60 },
  { name: 'Bass', from: 60, to: 250 },
  { name: 'Low Mids', from: 250, to: 500 },
  { name: 'Mids', from: 500, to: 2000 },
  { name: 'Upper Mids', from: 2000, to: 4000 },
  { name: 'Lower Treble', from: 4000, to: 6000 },
  { name: 'Treble', from: 6000, to: 10000 },
  { name: 'Air', from: 10000, to: 20000 }
]

export default function Graph({ curves, target, targetAdj, bounds, xDomain, setXDomain, yDomain, setYDomain, smoothing, normalize, normFreq, normDb, showLabels, inspector, showBands, diff, eqFilters, onEqFilterChange, unitVariance, onContextAction }) {
  const [ctxMenu, setCtxMenu] = useState(null)
  const [draggingFilter, setDraggingFilter] = useState(null)
  const svgRef = useRef(null)
  const [hover, setHover] = useState(null)
  const dragRef = useRef(null)
  const filterDragRef = useRef(null)

  // EQ filter nodes (draggable) — hanya bila ada filters
  const eqNodes = useMemo(() => {
    if (!eqFilters || !eqFilters.length) return []
    return eqFilters
      .map((f, i) => ({ ...f, idx: i }))
      .filter((f) => f.enabled !== false)
  }, [eqFilters])

  const [x0, x1] = xDomain
  const [y0, y1] = yDomain
  const xScale = useCallback((f) => M.left + ((Math.log10(f) - Math.log10(x0)) / (Math.log10(x1) - Math.log10(x0))) * PW, [x0, x1])
  const yScale = useCallback((v) => M.top + ((y1 - v) / (y1 - y0)) * PH, [y0, y1])

  const processed = useMemo(() => {
    const getOffset = (pts) => {
      if (!normalize) return normDb || 0
      const v = interp(pts, normFreq)
      return (normDb || 0) - v
    }
    const list = []
    for (const c of curves) {
      if (c.hidden) continue
      let pts = smoothing > 0 ? smoothPoints(c.points, smoothing) : [...c.points]
      // offset dikira pada processed points (smoothed kalau ada) — konsisten dengan target
      const off = getOffset(pts)
      pts = pts.map(([f, v]) => [f, v + off])
      if (c.eqFilters && c.eqFilters.length) {
        pts = pts.map(([f, v]) => [f, v + (c._eqDbAt ? c._eqDbAt(f) : 0)])
      }
      list.push({ ...c, display: pts.filter(([f]) => f >= x0 * 0.98 && f <= x1 * 1.02) })
    }
    if (target && target.points && target.points.length) {
      let tpts = smoothing > 0 ? smoothPoints(target.points, smoothing) : [...target.points]
      if (targetAdj) tpts = adjustPoints(tpts, targetAdj)
      // normalize offset dikira SEBELUM map (elak mutation race)
      const tOffset = normalize ? (normDb || 0) - interp(tpts, normFreq) : 0
      tpts = tpts.map(([f, v]) => [f, v + tOffset])
      list.push({ ...target, name: target.name, display: tpts.filter(([f]) => f >= x0 * 0.98 && f <= x1 * 1.02), isTarget: true })
    }
    return list
  }, [curves, target, targetAdj, smoothing, normalize, normFreq, normDb, x0, x1])

  const xTicks = useMemo(() => X_TICKS.filter((f) => f >= x0 && f <= x1), [x0, x1])
  const yTicks = useMemo(() => {
    const step = (y1 - y0) / ((y1 - y0) / 5)
    const out = []
    for (let v = Math.ceil(y0 / step) * step; v <= y1; v += step) out.push(v)
    return out
  }, [y0, y1])

  const onWheel = (e) => {
    e.preventDefault()
    const svg = svgRef.current
    const rect = svg.getBoundingClientRect()
    const px = ((e.clientX - rect.left) / rect.width) * W
    const py = ((e.clientY - rect.top) / rect.height) * H
    const fracX = Math.min(1, Math.max(0, (px - M.left) / PW))
    const lf = Math.log10(x0) + fracX * (Math.log10(x1) - Math.log10(x0))
    const factor = e.deltaY > 0 ? 1.2 : 1 / 1.2
    let nx0 = Math.pow(10, lf - (lf - Math.log10(x0)) * factor)
    let nx1 = Math.pow(10, lf + (Math.log10(x1) - lf) * factor)
    nx0 = Math.max(20, nx0)
    nx1 = Math.min(20000, nx1)
    if (nx1 / nx0 < 1.05 || nx1 / nx0 > 1000) return
    // y zoom if ctrl, else x only... simpler: also zoom y
    const fracY = Math.min(1, Math.max(0, (py - M.top) / PH))
    const vy = y0 + fracY * (y1 - y0)
    let ny0 = vy - (vy - y0) * factor
    let ny1 = vy + (y1 - vy) * factor
    if (ny1 - ny0 > 2 && ny1 - ny0 < 120) setYDomain([ny0, ny1])
    setXDomain([nx0, nx1])
  }

  const onMouseDown = (e) => {
    if (ctxMenu) {
      // click di luar menu tutup dia
      if (!e.target.closest('.ctx-menu')) setCtxMenu(null)
      return
    }
    if (e.button === 0) {
      dragRef.current = { startX: e.clientX, startY: e.clientY, x0, x1, y0, y1 }
    }
  }

  const onFilterNodeDown = (e, idx) => {
    e.preventDefault()  // elak browser drag-selection (semua graph jadi highlight biru)
    e.stopPropagation()
    if (e.button !== 0) return
    filterDragRef.current = { idx, moved: false }
    setDraggingFilter(idx)
  }

  const onMouseMove = (e) => {
    if (ctxMenu) return // menu terbuka — biarkan klik
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const px = ((e.clientX - rect.left) / rect.width) * W
    const py = ((e.clientY - rect.top) / rect.height) * H

    // EQ filter node drag — freq = X axis, gain = Y axis
    if (filterDragRef.current) {
      const { idx } = filterDragRef.current
      filterDragRef.current.moved = true
      if (px >= M.left && px <= M.left + PW && py >= M.top && py <= M.top + PH) {
        const lf = Math.log10(x0) + ((px - M.left) / PW) * (Math.log10(x1) - Math.log10(x0))
        const freq = Math.round(Math.min(20000, Math.max(20, Math.pow(10, lf))))
        const gain = Math.round(Math.min(24, Math.max(-24, y0 + ((M.top + PH - py) / PH) * (y1 - y0))) * 10) / 10
        if (onEqFilterChange) onEqFilterChange(idx, { freq, gain })
      }
      return
    }

    if (dragRef.current && (Math.abs(e.clientX - dragRef.current.startX) > 3 || Math.abs(e.clientY - dragRef.current.startY) > 3)) {
      const d = dragRef.current
      const dx = (e.clientX - d.startX) / rect.width
      const dy = (e.clientY - d.startY) / rect.height
      const df = dx * (Math.log10(d.x1) - Math.log10(d.x0))
      let n0 = Math.pow(10, Math.log10(d.x0) - df)
      let n1 = Math.pow(10, Math.log10(d.x1) - df)
      n0 = Math.max(20, n0)
      n1 = Math.min(20000, Math.max(n0 * 1.05, n1))
      const dv = dy * (d.y1 - d.y0)
      setXDomain([n0, n1])
      setYDomain([d.y0 + dv, d.y1 + dv])
      return
    }
    if (px < M.left || px > M.left + PW || py < M.top || py > M.top + PH) {
      setHover(null)
      return
    }
    const lf = Math.log10(x0) + ((px - M.left) / PW) * (Math.log10(x1) - Math.log10(x0))
    const f = Math.pow(10, lf)
    const readings = processed.map((c) => {
      const db = interp(c.display.length > 1 ? c.display : c.points, f)
      return { name: c.name, color: c.color, db, isTarget: c.isTarget }
    })
    setHover({ px, f, readings })
  }

  const onMouseUp = () => {
    dragRef.current = null
    filterDragRef.current = null
    setDraggingFilter(null)
  }
  const onMouseLeave = () => {
    setHover(null)
    dragRef.current = null
    filterDragRef.current = null
    setDraggingFilter(null)
  }

  const onContextMenu = (e) => {
    e.preventDefault()
    e.stopPropagation()
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const px = ((e.clientX - rect.left) / rect.width) * W
    const py = ((e.clientY - rect.top) / rect.height) * H
    if (px < M.left || px > M.left + PW || py < M.top || py > M.top + PH) return
    const lf = Math.log10(x0) + ((px - M.left) / PW) * (Math.log10(x1) - Math.log10(x0))
    const f = Math.pow(10, lf)
    const db = y0 + ((M.top + PH - py) / PH) * (y1 - y0)
    // clamp supaya menu tak keluar skrin (menu ~170px lebar, ~150px tinggi)
    const x = Math.min(e.clientX - rect.left, rect.width - 175)
    const y = Math.min(e.clientY - rect.top, rect.height - 155)
    setCtxMenu({ x, y, freq: f, db })
  }

  const ctxAction = (action) => {
    if (!ctxMenu || !onContextAction) return
    onContextAction(action, ctxMenu.freq, ctxMenu.db)
    setCtxMenu(null)
  }

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    svg.addEventListener('wheel', onWheel, { passive: false })
    return () => svg.removeEventListener('wheel', onWheel)
  }, [x0, x1, y0, y1])

  const dashArray = (style) => {
    switch (style) {
      case 'dashed': return '8 5'
      case 'dotted': return '2 4'
      case 'dashdot': return '10 4 2 4'
      default: return undefined
    }
  }

  const boundsPath = useMemo(() => {
    if (!bounds || !target) return null
    let tpts = smoothPoints(target.points, smoothing || 0)
    // apply target adjustments supaya bounds ikut target yang adjusted
    if (targetAdj) tpts = adjustPoints(tpts, targetAdj)
    const upper = []
    const lower = []
    for (const [f, v] of tpts) {
      if (f < x0 || f > x1) continue
      const width = bounds(f)
      upper.push([f, v + width])
      lower.push([f, v - width])
    }
    if (!upper.length) return null
    const up = toPath(upper, xScale, yScale)
    const lowRev = toPath([...lower].reverse(), xScale, yScale)
    return `${up} ${lowRev.replace(/^M/, 'L')} Z`
  }, [bounds, target, smoothing, targetAdj, x0, x1, xScale, yScale])

  return (
    <div style={{ position: 'relative' }}>
    <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: '100%', height: 'auto', maxHeight: 'calc(60vh)', cursor: dragRef.current ? 'grabbing' : 'crosshair', display: 'block', background: 'var(--graph-bg, #14161a)', borderRadius: '8px' }}
      onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseLeave} onContextMenu={onContextMenu} className="graph-svg">
      {/* band regions & labels */}
      {showBands && BANDS.map((b, i) => {
        const bx0 = xScale(Math.max(b.from, x0))
        const bx1 = xScale(Math.min(b.to, x1))
        if (bx1 <= bx0) return null
        return (
          <g key={b.name}>
            <rect x={bx0} y={M.top} width={bx1 - bx0} height={PH} fill={i % 2 === 0 ? 'rgba(255,255,255,0.015)' : 'transparent'} />
            <line x1={bx0} y1={M.top} x2={bx0} y2={M.top + PH} stroke="#1e2126" strokeWidth={0.5} />
            <text x={(bx0 + bx1) / 2} y={M.top - 6} fill="#5a5f68" fontSize={10} textAnchor="middle">{b.name}</text>
          </g>
        )
      })}

      {xTicks.map((f) => (
        <g key={f}>
          <line x1={xScale(f)} y1={M.top} x2={xScale(f)} y2={M.top + PH} stroke="#26292f" strokeWidth={f === 1000 ? 1.5 : 0.5} />
          <text x={xScale(f)} y={M.top + PH + 22} fill="#8a8f98" fontSize={13} textAnchor="middle">{f >= 1000 ? `${f / 1000}k` : f}</text>
        </g>
      ))}
      {yTicks.map((v) => (
        <g key={v}>
          <line x1={M.left} y1={yScale(v)} x2={M.left + PW} y2={yScale(v)} stroke={Math.abs(v) < 0.01 ? '#3a3e45' : '#1e2126'} strokeWidth={Math.abs(v) < 0.01 ? 1 : 0.5} />
          <text x={M.left - 10} y={yScale(v) + 4} fill="#8a8f98" fontSize={13} textAnchor="end">{Math.round(v)}</text>
        </g>
      ))}
      <text x={M.left + PW / 2} y={H - 10} fill="#8a8f98" fontSize={14} textAnchor="middle">Frequency (Hz)</text>
      <text x={20} y={M.top + PH / 2} fill="#8a8f98" fontSize={14} textAnchor="middle" transform={`rotate(-90 20 ${M.top + PH / 2})`}>Level (dB)</text>

      {boundsPath && <path d={boundsPath} fill="rgba(79,195,247,0.08)" stroke="rgba(79,195,247,0.25)" strokeWidth={1} />}

      {processed.map((c, i) => (
        <path key={c.name + i} d={toPath(c.display, xScale, yScale)} fill="none"
          stroke={c.color || (c.isTarget ? '#f5f5f5' : '#8a8f98')} strokeWidth={c.weight || 2.2} strokeDasharray={c.isTarget ? '6 4' : dashArray(c.dash)} strokeLinejoin="round" strokeLinecap="round" opacity={c.isTarget ? 0.85 : 1} />
      ))}

      {/* unit variance band ±2dB */}
      {unitVariance && processed.filter((c) => !c.isTarget && !c.hidden).map((c, i) => {
        const upper = c.display.map(([f, v]) => [f, v + 2])
        const lower = c.display.map(([f, v]) => [f, v - 2]).reverse()
        if (!upper.length) return null
        const d = `${toPath(upper, xScale, yScale)} ${toPath(lower, xScale, yScale).replace(/^M/, 'L')} Z`
        return <path key={`uv${i}`} d={d} fill={c.color + '22'} stroke="none" />
      })}

      {/* diff curve (A−B) */}
      {diff && diff.length > 0 && (
        <path d={toPath(diff.filter(([f]) => f >= x0 * 0.98 && f <= x1 * 1.02), xScale, yScale)} fill="none" stroke="#ffd54f" strokeWidth={1.8} strokeDasharray="4 3" strokeLinejoin="round" opacity={0.85} />
      )}

      {showLabels && processed.map((c, i) => {
        const last = c.display[c.display.length - 1]
        if (!last) return null
        const lx = Math.min(xScale(last[0]) + 6, M.left + PW - 10)
        const ly = yScale(last[1])
        return (
          <text key={`lbl${i}`} x={lx} y={ly + 4} fill={c.color} fontSize={12} textAnchor="end" fontWeight="600">
            {c.name.length > 22 ? c.name.slice(0, 22) + '…' : c.name}
          </text>
        )
      })}

      {/* EQ filter nodes — draggable (freq=X, gain=Y), double-click delete */}
      {eqNodes.map((f) => {
        if (f.freq < x0 || f.freq > x1) return null
        const isDragging = draggingFilter === f.idx
        const nx = xScale(f.freq)
        const ny = Math.min(M.top + PH, Math.max(M.top, yScale(Math.min(y1, Math.max(y0, f.gain)))))
        return (
          <g key={`eq${f.idx}`} className="eq-node" onMouseDown={(e) => onFilterNodeDown(e, f.idx)} onDoubleClick={() => onEqFilterChange && onEqFilterChange(f.idx, null)} style={{ cursor: isDragging ? 'grabbing' : 'grab' }}>
            <circle cx={nx} cy={ny} r={isDragging ? 15 : 13} fill="rgba(255,213,79,0.12)" stroke="none" />
            <circle cx={nx} cy={ny} r={6.5} fill={isDragging ? '#ffb74d' : '#ffd54f'} stroke="#14161a" strokeWidth={isDragging ? 2.5 : 2} />
            <text x={nx} y={ny - 11} fill={isDragging ? '#ffb74d' : '#ffd54f'} fontSize={9} textAnchor="middle" fontWeight="600" style={{ pointerEvents: 'none' }}>
              {f.gain > 0 ? '+' : ''}{f.gain.toFixed(1)}
            </text>
          </g>
        )
      })}

      {inspector && hover && (
        <g>
          <line x1={hover.px} y1={M.top} x2={hover.px} y2={M.top + PH} stroke="#5a5f68" strokeWidth={0.8} strokeDasharray="4 4" />
          {hover.readings.map((r, i) => (
            <circle key={i} cx={hover.px} cy={yScale(r.db)} r={4} fill={r.color} stroke="#14161a" strokeWidth={1.5} />
          ))}
          <g>
            <rect x={Math.min(hover.px + 12, W - 280)} y={M.top + 8} width={268} height={Math.min(34 + hover.readings.length * 20, 300)} fill="#1d2026dd" stroke="#3a3e45" rx={6} />
            <text x={Math.min(hover.px + 24, W - 268)} y={M.top + 28} fill="#cdd2da" fontSize={13} fontWeight="bold">{Math.round(hover.f)} Hz</text>
            {hover.readings.slice(0, 13).map((r, i) => (
              <text key={i} x={Math.min(hover.px + 24, W - 268)} y={M.top + 48 + i * 20} fill={r.color} fontSize={12}>
                {r.name.length > 26 ? r.name.slice(0, 26) + '…' : r.name}: {r.db.toFixed(1)} dB
              </text>
            ))}
          </g>
        </g>
      )}
    </svg>
    {ctxMenu && (
      <div
        className="ctx-menu"
        style={{ position: 'absolute', left: ctxMenu.x, top: ctxMenu.y, zIndex: 500 }}
        onMouseDown={(e) => e.stopPropagation()}
        onMouseUp={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <p className="ctx-info">{Math.round(ctxMenu.freq)} Hz · {ctxMenu.db.toFixed(1)} dB</p>
        <button onClick={() => ctxAction('addFilter')}>+ Add filter here</button>
        <button onClick={() => ctxAction('setTarget')}>🎯 Set as custom target</button>
        <button onClick={() => ctxAction('pinTop')}>📌 Pin at top</button>
        <button onClick={() => setCtxMenu(null)}>Close</button>
      </div>
    )}
    </div>
  )
}
