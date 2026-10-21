import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react'
import { autoEQ, calcPreamp, eqToText, parseEqText, graphicEqToText, filterChainDb, biquadCoeffs, biquadDb, signaturePoints, SOUND_SIGNATURES } from './dsp'

export default function EqPanel({ selectedCurve, onFiltersChange, targetPoints, curves = [], deviceConstraints, customTargets = {}, hearingProfile, appFilters, appPreamp }) {
  const [filters, setFilters] = useState([])
  const [preamp, setPreamp] = useState(0)

  // sync dari App state (load preset, share import, device pull) — EqPanel jadi controlled
  useEffect(() => {
    if (appFilters !== undefined) setFilters(appFilters)
  }, [appFilters])
  useEffect(() => {
    if (appPreamp !== undefined) setPreamp(appPreamp)
  }, [appPreamp])
  const [autoOpts, setAutoOpts] = useState({ maxFilters: 8, freqMin: 40, freqMax: 10000, gainMax: 12 })
  const [autoTarget, setAutoTarget] = useState('')
  const [status, setStatus] = useState('')
  const [playing, setPlaying] = useState(false)
  const [source, setSource] = useState('pink')
  const [tone, setTone] = useState(1000)
  const [sweepFrom, setSweepFrom] = useState(100)
  const [sweepTo, setSweepTo] = useState(10000)
  const [sweeping, setSweeping] = useState(false)
  const [volume, setVolume] = useState(0.5)
  const [balance, setBalance] = useState(0)
  const [eqOn, setEqOn] = useState(true)
  const [useHearing, setUseHearing] = useState(false)
  // A/B mode: null = off, 'A' = EQ bypassed (original), 'B' = EQ active
  const [ab, setAb] = useState(null)
  // effective EQ state: A/B 'A' overrides eqOn
  const eqActive = ab === 'A' ? false : eqOn

  // cleanup audio context bila component unmount
  useEffect(() => {
    return () => {
      if (nodesRef.current) {
        try { nodesRef.current.source.stop() } catch (_) {}
        nodesRef.current = null
      }
      if (ctxRef.current) {
        ctxRef.current.close().catch(() => {})
        ctxRef.current = null
      }
    }
  }, [])

  const audioRef = useRef(null)
  const ctxRef = useRef(null)
  const nodesRef = useRef(null)
  const fileRef = useRef(null)

  const targets = useMemo(() => {
    if (!window.api) return []
    return targetPoints ? Object.keys(targetPoints).map((k) => ({ value: k, label: k })) : []
  }, [targetPoints])

  // rig compatibility: 711 targets vs 5128 targets
  const rigOfTarget = (t) => {
    if (!t) return null
    if (/5128|LMG|JM-1/i.test(t)) return '5128'
    if (/oratory|Innerfidelity|Rtings|HMS|GRAS|over-ear/i.test(t)) return 'over-ear'
    return '711'
  }
  const rigOfCurve = (c) => {
    if (!c) return null
    const r = c.rig || ''
    if (/4620|5128/i.test(r)) return '5128'
    if (/GRAS|HMS|over-ear|Headphone|Rtings|Innerfidelity/i.test(r)) return 'over-ear'
    return '711'
  }
  const compat = (targetName) => {
    if (!selectedCurve) return null
    const tRig = rigOfTarget(targetName)
    const cRig = rigOfCurve(selectedCurve)
    if (tRig === cRig) return 'ok'
    if (tRig === 'over-ear' || cRig === 'over-ear') return 'warn'
    return 'mismatch'
  }

  const updateFilters = (nf) => {
    setFilters(nf)
    const pa = calcPreamp(nf)
    setPreamp(pa)
    onFiltersChange(nf, pa, selectedCurve?.name)
  }

  const addFilter = () => {
    updateFilters([...filters, { fid: Date.now() + Math.random(), type: 'PK', freq: 1000, gain: 0, q: 1.41, enabled: true }])
  }

  const editFilter = (i, field, val) => {
    const nf = filters.map((f, j) => (j === i ? { ...f, [field]: val } : f))
    const pa = calcPreamp(nf)
    setFilters(nf)
    setPreamp(pa)
    onFiltersChange(nf, pa, selectedCurve?.name)
  }

  const removeFilter = (i) => updateFilters(filters.filter((_, j) => j !== i))

  const disableAll = () => updateFilters(filters.map((f) => ({ ...f, enabled: false })))

  const runAutoEQ = () => {
    if (!selectedCurve) {
      setStatus('Select a curve first: Extra tab → "EQ applies to" or 🎚 in the table below')
      return
    }
    if (!autoTarget) {
      setStatus('Select an AutoEQ target first (dropdown next to ⚡ AutoEQ)')
      return
    }
    // resolve target: preset ("target:..."), signature ("sig:...") atau curve IEM lain ("curve:...")
    let targetPointsList = null
    let targetLabel = autoTarget
    if (autoTarget.startsWith('curve:')) {
      const cname = autoTarget.slice(6)
      const curve = curves.find((c) => c.name === cname)
      if (!curve) { setStatus('Target curve not found'); return }
      targetPointsList = curve.points
      targetLabel = curve.name
    } else if (autoTarget.startsWith('sig:')) {
      const sigName = autoTarget.slice(4)
      targetPointsList = signaturePoints(sigName)
      if (!targetPointsList) { setStatus('Signature not found'); return }
      targetLabel = `${sigName} signature`
    } else if (autoTarget.startsWith('custom:')) {
      const ct = customTargets[autoTarget.slice(7)]
      if (!ct || !ct.points) { setStatus('Custom target not found'); return }
      targetPointsList = ct.points
      targetLabel = ct.name
    } else {
      const t = targetPoints[autoTarget.slice(7)]
      if (!t || !t.points) { setStatus('Target data not found'); return }
      targetPointsList = t.points
    }
    let meas = selectedCurve.points
    const nf = autoEQ(meas, targetPointsList, { ...autoOpts, hearingProfile: useHearing ? hearingProfile : null })
    updateFilters(nf)
    setStatus(`AutoEQ: ${nf.length} filters — ${selectedCurve.name} → ${targetLabel}`)
  }

  const exportEq = async () => {
    if (!window.api) return
    const txt = eqToText(filters, preamp)
    await window.api.saveText('eq.txt', txt)
    setStatus('EQ exported')
  }

  const exportGraphicEq = async () => {
    if (!window.api) return
    const txt = graphicEqToText(filters, preamp)
    await window.api.saveText('graphic-eq-wavelet.txt', txt)
    setStatus('Graphic EQ (127-band, Wavelet) exported')
  }

  const importEq = async () => {
    if (!window.api) return
    const raw = await window.api.loadPreset()
    if (!raw) return
    try {
      const { filters: f, preamp: pa } = parseEqText(raw)
      setFilters(f)
      setPreamp(pa)
      onFiltersChange(f, pa)
      setStatus(`Imported ${f.length} filters`)
    } catch (e) {
      setStatus(`Import failed: ${e.message}`)
    }
  }

  const buildAudioGraph = useCallback(() => {
    if (!ctxRef.current) {
      ctxRef.current = new (window.AudioContext || window.webkitAudioContext)()
    }
    const ctx = ctxRef.current
    if (nodesRef.current) {
      try { nodesRef.current.source.stop() } catch (_) {}
      try { nodesRef.current.splitter.disconnect() } catch (_) {}
      nodesRef.current = null
    }
    const source = ctx.createBufferSource()
    source.buffer = getPinkBuf()
    source.loop = true

    const splitter = ctx.createChannelSplitter(2)
    const filtersL = []
    const filtersR = []
    const n = filters.length
    for (let c = 0; c < 2; c++) {
      for (const f of filters) {
        const bq = ctx.createBiquadFilter()
        bq.type = f.type === 'PK' ? 'peaking' : f.type === 'LSQ' ? 'lowshelf' : 'highshelf'
        bq.frequency.value = f.freq
        bq.gain.value = eqActive && f.enabled !== false ? f.gain : 0
        bq.Q.value = f.q
        bq._eqFilter = f
        if (c === 0) filtersL.push(bq)
        else filtersR.push(bq)
      }
    }
    const merger = ctx.createChannelMerger(2)
    const gainL = ctx.createGain()
    const gainR = ctx.createGain()
    const preGain = ctx.createGain()
    preGain.gain.value = Math.pow(10, preamp / 20)
    source.connect(preGain)
    preGain.connect(splitter)
    let nodeL = splitter
    const bqNodes = []
    for (const f of filtersL) { nodeL.connect(f); nodeL = f; bqNodes.push(f) }
    nodeL.connect(gainL)
    let nodeR = splitter
    for (const f of filtersR) { nodeR.connect(f); nodeR = f }
    nodeR.connect(gainR)
    gainL.connect(merger, 0, 0)
    gainR.connect(merger, 0, 1)
    merger.connect(ctx.destination)
    nodesRef.current = { source, splitter, gainL, gainR, filtersL, filtersR, preGain, bqNodes }
    return nodesRef.current
  }, [filters, preamp, eqActive])

  const pinkBufRef = useRef(null)

  const getPinkBuf = () => {
    const ctx = ctxRef.current || new (window.AudioContext || window.webkitAudioContext)()
    ctxRef.current = ctx
    if (!pinkBufRef.current) {
      const sr = ctx.sampleRate
      const buf = ctx.createBuffer(1, sr * 2, sr)
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
      pinkBufRef.current = buf
    }
    return pinkBufRef.current
  }

  const setVolBalance = () => {
    const n = nodesRef.current
    if (!n) return
    const base = volume
    const bal = (balance + 50) / 100
    n.gainL.gain.value = base * (1 - Math.max(0, (bal - 0.5) * 2))
    n.gainR.gain.value = base * (1 - Math.max(0, (0.5 - bal) * 2))
  }

  const stopAll = () => {
    if (nodesRef.current) {
      try { nodesRef.current.source.stop() } catch (_) {}
      nodesRef.current = null
    }
    setPlaying(false)
    setSweeping(false)
    if (fileRef.current) {
      fileRef.current = null
    }
  }

  const play = (restart = false) => {
    const ctx = ctxRef.current || new (window.AudioContext || window.webkitAudioContext)()
    ctxRef.current = ctx
    if (ctx.state === 'suspended') ctx.resume()
    if (playing && !restart) { stopAll(); return }
    if (restart) {
      // live-toggle hanya kalau chain semasa sepadan source semasa
      const chainMatchesSource = nodesRef.current && (
        (source === 'pink' && nodesRef.current.splitter) ||
        ((source === 'tone' || source === 'sweep') && nodesRef.current.bqNodes && !nodesRef.current.splitter) ||
        (source === 'file' && nodesRef.current.bqNodes && !nodesRef.current.splitter)
      )
      const canLiveToggle = chainMatchesSource && nodesRef.current?.bqNodes?.length
      if (!canLiveToggle && nodesRef.current) {
        try { nodesRef.current.source.stop() } catch (_) {}
        nodesRef.current = null
        setPlaying(false)
      }
      if (canLiveToggle) return
    }
    if (source === 'tone' || source === 'sweep') {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      gain.gain.value = volume * 0.3
      osc.frequency.value = tone
      let sweepRaf = null
      if (source === 'sweep') {
        const t0 = ctx.currentTime
        const dur = 10
        osc.frequency.setValueAtTime(sweepFrom, t0)
        osc.frequency.exponentialRampToValueAtTime(sweepTo, t0 + dur)
        // stop selepas sweep habis — jangan bunyi selamanya
        osc.stop(t0 + dur)
        osc.onended = () => setPlaying(false)
      }
      // build chain SEKALI sahaja & simpan refs untuk A/B live toggle
      const bqNodes = []
      let node = osc
      const preGain = ctx.createGain()
      preGain.gain.value = Math.pow(10, preamp / 20)
      node.connect(preGain)
      node = preGain
      if (eqActive && filters.length) {
        for (const f of filters) {
          if (f.enabled === false) continue
          const bq = ctx.createBiquadFilter()
          bq.type = f.type === 'PK' ? 'peaking' : f.type === 'LSQ' ? 'lowshelf' : 'highshelf'
          bq.frequency.value = f.freq
          bq.gain.value = f.gain
          bq.Q.value = f.q
          bq._eqFilter = f
          node.connect(bq)
          node = bq
          bqNodes.push(bq)
        }
      }
      node.connect(gain)
      gain.connect(ctx.destination)
      osc.start()
      nodesRef.current = { source: osc, bqNodes, gain, preGain }
      setPlaying(true)
      return
    }
    if (source === 'file') {
      if (!fileRef.current) { setStatus('Load audio track first (click Load track…)'); loadAudioFile(); return }
      const ctx2 = ctxRef.current
      fetch(fileRef.current).then(r => r.arrayBuffer()).then(ab => ctx2.decodeAudioData(ab)).then(buf => {
        const src = ctx2.createBufferSource()
        src.buffer = buf
        src.loop = true  // loop supaya A/B toggle tak hentikan lagu
        const bqNodes = []
        let node = src
        const preGain = ctx2.createGain()
        preGain.gain.value = Math.pow(10, preamp / 20)
        node.connect(preGain)
        node = preGain
        if (filters.length) {
          for (const f of filters) {
            if (f.enabled === false) continue
            const bq = ctx2.createBiquadFilter()
            bq.type = f.type === 'PK' ? 'peaking' : f.type === 'LSQ' ? 'lowshelf' : f.type === 'HSQ' ? 'highshelf' : 'peaking'
            bq.frequency.value = f.freq
            bq.gain.value = f.gain
            bq.Q.value = f.q
            bq._eqFilter = f
            node.connect(bq)
            node = bq
            bqNodes.push(bq)
          }
        }
        const gain = ctx2.createGain()
        gain.gain.value = volume
        node.connect(gain)
        gain.connect(ctx2.destination)
        src.start()
        src.onended = () => setPlaying(false)
        nodesRef.current = { source: src, bqNodes, gain, preGain }
        setPlaying(true)
      }).catch(e => setStatus(`Audio load failed: ${e.message}`))
      return
    }
    // pink noise through stereo EQ chain
    const n = buildAudioGraph()
    if (!n) return
    n.source.buffer = getPinkBuf()
    setVolBalance()
    n.source.start()
    setPlaying(true)
  }

  const loadAudioFile = async () => {
    if (!window.api) return
    const p = await window.api.openAudioFile()
    if (p) {
      fileRef.current = p
      setStatus(`Track loaded: ${p.split(/[\\/]/).pop()}`)
    }
  }

  return (
    <div className="eqpanel">
      <div className="row eqheader">
        <h3>EQ</h3>
        <label className="chk"><input type="checkbox" checked={eqOn} onChange={(e) => setEqOn(e.target.checked)} /> EQ active</label>
        {ab !== null && (
          <button
            className={ab === 'B' ? 'primary' : ''}
            onClick={() => {
              const next = ab === 'A' ? 'B' : 'A'
              setAb(next)
              // untuk tone/sweep/file: toggle gain biquad secara live — tak restart lagu
              const n = nodesRef.current
              if (n && n.bqNodes?.length) {
                const wantEq = next === 'B'
                for (const bq of n.bqNodes) {
                  if (bq._eqFilter) bq.gain.value = wantEq ? bq._eqFilter.gain : 0
                }
                if (n.preGain) n.preGain.gain.value = wantEq ? Math.pow(10, preamp / 20) : 1
                return
              }
              // fallback rebuild (kalau nodes belum dibina)
              if (playing) setTimeout(() => play(true), 30)
            }}
            title="A = original (EQ off) | B = with EQ — klik untuk toggle"
          >
            {ab === 'A' ? '▶ A: Original' : '▶ B: With EQ'}
          </button>
        )}
        <button
          onClick={() => {
            if (ab === null) {
              // jika audio file telah dipilih, minta ia dulu
              if (source === 'file' && !fileRef.current) {
                setStatus('Load audio track first (or switch to pink noise/tone)')
                return
              }
              setAb('B')
              if (!playing) {
                // mainkan source semasa (bukan paksa pink noise)
                if (source === 'file') {
                  // file path handler akan mula secara async
                  play(true)
                } else {
                  setTimeout(() => play(true), 30)
                }
              }
            } else {
              setAb(null)
              // tak restart — playback berterusan, cuma mode off
            }
          }}
          title="Start/stop A/B comparison"
        >
          {ab === null ? 'A/B compare' : '■ Stop A/B'}
        </button>
        <span className="preamp">Pre-amp: {preamp.toFixed(1)} dB</span>
      </div>

      <div className="row autoeq">
        <select value={autoTarget} onChange={(e) => setAutoTarget(e.target.value)}>
          <option value="">AutoEQ target…</option>
          <optgroup label="IEMs on graph (EQ toward this IEM)">
            {curves.filter((c) => c.name !== selectedCurve?.name).map((c) => (
              <option key={c.name} value={`curve:${c.name}`}>{c.name} ({c.rig === 'custom' ? 'imported' : c.rig})</option>
            ))}
          </optgroup>
          <optgroup label="Preset targets — 711">
            {targets.filter((t) => rigOfTarget(t.value) === '711').map((t) => (
              <option key={t.value} value={`target:${t.value}`}>{t.label}</option>
            ))}
          </optgroup>
          <optgroup label="Preset targets — 5128">
            {targets.filter((t) => rigOfTarget(t.value) === '5128').map((t) => (
              <option key={t.value} value={`target:${t.value}`}>{t.label}</option>
            ))}
          </optgroup>
          <optgroup label="Preset targets — over-ear">
            {targets.filter((t) => rigOfTarget(t.value) === 'over-ear').map((t) => (
              <option key={t.value} value={`target:${t.value}`}>{t.label}</option>
            ))}
          </optgroup>
          <optgroup label="Sound signatures">
            {Object.keys(SOUND_SIGNATURES).map((s) => (
              <option key={s} value={`sig:${s}`}>{s} — {SOUND_SIGNATURES[s].desc}</option>
            ))}
          </optgroup>
          {Object.keys(customTargets).length > 0 && (
            <optgroup label="Custom targets">
              {Object.values(customTargets).map((t) => (
                <option key={t.name} value={`custom:${t.name}`}>🎯 {t.name}</option>
              ))}
            </optgroup>
          )}
        </select>
        <button onClick={runAutoEQ} className="primary">⚡ AutoEQ</button>
        {hearingProfile && Object.keys(hearingProfile).length > 0 && (
          <label className="chk" title="Weight EQ effort by your hearing test results — skip regions you can't hear">
            <input type="checkbox" checked={useHearing} onChange={(e) => setUseHearing(e.target.checked)} /> 👂
          </label>
        )}
      </div>
      {autoTarget.startsWith('target:') && compat(autoTarget.slice(7)) === 'mismatch' && (
        <p className="warn-msg">⚠ Rig mismatch: {rigOfCurve(selectedCurve)} measurement vs {rigOfTarget(autoTarget.slice(7))} target — ear gain region (2-4kHz) may be off by several dB. Select a target from the same rig for accurate results.</p>
      )}
      {autoTarget.startsWith('target:') && compat(autoTarget.slice(7)) === 'warn' && (
        <p className="warn-msg">⚠ Measurement IEM vs target headphone (atau sebaliknya) — hasil mungkin pelik.</p>
      )}
      <div className="row autoopts">
        <label>F {autoOpts.freqMin}–{autoOpts.freqMax} Hz
          <input type="range" min="40" max="500" value={autoOpts.freqMin} onChange={(e) => setAutoOpts({ ...autoOpts, freqMin: +e.target.value })} />
        </label>
        <label>Max gain ±{autoOpts.gainMax} dB
          <input type="range" min="3" max="15" value={autoOpts.gainMax} onChange={(e) => setAutoOpts({ ...autoOpts, gainMax: +e.target.value })} />
        </label>
        <label>Filters: {autoOpts.maxFilters}
          <input type="range" min="3" max="12" value={autoOpts.maxFilters} onChange={(e) => setAutoOpts({ ...autoOpts, maxFilters: +e.target.value })} />
        </label>
      </div>

      <div className="filters">
        {filters.map((f, i) => (
          <div className="filter-row" key={f.fid || i}>
            <input type="checkbox" checked={f.enabled !== false} onChange={(e) => editFilter(i, 'enabled', e.target.checked)} />
            <select value={f.type} onChange={(e) => editFilter(i, 'type', e.target.value)}>
              <option value="PK">PK</option>
              <option value="LSQ">LSQ</option>
              <option value="HSQ">HSQ</option>
            </select>
            <input type="number" step="10" value={f.freq} onChange={(e) => editFilter(i, 'freq', +e.target.value)} title="Freq (Hz)" />
            <input type="number" step="0.5" value={f.gain} onChange={(e) => editFilter(i, 'gain', +e.target.value)} title="Gain (dB)" />
            <input type="number" step="0.1" value={f.q} onChange={(e) => editFilter(i, 'q', +e.target.value)} title="Q" />
            <button className="rm" onClick={() => removeFilter(i)}>×</button>
          </div>
        ))}
      </div>
      <div className="row">
        <button onClick={addFilter}>+ Add filter</button>
        <button onClick={disableAll}>Disable all</button>
      </div>
      <div className="row">
        <button onClick={exportEq}>Export EQ</button>
        <button onClick={exportGraphicEq}>Export Wavelet</button>
        <button onClick={importEq}>Import EQ</button>
      </div>

      {deviceConstraints && filters.length > 0 && (() => {
        const maxG = deviceConstraints.maxGain ?? 12
        const maxF = deviceConstraints.maxFilters ?? 10
        const overGain = filters.filter((f) => f.enabled !== false && Math.abs(f.gain) > maxG)
        const overCount = filters.filter((f) => f.enabled !== false).length > maxF
        if (!overGain.length && !overCount) return null
        return (
          <p className="warn-msg">
            ⚠ Headroom {deviceConstraints.model || 'device'}: {overCount ? `max ${maxF} bands — reduce filters; ` : ''}
            {overGain.length > 0 ? `${overGain.length} filter(s) exceed ±${maxG}dB (${overGain.map((f) => `${f.gain > 0 ? '+' : ''}${f.gain}dB@${Math.round(f.freq)}Hz`).join(', ')}) — will be clamped on push` : ''}
          </p>
        )
      })()}

      <div className="playback">
        <h3>Playback</h3>
        <div className="row">
          <select value={source} onChange={(e) => { stopAll(); setSource(e.target.value) }}>
            <option value="pink">Pink noise</option>
            <option value="tone">Tone</option>
            <option value="sweep">Sweep</option>
            <option value="file">Audio file</option>
          </select>
          <button className="primary" onClick={() => play()}>{playing ? '■ Stop' : '▶ Play'}</button>
        </div>
        {source === 'tone' && (
          <div className="row">
            <label>Tone: {tone} Hz
              <input type="range" min="20" max="20000" value={tone} onChange={(e) => { setTone(+e.target.value); if (nodesRef.current?.source?.frequency) nodesRef.current.source.frequency.value = +e.target.value }} />
            </label>
          </div>
        )}
        {source === 'sweep' && (
          <div className="row">
            <label>From {sweepFrom} Hz
              <input type="range" min="20" max="5000" value={sweepFrom} onChange={(e) => setSweepFrom(+e.target.value)} />
            </label>
            <label>To {sweepTo} Hz
              <input type="range" min="1000" max="20000" value={sweepTo} onChange={(e) => setSweepTo(+e.target.value)} />
            </label>
          </div>
        )}
        {source === 'file' && (
          <div className="row">
            <button onClick={loadAudioFile}>Load track…</button>
            <span className="hint">{fileRef.current ? fileRef.current.split(/[\\/]/).pop() : 'No track'}</span>
          </div>
        )}
        <div className="row">
          <label>Vol
            <input type="range" min="0" max="1" step="0.01" value={volume} onChange={(e) => { setVolume(+e.target.value); setVolBalance(); const n = nodesRef.current; if (n?.gain) n.gain.gain.value = +e.target.value; if (n?.gainL) { const base = +e.target.value; const bal = (balance + 50) / 100; n.gainL.gain.value = base * (1 - Math.max(0, (bal - 0.5) * 2)); n.gainR.gain.value = base * (1 - Math.max(0, (0.5 - bal) * 2)) } }} />
          </label>
          <label>Balance L/R
            <input type="range" min="-50" max="50" value={balance} onChange={(e) => { setBalance(+e.target.value); setVolBalance() }} />
          </label>
        </div>
      </div>
      {status && <p className="status">{status}</p>}
    </div>
  )
}
