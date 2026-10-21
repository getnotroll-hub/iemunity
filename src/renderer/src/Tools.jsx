import React, { useState, useRef, useCallback } from 'react'

// ── Universal EQ format export/import ──
// Squig.link / AutoEq / Wavelet / Peace format (.parametric / txt)

export function eqToSquigParametric(filters, preamp) {
  let out = `Preamp: ${preamp.toFixed(1)} dB\n`
  let n = 0
  for (const f of filters) {
    if (f.enabled === false) continue
    n++
    out += `Filter ${n}: ON ${f.type} Fc ${f.freq.toFixed(1)} Hz Gain ${f.gain.toFixed(1)} dB Q ${f.q.toFixed(2)}\n`
  }
  return out
}

export function UniversalEqPanel({ filters, preamp, onFiltersFromDevice }) {
  const exportUniversal = async () => {
    if (!window.api) return
    const txt = eqToSquigParametric(filters, preamp)
    await window.api.saveText('eq.parametric', txt)
  }

  const importUniversal = async () => {
    if (!window.api) return
    const raw = await window.api.loadPreset()
    if (!raw) return
    try {
      // parse AutoEq/squig format
      const filters = []
      let preamp = 0
      const pm = raw.match(/Preamp:\s*(-?[\d.]+)/i)
      if (pm) preamp = parseFloat(pm[1])
      for (const line of raw.split(/\r?\n/)) {
        if (!/^Filter\s+\d+:/i.test(line)) continue
        const fc = line.match(/Fc\s+([\d.]+)\s*Hz/i)
        const g = line.match(/Gain\s+(-?[\d.]+)\s*dB/i)
        const q = line.match(/Q\s+([\d.]+)/i)
        const typeM = line.match(/\b(PK|LSQ|HSQ|LSC|HSC|LS|HS)\b/i)
        const on = /\bON\b/i.test(line)
        const off = /\bOFF\b/i.test(line)
        if (fc && g && typeM) {
          let type = typeM[1].toUpperCase()
          if (type === 'LSC' || type === 'LS') type = 'LSQ'
          if (type === 'HSC' || type === 'HS') type = 'HSQ'
          filters.push({ type, freq: parseFloat(fc[1]), gain: parseFloat(g[1]), q: q ? parseFloat(q[1]) : 1.41, enabled: !off && on })
        }
      }
      if (!filters.length) throw new Error('No filters found in file')
      onFiltersFromDevice(filters, preamp)
    } catch (e) {
      alert(`Import failed: ${e.message}`)
    }
  }

  return (
    <div className="row">
      <button onClick={exportUniversal}>⬇ Export universal EQ (.parametric)</button>
      <button onClick={importUniversal}>⬆ Import universal EQ</button>
    </div>
  )
}

