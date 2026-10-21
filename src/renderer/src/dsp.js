// DSP: biquad filters, FR computation, AutoEQ optimization

export function biquadCoeffs(type, freq, gainDb, q, fs = 48000) {
  const A = Math.pow(10, gainDb / 40)
  const w0 = (2 * Math.PI * freq) / fs
  const alpha = Math.sin(w0) / (2 * q)
  const cw = Math.cos(w0)
  let b0, b1, b2, a0, a1, a2
  if (type === 'PK') {
    b0 = 1 + alpha * A
    b1 = -2 * cw
    b2 = 1 - alpha * A
    a0 = 1 + alpha / A
    a1 = -2 * cw
    a2 = 1 - alpha / A
  } else if (type === 'LSQ') {
    const sq = 2 * Math.sqrt(A) * alpha
    b0 = A * (A + 1 - (A - 1) * cw + sq)
    b1 = 2 * A * (A - 1 - (A + 1) * cw)
    b2 = A * (A + 1 - (A - 1) * cw - sq)
    a0 = A + 1 + (A - 1) * cw + sq
    a1 = -2 * (A - 1 + (A + 1) * cw)
    a2 = A + 1 + (A - 1) * cw - sq
  } else if (type === 'HSQ') {
    const sq = 2 * Math.sqrt(A) * alpha
    b0 = A * (A + 1 + (A - 1) * cw + sq)
    b1 = -2 * A * (A - 1 + (A + 1) * cw)
    b2 = A * (A + 1 + (A - 1) * cw - sq)
    a0 = A + 1 - (A - 1) * cw + sq
    a1 = 2 * (A - 1 - (A + 1) * cw)
    a2 = A + 1 - (A - 1) * cw - sq
  } else {
    b0 = 1; b1 = 0; b2 = 0; a0 = 1; a1 = 0; a2 = 0
  }
  return [b0 / a0, b1 / a0, b2 / a0, 1, a1 / a0, a2 / a0]
}

export function biquadDb(coeffs, freq, fs = 48000) {
  const [b0, b1, b2, , a1, a2] = coeffs
  const w = (2 * Math.PI * freq) / fs
  const cw = Math.cos(w)
  const sw = Math.sin(w)
  const c2w = Math.cos(2 * w)
  const s2w = Math.sin(2 * w)
  const numR = b0 + b1 * cw + b2 * c2w
  const numI = -(b1 * sw + b2 * s2w)
  const denR = 1 + a1 * cw + a2 * c2w
  const denI = -(a1 * sw + a2 * s2w)
  const num = Math.sqrt(numR * numR + numI * numI)
  const den = Math.sqrt(denR * denR + denI * denI)
  return 20 * Math.log10(num / den || 1e-12)
}

export function filterChainDb(filters, freq, fs = 48000) {
  let db = 0
  for (const f of filters) {
    if (f.enabled === false) continue
    db += biquadDb(biquadCoeffs(f.type, f.freq, f.gain, f.q, fs), freq, fs)
  }
  return db
}

export function applyFiltersToPoints(points, filters, fs = 48000) {
  return points.map(([f, v]) => [f, v + filterChainDb(filters, f, fs)])
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
  if (f1 === f0) return v0
  const t = (Math.log(f) - Math.log(f0)) / (Math.log(f1) - Math.log(f0))
  return v0 + t * (v1 - v0)
}

// AutoEQ: greedily optimize peak filters to minimize error vs target
// opts.hearingProfile: { freqHz: level } — level 0=normal, 1=mild(+10dB), 2=moderate, 3=severe, 4=not audible
// Regions dengan hearing loss diberi weight rendah — EQ tak buang filters di situ
export function hearingWeight(f, hearingProfile) {
  if (!hearingProfile) return 1
  // find nearest tested band
  let nearest = null
  let nearestDist = Infinity
  for (const k of Object.keys(hearingProfile)) {
    const bf = parseFloat(k)
    const d = Math.abs(Math.log(f / bf))
    if (d < nearestDist) { nearestDist = d; nearest = hearingProfile[k] }
  }
  if (nearest === null || nearest === 0) return 1
  if (nearest >= 4) return 0        // not audible — jangan EQ di sini langsung
  return Math.pow(0.5, nearest)     // mild=0.5, moderate=0.25, severe=0.125
}

