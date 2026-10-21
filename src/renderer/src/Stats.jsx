import React from 'react'

// RMS deviation dari target + score 0-100 (macam squig.link style)
export function calcPreferenceScore(points, targetPoints) {
  if (!points || !targetPoints || points.length < 2 || targetPoints.length < 2) return null
  const interp = (pts, f) => {
    if (f <= pts[0][0]) return pts[0][1]
    if (f >= pts[pts.length - 1][0]) return pts[pts.length - 1][1]
    let lo = 0
    let hi = pts.length - 1
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1
      if (pts[mid][0] < f) lo = mid
      else hi = mid
    }
    const [f0, v0] = pts[lo]
    const [f1, v1] = pts[hi]
    if (f1 === f0) return v0
  const t = (Math.log(f) - Math.log(f0)) / (Math.log(f1) - Math.log(f0))
    return v0 + t * (v1 - v0)
  }
  // align at 500Hz (mid anchor)
  const offset = interp(points, 500) - interp(targetPoints, 500)
  let sumSq = 0
  let n = 0
  let worst = { f: 0, d: 0 }
  for (const [f, v] of points) {
    if (f < 40 || f > 10000) continue
    const d = v - offset - interp(targetPoints, f)
    sumSq += d * d
    n++
    if (Math.abs(d) > Math.abs(worst.d)) worst = { f, d }
  }
  if (!n) return null
  const rms = Math.sqrt(sumSq / n)
  const score = Math.max(0, Math.min(100, Math.round(100 - rms * 8)))
  return { rms: Math.round(rms * 10) / 10, score, worst }
}

// Amp power calculator
export function ampPower({ impedance, sensitivity, targetSpl }) {
  // sensitivity dB/mW (typical IEM ~105-110, headphone ~95-100)
  const z = Math.max(1, impedance || 16)
  const sens = sensitivity || 105
  const spl = targetSpl || 110
  const mwNeeded = Math.pow(10, (spl - sens) / 10)
  const volts = Math.sqrt((mwNeeded / 1000) * z)
  const dbu = 20 * Math.log10(volts / 0.7746)
  return {
    mw: Math.round(mwNeeded * 100) / 100,
    volts: Math.round(volts * 1000) / 1000,
    dbu: Math.round(dbu * 10) / 10
  }
}

export function ScorePanel({ curves, targets, selectedTarget }) {
  const target = targets[selectedTarget]
  if (!target || !curves.length) return null
  return (
    <div className="scorepanel">
      <h3>Preference vs {selectedTarget}</h3>
      {curves.map((c) => {
        const r = calcPreferenceScore(c.points, target.points)
        if (!r) return null
        const color = r.score >= 85 ? '#81c784' : r.score >= 70 ? '#ffd54f' : '#e57373'
        return (
          <div className="score-row" key={c.name}>
            <span className="swatch" style={{ background: c.color }} />
            <span className="cname" title={c.name}>{c.name}</span>
            <span className="score" style={{ color }}>{r.score}</span>
            <span className="rms" title={`RMS deviation, worst ±${r.worst.d.toFixed(1)}dB @ ${Math.round(r.worst.f)}Hz`}>±{r.rms} dB</span>
          </div>
        )
      })}
    </div>
  )
}

// Band analysis untuk comparison table
export function bandLevels(points) {
  if (!points || points.length < 2) return { subBass: 0, bass: 0, mids: 0, earGain: 0, treble: 0 }
  const interp = (pts, f) => {
    if (f <= pts[0][0]) return pts[0][1]
    if (f >= pts[pts.length - 1][0]) return pts[pts.length - 1][1]
    let lo = 0
    let hi = pts.length - 1
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1
      if (pts[mid][0] < f) lo = mid
      else hi = mid
    }
    const [f0, v0] = pts[lo]
    const [f1, v1] = pts[hi]
    if (f1 === f0) return v0
  const t = (Math.log(f) - Math.log(f0)) / (Math.log(f1) - Math.log(f0))
    return v0 + t * (v1 - v0)
  }
  const anchor = interp(points, 1000)
  const band = (lo, hi) => {
    let sum = 0
    let n = 0
    for (const [f, v] of points) {
      if (f >= lo && f <= hi) { sum += v; n++ }
    }
    return n ? sum / n - anchor : 0
  }
  return {
    subBass: band(20, 60),
    bass: band(60, 250),
    mids: band(400, 1500),
    earGain: interp(points, 3000) - anchor,
    treble: band(6000, 12000)
  }
}

