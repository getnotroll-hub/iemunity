import React, { useState, useMemo, useRef, useEffect } from 'react'
import { biquadCoeffs, biquadDb } from './dsp'

function rmsDist(a, b, from = 40, to = 10000) {
  if (!a?.length || !b?.length) return Infinity
  const interp = (pts, f) => {
    if (f <= pts[0][0]) return pts[0][1]
    if (f >= pts[pts.length - 1][0]) return pts[pts.length - 1][1]
    let lo = 0, hi = pts.length - 1
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1
      if (pts[mid][0] < f) lo = mid; else hi = mid
    }
    const [f0, v0] = pts[lo], [f1, v1] = pts[hi]
    return v0 + (v1 - v0) * ((Math.log(f) - Math.log(f0)) / (Math.log(f1) - Math.log(f0)))
  }
  // align 1kHz
  const off = interp(a, 1000) - interp(b, 1000)
  let sum = 0, n = 0
  for (const [f, v] of a) {
    if (f < from || f > to) continue
    const d = (v - off) - interp(b, f)
    sum += d * d
    n++
  }
  return n ? Math.sqrt(sum / n) : Infinity
}

// ── Find Similar IEMs ──
export function FindSimilar({ curve, models, onLoad }) {
  const [results, setResults] = useState(null)
  const [searching, setSearching] = useState(false)
  const [progress, setProgress] = useState('')

  const find = async () => {
    if (!curve || !window.api) return
    setSearching(true)
    setResults(null)
    const candidates = models.filter((m) => m.name !== curve.name && (m.rig === curve.rig || curve.rig === 'custom' || curve.rig === 'sim')).slice(0, 400)
    const scored = []
    const BATCH = 20
    for (let i = 0; i < candidates.length; i += BATCH) {
      setProgress(`Scanning ${i}/${candidates.length}… (${scored.length} matched)`)
      const batch = candidates.slice(i, i + BATCH)
      const settled = await Promise.allSettled(batch.map((m) => window.api.dbMeasurements(m.name, m.rig, m.source)))
      for (let j = 0; j < settled.length; j++) {
        const res = settled[j]
        if (res.status !== 'fulfilled' || !res.value) continue
        const pts = res.value.AVG || res.value.L || res.value.R
        if (!pts || pts.length < 2) continue
        scored.push({ model: batch[j], dist: rmsDist(curve.points, pts) })
      }
      // stop kalau dah cukup
      if (scored.length >= 200) break
    }
    scored.sort((a, b) => a.dist - b.dist)
    setResults(scored.slice(0, 8))
    setProgress('')
    setSearching(false)
  }

  return (
    <div className="findsimilar">
      <div className="row">
        <button className="primary" onClick={find} disabled={searching}>
          {searching ? 'Scanning database…' : '🔍 Find similar IEMs'}
        </button>
        {searching && progress && <span className="hint" style={{ margin: 0 }}>{progress}</span>}
      </div>
      {results && results.length > 0 && (
        <ul className="quick-list">
          {results.map((r, i) => (
            <li key={`${r.model.name}|||${r.model.rig}|||${i}`}>
              <button className="model-btn" onClick={() => onLoad(r.model)} title="Load ke graph">
                <span className="mname">{r.model.name}</span>
                <span className="src-badge">{r.model.source}</span>
                <span className="rms">±{r.dist.toFixed(1)} dB</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {results && results.length === 0 && <p className="hint">No similar models found.</p>}
    </div>
  )
}

// ── Blind A/B test: 2 IEM disembunyikan, pilih mana best, reveal ──
export function BlindTest({ curves, onDone }) {
  const [phase, setPhase] = useState('setup')
  const [choice, setChoice] = useState(null)
  const [winner, setWinner] = useState(null)
  const [labels, setLabels] = useState(null)

  const start = () => {
    const vis = curves.filter((c) => !c.hidden).slice(0, 2)
    if (vis.length < 2) return
    const shuffled = [...vis].sort(() => Math.random() - 0.5)
    setLabels({ A: shuffled[0], B: shuffled[1] })
    setPhase('test')
  }

  const choose = (picked) => {
    if (!labels) return
    setChoice(picked)
    setWinner(labels[picked])
    setPhase('reveal')
  }

  const reset = () => {
    setPhase('setup')
    setChoice(null)
    setWinner(null)
    setLabels(null)
  }

  // setup phase: tunjuk button walaupun labels belum ada (shuffle masa start)
  if (phase === 'setup') {
    const vis = curves.filter((c) => !c.hidden)
    return (
      <div className="blindtest">
        <div className="row">
          <button className="primary" onClick={start} disabled={vis.length < 2}>🎧 Start blind test</button>
          <p className="hint">{vis.length >= 2 ? 'First 2 visible IEMs used. A/B hidden — listen via EQ playback and pick.' : 'Blind test needs 2 visible IEMs on the graph.'}</p>
        </div>
      </div>
    )
  }
  if (!labels) return null
  return (
    <div className="blindtest">
      {phase === 'test' && (
        <>
          <p className="hint">Listen (via EQ playback with A/B toggle in EQ tab), then pick which sounds better:</p>
          <div className="row blind-btns">
            <button className="primary" onClick={() => choose('A')}>🎧 I like A</button>
            <button className="primary" onClick={() => choose('B')}>🎧 I like B</button>
          </div>
        </>
      )}
      {phase === 'reveal' && winner && (
        <div className="reveal-box">
          <p>🏆 Winner: <b>{winner.name}</b></p>
          <p className="hint">A = {labels.A.name} · B = {labels.B.name}</p>
          <button onClick={reset}>Test again</button>
        </div>
      )}
    </div>
  )
}

// ── Unit variance compare: 2 unit IEM sama, tengok beza ──
export function UnitVarianceCompare({ curves }) {
  const [groupA, setGroupA] = useState('')

  // group curves by normalized name (buang rig/source suffix)
  const groups = useMemo(() => {
    const map = new Map()
    for (const c of curves) {
      const base = c.name.replace(/\s*\(.*?\)\s*/g, '').trim()
      if (!map.has(base)) map.set(base, [])
      map.get(base).push(c)
    }
    // hanya groups dengan >1 curve (variance mungkin)
    return [...map.entries()].filter(([, list]) => list.length > 1)
  }, [curves])

  if (!groups.length) {
    return <p className="hint">Load 2+ curves of the same IEM (different sources/units) to compare variance.</p>
  }

  const compare = () => {
    if (!groupA) return
    const list = groups.find(([n]) => n === groupA)?.[1] || []
    const [a, b] = list.slice(0, 2)
    if (!a || !b) return
    // align 1kHz & return band analysis
    const interp = (pts, f) => {
      if (f <= pts[0][0]) return pts[0][1]
      if (f >= pts[pts.length - 1][0]) return pts[pts.length - 1][1]
      let lo = 0, hi = pts.length - 1
      while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (pts[mid][0] < f) lo = mid; else hi = mid }
      const [f0, v0] = pts[lo], [f1, v1] = pts[hi]
      return v0 + (v1 - v0) * ((Math.log(f) - Math.log(f0)) / (Math.log(f1) - Math.log(f0)))
    }
    const offA = interp(a.points, 1000)
    const offB = interp(b.points, 1000)
    const bands = [
      ['Sub-bass', 20, 60], ['Bass', 60, 250], ['Mids', 400, 1500],
      ['Ear gain', 2000, 4000], ['Treble', 6000, 12000]
    ]
    const result = bands.map(([name, lo, hi]) => {
      const avg = (pts) => {
        let s = 0, n = 0
        for (const [f, v] of pts) { if (f >= lo && f <= hi) { s += v; n++ } }
        return n ? s / n : 0
      }
      const diff = (avg(b.points) - offB) - (avg(a.points) - offA)
      return { name, diff: Math.round(diff * 10) / 10 }
    })
    return { a, b, result }
  }

  const analysis = compare()

  return (
    <div className="unitvar-compare">
      <h3>Unit Variance Compare</h3>
      <p className="hint">Compare 2 measurements of the same IEM (different units or sources).</p>
      <div className="row">
        <select value={groupA} onChange={(e) => setGroupA(e.target.value)}>
          <option value="">Select IEM group…</option>
          {groups.map(([name, list]) => (
            <option key={name} value={name}>{name} ({list.length} samples)</option>
          ))}
        </select>
      </div>
      {analysis && (
        <table className="manage compare" style={{ marginTop: 8 }}>
          <thead>
            <tr><th>Band</th><th>Δ (A−B)</th></tr>
          </thead>
          <tbody>
            {analysis.result.map((r) => (
              <tr key={r.name}>
                <td>{r.name}</td>
                <td style={{ color: Math.abs(r.diff) > 2 ? '#e57373' : Math.abs(r.diff) > 1 ? '#ffd54f' : '#81c784' }}>
                  {r.diff > 0 ? '+' : ''}{r.diff} dB
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

// Unit variance note
export function UnitVarianceNote({ enabled }) {
  if (!enabled) return null
  return (
    <p className="hint" style={{ color: '#90a4ae' }}>
      Shaded ±2dB band shows typical unit-to-unit variance — your unit may differ by this much.
    </p>
  )
}