// ── Crossover simulation: gabung 2 IEM (sub-bass dari A, sisanya dari B) ──
export function CrossoverSim({ curves, onResult }) {
  const [lowSrc, setLowSrc] = useState('')
  const [highSrc, setHighSrc] = useState('')
  const [xoFreq, setXoFreq] = useState(400)

  const simulate = () => {
    const a = curves.find((c) => c.name === lowSrc)
    const b = curves.find((c) => c.name === highSrc)
    if (!a || !b || a === b) return
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
    // align B ke A @ 1kHz, lepas tu blend dengan lowpass/highpass slope (4th order = 24dB/oct)
    const align = interp(a.points, 1000) - interp(b.points, 1000)
    const slope = 4 // octaves
    const points = a.points.map(([f, v]) => {
      const oct = Math.log2(f / xoFreq)
      const lowWeight = 1 / (1 + Math.pow(10, oct * slope / 2))   // lowpass gain
      const bv = interp(b.points, f) + align
      return [f, v * lowWeight + bv * (1 - lowWeight)]
    })
    onResult({ name: `XO: ${lowSrc} sub + ${highSrc}`, points })
  }

  return (
    <div className="crossover">
      <h3>Crossover Simulation</h3>
      <p className="hint">Blend sub-bass from one IEM with the rest of another IEM's tuning.</p>
      <div className="row">
        <select value={lowSrc} onChange={(e) => setLowSrc(e.target.value)}>
          <option value="">Low/bass source…</option>
          {curves.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
        </select>
      </div>
      <div className="row">
        <select value={highSrc} onChange={(e) => setHighSrc(e.target.value)}>
          <option value="">High/mids source…</option>
          {curves.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
        </select>
      </div>
      <div className="row">
        <label>Crossover @ {xoFreq}Hz
          <input type="range" min="80" max="2000" step="20" value={xoFreq} onChange={(e) => setXoFreq(+e.target.value)} />
        </label>
        <button className="primary" onClick={simulate} disabled={!lowSrc || !highSrc || lowSrc === highSrc}>Simulate</button>
      </div>
    </div>
  )
}

// ── Hearing test: sweep tone, user tekan bila tak dengar → save profile ──
export function HearingTest({ onProfileSave }) {
  const [running, setRunning] = useState(false)
  const [freq, setFreq] = useState(1000)
  // level in dB attenuation: 0 = reference (kuat), -60 = sangat senyap
  const [levelDb, setLevelDb] = useState(-20)
  const [thresholds, setThresholds] = useState({})
  const ctxRef = useRef(null)
  const oscRef = useRef(null)
  const gainRef = useRef(null)

  const REF_GAIN = 0.5
  const gainFromDb = (db) => REF_GAIN * Math.pow(10, db / 20)

  const stopTone = () => {
    if (oscRef.current) {
      try { oscRef.current.stop() } catch (_) {}
      oscRef.current = null
      gainRef.current = null
    }
    setRunning(false)
  }

  const playTone = () => {
    stopTone()
    const ctx = ctxRef.current || new (window.AudioContext || window.webkitAudioContext)()
    ctxRef.current = ctx
    if (ctx.state === 'suspended') ctx.resume()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    gain.gain.value = gainFromDb(levelDb)
    osc.frequency.value = freq
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    oscRef.current = osc
    gainRef.current = gain
    setRunning(true)
  }

  const setFreqLive = (f) => {
    setFreq(f)
    if (oscRef.current) oscRef.current.frequency.value = f
  }

  const setLevelLive = (db) => {
    setLevelDb(db)
    if (gainRef.current) gainRef.current.gain.value = gainFromDb(db)
  }

  const markThreshold = (band, level) => {
    setThresholds((t) => ({ ...t, [band]: level }))
  }

  // snap freq ke band terdekat supaya profile keys match band buttons
  const nearestBand = (f) => {
    return bands.reduce((a, b) => Math.abs(b - f) < Math.abs(a - f) ? b : a)
  }

  const saveProfile = () => {
    onProfileSave(thresholds)
    stopTone()
  }

  const bands = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]

  return (
    <div className="hearing">
      <h3>Hearing Test</h3>
      <p className="hint">Play tone → lower the level until just audible → "Mark". Test each band (click band buttons). Use headphones at moderate volume in a quiet room.</p>
      <div className="row">
        <button className="primary" onClick={running ? stopTone : playTone}>{running ? '■ Stop' : '▶ Test tone'}</button>
        <label>Freq: {Math.round(freq)}Hz
          <input type="range" min="20" max="18000" value={freq} onChange={(e) => setFreqLive(+e.target.value)} />
        </label>
        <label>Level: {levelDb === 0 ? '0 dB (max)' : `${levelDb} dB`}
          <input type="range" min="-100" max="0" step="1" value={levelDb} onChange={(e) => setLevelLive(+e.target.value)} />
        </label>
      </div>
      <div className="hearing-bands">
        {bands.map((b) => (
          <button key={b} className={Math.round(freq) === b ? 'band-btn active' : 'band-btn'} onClick={() => setFreqLive(b)}>
            {b >= 1000 ? `${b / 1000}k` : b}
            {thresholds[b] !== undefined && <span className="th"> {['normal', 'mild', 'moderate', 'severe', 'N/A'][thresholds[b]] || thresholds[b]}</span>}
          </button>
        ))}
      </div>
      <div className="row">
        <select defaultValue="" onChange={(e) => { if (e.target.value) { markThreshold(nearestBand(freq), +e.target.value); e.target.value = '' } }}>
          <option value="">Mark threshold for current freq…</option>
          <option value="0">Normal (0)</option>
          <option value="1">Mild loss (+10dB needed)</option>
          <option value="2">Moderate (+20dB)</option>
          <option value="3">Severe (+40dB)</option>
          <option value="4">Not audible</option>
        </select>
        <button onClick={saveProfile} disabled={!Object.keys(thresholds).length}>💾 Save hearing profile</button>
      </div>
    </div>
  )
}