export function CompareTable({ curves }) {
  if (!curves.length) return null
  return (
    <table className="manage compare">
      <thead>
        <tr><th>IEM</th><th>Sub-Bass</th><th>Bass</th><th>Mids</th><th>Ear Gain</th><th>Treble</th></tr>
      </thead>
      <tbody>
        {curves.map((c) => {
          const b = bandLevels(c.points)
          const fmt = (v) => (
            <span style={{ color: v > 3 ? '#81c784' : v < -3 ? '#e57373' : '#cdd2da' }}>
              {v > 0 ? '+' : ''}{b ? '' : ''}{v.toFixed(1)}
            </span>
          )
          return (
            <tr key={c.name}>
              <td className="cname" style={{ maxWidth: 180 }}>
                <span className="swatch" style={{ background: c.color, display: 'inline-block' }} /> {c.name}
              </td>
              <td>{fmt(b.subBass)}</td>
              <td>{fmt(b.bass)}</td>
              <td>{fmt(b.mids)}</td>
              <td>{fmt(b.earGain)}</td>
              <td>{fmt(b.treble)}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

export function AmpCalc({ curves }) {
  const [z, setZ] = React.useState(32)
  const [sens, setSens] = React.useState(105)
  const [spl, setSpl] = React.useState(110)
  const r = ampPower({ impedance: z, sensitivity: sens, targetSpl: spl })
  // common IEM/headphone impedance + sensitivity lookups
  const LOOKUP = {
    'Tangzu Wan\'er': { z: 32, sens: 108 },
    'Tangzu Zetian Wu': { z: 16, sens: 108 },
    'Sennheiser HD 800': { z: 300, sens: 96 },
    'Sennheiser HD 600': { z: 300, sens: 97 },
    'Beyerdynamic DT 770 Pro': { z: 250, sens: 96 },
    'Moondrop Aria': { z: 32, sens: 104 },
    'Moondrop Blessing 2': { z: 22, sens: 117 },
    'Truthear x Crinacle Zero': { z: 23, sens: 112 },
    '7Hz Salnotes Zero': { z: 23, sens: 108 },
    'Simgot EA500': { z: 21, sens: 123 },
    'Moondrop Kato': { z: 32, sens: 123 },
    'Sony WF-1000XM4': { z: 16, sens: 105 },
    'FiiO FH3': { z: 20, sens: 112 }
  }
  const match = curves?.find((c) => {
    const n = c.name.toLowerCase()
    return Object.keys(LOOKUP).some((k) => n.includes(k.toLowerCase()))
  })
  return (
    <div className="ampcalc">
      <h3>Amp Power Calculator</h3>
      {match && (
        <button className="model-btn" onClick={() => {
          const lk = Object.keys(LOOKUP).find((k) => match.name.toLowerCase().includes(k.toLowerCase()))
          setZ(LOOKUP[lk].z)
          setSens(LOOKUP[lk].sens)
        }}>
          🔌 Load specs from "{match.name}" ({Object.keys(LOOKUP).find((k) => match.name.toLowerCase().includes(k.toLowerCase()))})
        </button>
      )}
      <div className="row">
        <label>Imp: <input type="number" value={z} onChange={(e) => setZ(+e.target.value)} style={{ width: 60 }} /> Ω</label>
        <label>Sens: <input type="number" value={sens} onChange={(e) => setSens(+e.target.value)} style={{ width: 60 }} /> dB/mW</label>
        <label>SPL: <input type="number" value={spl} onChange={(e) => setSpl(+e.target.value)} style={{ width: 60 }} /> dB</label>
      </div>
      <p className="hint">Required: <b>{r.mw} mW</b> @ {z}Ω = {r.volts} V ({r.dbu} dBu)</p>
      <p className="hint">Rule of thumb: amp should have ≥{Math.ceil(r.mw * 5)} mW headroom (5×)</p>
    </div>
  )
}