export function autoEQ(measurement, target, opts = {}) {
  const {
    maxFilters = 8,
    freqMin = 40,
    freqMax = 10000,
    gainMax = 12,
    fs = 48000,
    hearingProfile = null
  } = opts
  const normF = opts.normFreq || 1000
  const offset = interp(measurement, normF) - interp(target, normF)
  const resid = measurement.map(([f, v]) => [f, v - offset - interp(target, f)])
  const filters = []
  const FREES = [0.65, 0.78, 0.9, 1, 1.12, 1.28, 1.45]  // denser frequency multipliers
  const GAINS = [1, 0.85, 0.7, 0.55]
  const Qs = [0.6, 1, 1.8, 3, 5, 8]
  const TYPES = ['PK', 'LSQ', 'HSQ']

  for (let i = 0; i < maxFilters; i++) {
    // find worst residual point — weighted by hearing profile & mids
    let worst = null
    let worstVal = 0
    for (const [f, v] of resid) {
      if (f < freqMin || f > freqMax) continue
      const hw = hearingWeight(f, hearingProfile)
      if (hw === 0) continue
      const wv = v * hw
      if (Math.abs(wv) > Math.abs(worstVal)) {
        worst = f
        worstVal = wv
      }
    }
    if (worst === null || Math.abs(worstVal) < 0.8) break

    let best = null
    let bestErr = Infinity
    for (const fMul of FREES) {
      const fc = worst * fMul
      if (fc < freqMin || fc > freqMax) continue
      for (const gainMul of GAINS) {
        const gain = worstVal * gainMul
        if (Math.abs(gain) > gainMax) continue
        for (const q of Qs) {
          for (const type of TYPES) {
            const gain2 = type === 'PK' ? gain : gain
            const cand = {
              type,
              freq: Math.round(fc * 10) / 10,
              gain: Math.round(Math.min(gainMax, Math.max(-gainMax, -gain2)) * 10) / 10,
              q,
              enabled: true
            }
            let err = 0
            let wsum = 0
            for (const [f, v] of resid) {
              if (f < freqMin * 0.7 || f > freqMax * 1.3) continue
              const corr = v + biquadDb(biquadCoeffs(type, cand.freq, cand.gain, cand.q, fs), f, fs)
              const w = (f < 200 ? 0.5 : f > 8000 ? 0.5 : 1) * hearingWeight(f, hearingProfile)
              err += w * corr * corr
              wsum += w
            }
            err /= wsum || 1
            if (err < bestErr) {
              bestErr = err
              best = cand
            }
          }
        }
      }
    }
    if (!best) break
    filters.push(best)
    for (const p of resid) {
      p[1] += biquadDb(biquadCoeffs(best.type, best.freq, best.gain, best.q, fs), p[0], fs)
    }
  }
  return filters
}

export function calcPreamp(filters) {
  let maxBoost = 0
  const pts = []
  for (let f = 20; f <= 20000; f *= 1.02) pts.push(f)
  for (const f of pts) {
    const db = filterChainDb(filters, f)
    if (db > maxBoost) maxBoost = db
  }
  return -Math.ceil(maxBoost * 10) / 10
}

export function eqToText(filters, preamp) {
  let out = `Preamp: ${preamp.toFixed(1)} dB\n`
  filters.forEach((f, i) => {
    if (f.enabled === false) return
    out += `Filter ${i + 1}: ON ${f.type} Fc ${f.freq.toFixed(1)} Hz Gain ${f.gain.toFixed(1)} dB Q ${f.q.toFixed(2)}\n`
  })
  return out
}

export function parseEqText(text) {
  const filters = []
  const lines = text.split(/\r?\n/)
  let preamp = 0
  const pm = text.match(/Preamp:\s*(-?[\d.]+)/i)
  if (pm) preamp = parseFloat(pm[1])
  for (const line of lines) {
    if (!/^Filter\s+\d+:/i.test(line)) continue
    const fc = line.match(/Fc\s+([\d.]+)\s*Hz/i)
    const g = line.match(/Gain\s+(-?[\d.]+)\s*dB/i)
    const q = line.match(/Q\s+([\d.]+)/i)
    const typeM = line.match(/\b(PK|LSQ|HSQ)\b/i)
    const on = /\bON\b/i.test(line)
    const off = /\bOFF\b/i.test(line)
    if (fc && g && typeM) {
      filters.push({
        type: typeM[1].toUpperCase(),
        freq: parseFloat(fc[1]),
        gain: parseFloat(g[1]),
        q: q ? parseFloat(q[1]) : 1.41,
        enabled: !off && on
      })
    }
  }
  return { filters, preamp }
}

export function graphicEqToText(filters, preamp) {
  // 127-band graphic EQ for Wavelet
  const bands = []
  for (let i = 0; i < 127; i++) {
    const f = 20 * Math.pow(1000, i / 126)
    bands.push([f, filterChainDb(filters, f)])
  }
  let out = `Preamp: ${preamp.toFixed(2)} dB\n`
  for (const [f, db] of bands) {
    out += `Filter ${bands.indexOf(bands.find((b) => b[0] === f)) + 1}: ON PK Fc ${f.toFixed(1)} Hz Gain ${db.toFixed(2)} dB Q 4.361\n`
  }
  return out
}

// Sound signature presets — points dari 20Hz-20kHz (log, ~150 points)
// Base: neutral flat; setiap preset definisikan shape sendiri
export const SOUND_SIGNATURES = {
  'Neutral': { desc: 'Flat, studio reference', shape: (f) => 0 },
  'Warm': { desc: 'Bass & mid emphasis, relaxed treble', shape: (f) => {
    let v = 0
    if (f <= 60) v += 4
    else if (f < 400) v += 4 * Math.max(0, 1 - Math.log(f / 60) / Math.log(400 / 60))
    v += 2 * Math.exp(-Math.pow((Math.log(f / 1200)) / 0.6, 2))
    if (f > 6000) v -= 2 * Math.min(1, Math.log(f / 6000) / Math.log(2))
    return v
  }},
  'V-Shape': { desc: 'Bass + treble boost, mids recessed', shape: (f) => {
    let v = 0
    if (f <= 60) v += 6
    else if (f < 400) v += 6 * Math.max(0, 1 - Math.log(f / 60) / Math.log(400 / 60))
    if (f >= 10000) v += 5
    else if (f > 2500) v += 5 * (Math.log(f / 2500) / Math.log(4))
    v -= 2 * Math.exp(-Math.pow((Math.log(f / 1000)) / 0.5, 2))
    return v
  }},
  'Bright': { desc: 'Treble forward, detail maksimum', shape: (f) => {
    let v = 0
    if (f >= 4000) v += 4 * (Math.log(f / 4000) / Math.log(5))
    if (f < 200) v -= 2
    return v
  }},
  'Basshead': { desc: 'Sub-bass maksimum', shape: (f) => {
    if (f <= 60) return 10
    if (f < 500) return 10 * Math.max(0, 1 - Math.log(f / 60) / Math.log(500 / 60))
    return 0
  }},
  'Vocal Forward': { desc: 'Midrange & vocal ke depan', shape: (f) => {
    let v = 0
    v += 4 * Math.exp(-Math.pow((Math.log(f / 1500)) / 0.45, 2))
    v += 3 * Math.exp(-Math.pow((Math.log(f / 350)) / 0.5, 2))
    if (f <= 80) v -= 1
    return v
  }},
  'Harman-like Fun': { desc: 'Harman dengan bass boost tambahan', shape: (f) => {
    // approx Harman 2019 IE + 3dB bass
    let v = 0
    const harman = (ff) => {
      let h = 0
      h += 6 * Math.exp(-Math.pow((Math.log(ff / 60)) / 0.7, 2))
      h += 9 * Math.exp(-Math.pow((Math.log(ff / 3000)) / 0.35, 2))
      h += 4 * Math.exp(-Math.pow((Math.log(ff / 8000)) / 0.4, 2))
      return h
    }
    v = harman(f)
    if (f <= 60) v += 3
    else if (f < 300) v += 3 * Math.max(0, 1 - Math.log(f / 60) / Math.log(300 / 60))
    return v
  }}
}

export function signaturePoints(sigName) {
  const sig = SOUND_SIGNATURES[sigName]
  if (!sig) return null
  const points = []
  for (let f = 20; f <= 20000; f *= 1.04) {
    points.push([Math.round(f * 100) / 100, sig.shape(f)])
  }
  return points
}

// noise generators
export function makePinkNoiseBuffer(ctx, seconds = 2) {
  const sr = ctx.sampleRate
  const buf = ctx.createBuffer(1, sr * seconds, sr)
  const data = buf.getChannelData(0)
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0
  for (let i = 0; i < data.length; i++) {
    const white = Math.random() * 2 - 1
    b0 = 0.99886 * b0 + white * 0.0555179
    b1 = 0.99332 * b1 + white * 0.0750759
    b2 = 0.969 * b2 + white * 0.153852
    b3 = 0.8665 * b3 + white * 0.3104856
    b4 = 0.55 * b4 + white * 0.5329522
    b5 = -0.7616 * b5 - white * 0.016898
    data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11
    b6 = white * 0.115926
  }
  return buf
}
