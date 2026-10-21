import React, { useState, useMemo, useEffect, useRef } from 'react'
import Graph, { smoothPoints, adjustPoints } from './Graph'
import DbBrowser from './DbBrowser'
import EqPanel from './EqPanel'
import DevicePanel from './DevicePanel'
import { ScorePanel, AmpCalc, CompareTable } from './Stats'
import { UniversalEqPanel, CrossoverSim, HearingTest } from './Tools'
import { FindSimilar, BlindTest, UnitVarianceNote, UnitVarianceCompare } from './FeaturePanels'
import PromptModal from './PromptModal'
import { parseData } from './data'
import { filterChainDb, calcPreamp, signaturePoints, SOUND_SIGNATURES } from './dsp'

const COLORS = ['#4fc3f7', '#ffb74d', '#81c784', '#f06292', '#9575cd', '#4db6ac', '#e57373', '#ba68c8', '#a1887f', '#90a4ae', '#ffd54f', '#64b5f6']
const RIG_LABEL = { 'Bruel & Kjaer 4620': '5128', 'GRAS 43AG-7': 'GRAS', 'EARS + 711': 'EARS+711', '711': '711', '5128-ish': '5128', 'HMS II.3': 'HMS', earbud: 'earbud', Rtings: 'Rtings', Innerfidelity: 'Innerfidelity', 'Headphone.com': 'HP.com' }

// safe localStorage setItem — tak crash bila quota penuh
const safeSetItem = (key, val) => {
  try {
    localStorage.setItem(key, val)
    return true
  } catch (e) {
    console.warn('localStorage write failed:', key, e.message)
    return false
  }
}
let uidCounter = 0
const uid = () => `c${Date.now().toString(36)}${(uidCounter++).toString(36)}`

export default function App() {
  const [models, setModels] = useState([])
  const [targets, setTargets] = useState({})
  const [curves, setCurves] = useState([])
  const [selectedTarget, setSelectedTarget] = useState('')
  const [smoothing, setSmoothing] = useState(0.15)
  const [normalize, setNormalize] = useState(true)
  const [normFreq, setNormFreq] = useState(1000)
  const [normDb, setNormDb] = useState(0)
  const [xDomain, setXDomain] = useState([20, 20000])
  const [yDomain, setYDomain] = useState([-15, 15])
  const [showLabels, setShowLabels] = useState(true)
  const [inspector, setInspector] = useState(true)
  const [showBounds, setShowBounds] = useState(false)
  const [targetAdj, setTargetAdj] = useState({ tilt: 0, earGain: 0, bass: 0, treble: 0 })
  const [url, setUrl] = useState('')
  const [status, setStatus] = useState('')
  const [eqFilters, setEqFilters] = useState([])
  const [eqPreamp, setEqPreamp] = useState(0)
  const [eqForCurve, setEqForCurve] = useState('')
  const [activeTab, setActiveTab] = useState('db')
  const [search, setSearch] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [cacheInfo, setCacheInfo] = useState(null)
  const [showBands, setShowBands] = useState(true)
  const [diffOn, setDiffOn] = useState(false)
  const [favorites, setFavorites] = useState(() => {
    try { return JSON.parse(localStorage.getItem('favs') || '[]') } catch (_) { return [] }
  })
  const [recents, setRecents] = useState(() => {
    try { return JSON.parse(localStorage.getItem('recents') || '[]') } catch (_) { return [] }
  })
  const [eqPresets, setEqPresets] = useState(() => {
    try { return JSON.parse(localStorage.getItem('eqPresets') || '{}') } catch (_) { return {} }
  })
  const [abMode, setAbMode] = useState(false)
  const [deviceConstraints, setDeviceConstraints] = useState(null)
  const [unitVariance, setUnitVariance] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [sidebarWidth, setSidebarWidth] = useState(() => parseInt(localStorage.getItem('sidebarWidth')) || 360)
  const [draggingSidebar, setDraggingSidebar] = useState(false)

  const onSidebarDrag = (e) => {
    if (!draggingSidebar) return
    const w = Math.min(600, Math.max(280, e.clientX))
    setSidebarWidth(w)
  }

  useEffect(() => {
    if (!draggingSidebar) return
    const up = () => {
      setDraggingSidebar(false)
      safeSetItem('sidebarWidth', String(sidebarWidth))
    }
    const move = (e) => onSidebarDrag(e)
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
    return () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
  }, [draggingSidebar, sidebarWidth])
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark')
  const [accent, setAccent] = useState(() => localStorage.getItem('accent') || 'cyan')

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    safeSetItem('theme', theme)
  }, [theme])

  useEffect(() => {
    document.documentElement.dataset.accent = accent
    safeSetItem('accent', accent)
  }, [accent])

  // keyboard shortcuts
  useEffect(() => {
    const onKey = (e) => {
      // skip bila typing dalam input
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return
      switch (e.key.toLowerCase()) {
        case 's': exportPng(); break
        case 'd': setDiffOn((v) => !v); break
        case 'l': setShowLabels((v) => !v); break
        case 'i': setInspector((v) => !v); break
        case 'u': setUnitVariance((v) => !v); break
        case 'h': { // hide/show last curve
          const vis = curves.filter((c) => !c.hidden)
          if (vis.length) setCurveField(vis[vis.length - 1].name, 'hidden', true)
          break
        }
        case '+': case '=': { // zoom in
          const [x0, x1] = xDomain
          const mid = Math.pow(10, (Math.log10(x0) + Math.log10(x1)) / 2)
          const factor = 1.4
          setXDomain([Math.max(20, mid / factor), Math.min(20000, mid * factor)])
          break
        }
        case '-': { // zoom out
          const [x0, x1] = xDomain
          const mid = Math.pow(10, (Math.log10(x0) + Math.log10(x1)) / 2)
          const factor = 1.4
          setXDomain([Math.max(20, mid * factor), Math.min(20000, mid / factor)])
          break
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [curves, xDomain])
  // prompt() replacement modal state
  const [promptModal, setPromptModal] = useState(null)
  const askPrompt = (title, placeholder, defaultValue = '') =>
    new Promise((resolve) => {
      setPromptModal({ title, placeholder, defaultValue, resolve })
    })
  const [customTargets, setCustomTargets] = useState(() => {
    try { return JSON.parse(localStorage.getItem('customTargets') || '{}') } catch (_) { return {} }
  })
  const [collection, setCollection] = useState(() => {
    try { return JSON.parse(localStorage.getItem('collection') || '[]') } catch (_) { return [] }
  })
  const [hearingProfile, setHearingProfile] = useState(() => {
    try { return JSON.parse(localStorage.getItem('hearingProfile') || 'null') } catch (_) { return null }
  })

  // -- session auto-save: restore on load, save on change (debounced) --
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('session') || 'null')
      if (saved && Array.isArray(saved.curves) && saved.curves.length) {
        // validate: buang curves dengan points rosak/kosong
        const valid = saved.curves.filter((c) => c && Array.isArray(c.points) && c.points.length > 1 && c.name)
        if (valid.length) {
          setCurves(valid.map((c) => ({ ...c, channels: c.channels || {}, id: c.id || uid() })))
          setEqFilters(Array.isArray(saved.eq) ? saved.eq : [])
          setEqPreamp(saved.eqPreamp || 0)
          // eqFor mesti padan dengan curve yang wujud — kalau tidak, clear
          const eqForValid = saved.eqFor && valid.some((c) => c.name === saved.eqFor)
          setEqForCurve(eqForValid ? saved.eqFor : '')
          if (!eqForValid && saved.eqFor) { setEqFilters([]); setEqPreamp(0) }
          setSelectedTarget(saved.target || '')
          setSmoothing(saved.smoothing ?? 0.15)
          setNormFreq(saved.normFreq || 1000)
          setNormDb(saved.normDb || 0)
        }
      }
    } catch (_) {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const t = setTimeout(() => {
      // downsample channels utk elak quota (~5MB): simpan max 300 points per channel
      const slim = (pts, max) => {
        if (!Array.isArray(pts) || pts.length <= max) return pts
        const step = Math.ceil(pts.length / max)
        return pts.filter((_, i) => i % step === 0)
      }
      const slimChannels = (ch) => {
        if (!ch || (!ch.L && !ch.R)) return {}
        return { L: ch.L ? slim(ch.L, 300) : undefined, R: ch.R ? slim(ch.R, 300) : undefined }
      }
      // slim points juga kalau besar (elak quota) — bulatkan ke 2 decimal
      const slimPoints = (pts) => {
        if (!Array.isArray(pts) || pts.length <= 400) return pts
        const step = Math.ceil(pts.length / 400)
        return pts.filter((_, i) => i % step === 0).map(([f, v]) => [Math.round(f * 10) / 10, Math.round(v * 100) / 100])
      }
      const ok = safeSetItem('session', JSON.stringify({
        curves: curves.map(({ id, name, rig, source, points, channels, channelMode, color, hidden, pinned, dash, weight, eqFilters, preamp }) => ({
          id, name, rig, source, points: slimPoints(points), channels: slimChannels(channels), channelMode, color, hidden, pinned, dash, weight, eqFilters, preamp
        })),
        eq: eqFilters, eqPreamp, eqFor: eqForCurve, target: selectedTarget, smoothing, normFreq, normDb
      }))
      if (!ok) {
        // quota penuh: retry dengan points slim tanpa channels
        const ok2 = safeSetItem('session', JSON.stringify({
          curves: curves.map(({ id, name, rig, source, points, channelMode, color, hidden, pinned, dash, weight, eqFilters, preamp }) => ({
            id, name, rig, source, points: slimPoints(points), channels: {}, channelMode, color, hidden, pinned, dash, weight, eqFilters, preamp
          })),
          eq: eqFilters, eqPreamp, eqFor: eqForCurve, target: selectedTarget, smoothing, normFreq, normDb
        }))
        if (!ok2) setStatus('Session too large to save — some curves will be lost on restart')
      }
    }, 800)
    return () => clearTimeout(t)
  }, [curves, eqFilters, eqPreamp, eqForCurve, selectedTarget, smoothing, normFreq, normDb])

  useEffect(() => {
    if (window.api) {
      window.api.dbIndex().then((m) => setModels(m)).catch((e) => setStatus(`DB index failed: ${e.message}`))
      window.api.dbTargets().then((t) => setTargets(t)).catch((e) => setStatus(`Targets failed: ${e.message}`))
      window.api.dbCacheInfo?.().then(setCacheInfo).catch(() => {})
    }
  }, [])

  const refreshDatabase = async () => {
    if (!window.api) return
    setRefreshing(true)
    setStatus('Refreshing database… (internet required)')
    try {
      await window.api.dbRefresh()
      const m = await window.api.dbIndex()
      setModels(m)
      const info = await window.api.dbCacheInfo()
      setCacheInfo(info)
      setStatus(`Database refreshed: ${m.length} models`)
    } catch (e) {
      setStatus(`Refresh failed: ${e.message}`)
    }
    setRefreshing(false)
  }

  const clearMeasurementCache = async () => {
    if (!window.api) return
    try {
      const { removed } = await window.api.dbClearMeasurementCache()
      const info = await window.api.dbCacheInfo()
      setCacheInfo(info)
      setStatus(`Cleared ${removed} cached measurements`)
    } catch (e) {
      setStatus(`Clear failed: ${e.message}`)
    }
  }

  // ── auto-update ──
  const [updateInfo, setUpdateInfo] = useState(null)
  const [updateProgress, setUpdateProgress] = useState(null)
  const [checking, setChecking] = useState(false)

  useEffect(() => {
    if (window.api?.onUpdateProgress) {
      window.api.onUpdateProgress((d) => setUpdateProgress(d))
    }
  }, [])

  const checkUpdate = async () => {
    if (!window.api?.updateCheck) return
    setChecking(true)
    try {
      const r = await window.api.updateCheck()
      setUpdateInfo(r)
      if (r.available) setStatus(`Update available: v${r.current} → v${r.latest}`)
      else setStatus(r.reason ? `Update check failed: ${r.reason}` : `Up to date (v${r.current})`)
    } catch (e) {
      setStatus(`Update check failed: ${e.message}`)
    }
    setChecking(false)
  }

  const downloadUpdate = async () => {
    if (!window.api?.updateDownload) return
    setStatus('Downloading update…')
    const r = await window.api.updateDownload()
    if (r.ok) setStatus('Update downloaded — restart to install')
    else setStatus(`Download failed: ${r.reason}`)
    setUpdateProgress(null)
  }

  const installUpdate = () => {
    if (window.api?.updateInstall) window.api.updateInstall()
  }

  // -- custom target dari curve --
  const saveCurveAsTarget = async () => {
    const c = curves.find((x) => !x.hidden)
    if (!c) { setStatus('No curve to use as target'); return }
    const name = await askPrompt(`Custom target name from "${c.name}":`, 'e.g. My Warm Target')
    if (!name) return
    setCustomTargets((ct) => {
      const out = { ...ct, [name]: { name, points: c.points, rig: c.rig, source: c.source } }
      safeSetItem('customTargets', JSON.stringify(out))
      return out
    })
    setStatus(`Target "${name}" saved — select it in Target/AutoEQ dropdown`)
  }

  const deleteCustomTarget = (name) => {
    setCustomTargets((ct) => {
      const out = { ...ct }
      delete out[name]
      safeSetItem('customTargets', JSON.stringify(out))
      return out
    })
  }

  // -- my collection --
  const inCollection = (name) => collection.some((x) => x.name === name)

  const toggleCollection = (c) => {
    setCollection((col) => {
      const out = inCollection(c.name)
        ? col.filter((x) => x.name !== c.name)
        : [...col, { name: c.name, rig: c.rig, source: c.source, files: c.files, note: '' }]
      safeSetItem('collection', JSON.stringify(out))
      return out
    })
  }

  const setCollectionNote = (name, note) => {
    setCollection((col) => {
      const out = col.map((x) => (x.name === name ? { ...x, note } : x))
      safeSetItem('collection', JSON.stringify(out))
      return out
    })
  }

  // -- share link/file: encode semua curves + EQ ke base64 --
  const shareLink = async () => {
    const state = {
      v: 2,
      curves: curves.map((c) => ({ name: c.name, rig: c.rig, source: c.source, points: c.points, channelMode: c.channelMode, eq: c.eqFilters || [] })),
      eq: eqFilters,
      eqFor: eqForCurve,
      target: selectedTarget,
      smoothing,
      normFreq,
      normDb
    }
    const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(state))))
    const link = `iemunity://share#${b64}`
    // copy ke clipboard
    try {
      await navigator.clipboard.writeText(link)
      setStatus(`Share link copied (${(b64.length / 1024).toFixed(0)} KB) — friends can import it via Extra tab`)
    } catch (_) {
      // fallback save file
      if (window.api) {
        await window.api.saveText('graph-share.agt', link)
        setStatus('Share link saved to file')
      }
    }
  }

  const importShareLink = async () => {
    const link = await askPrompt('Paste share link (iemunity://share#...):', 'iemunity://share#...')
    if (!link) return
    try {
      const b64 = link.includes('#') ? link.split('#')[1] : link.trim()
      const state = JSON.parse(decodeURIComponent(escape(atob(b64))))
      // validate curves (points array sahaja diterima)
      const validCurves = (state.curves || []).filter((c) => c && Array.isArray(c.points) && c.points.length > 1 && c.name)
      if (!validCurves.length) throw new Error('No valid curves in link')
      // load curves sebagai custom imports
      const newCurves = validCurves.map((c, i) => ({
        id: uid(), name: c.name, rig: 'custom', source: c.source || 'shared', points: c.points, channels: {}, channelMode: 'avg',
        color: COLORS[i % COLORS.length], hidden: false, pinned: false, dash: 'solid', weight: 2.2, eqFilters: c.eq || []
      }))
      setCurves(newCurves)
      if (state.smoothing !== undefined) setSmoothing(state.smoothing)
      if (state.normFreq !== undefined) setNormFreq(state.normFreq)
      if (state.normDb !== undefined) setNormDb(state.normDb)
      if (state.target !== undefined) setSelectedTarget(state.target)
      // restore EQ context (filters + target curve)
      if (state.eqFor) setEqForCurve(state.eqFor)
      if (Array.isArray(state.eq)) setEqFilters(state.eq)
      if (state.eqPreamp !== undefined) setEqPreamp(state.eqPreamp)
      eqAutoPicked.current = true
      setStatus(`Imported ${newCurves.length} curves from share link`)
    } catch (e) {
      setStatus(`Import failed: ${e.message}`)
    }
  }

  // -- export CSV semua curves --
  const exportCsv = async () => {
    if (!curves.length) { setStatus('No curves to export'); return }
    if (!window.api) return
    // O(n) — Map lookup bukan find() per freq
    const maps = curves.map((c) => new Map(c.points.map(([f, v]) => [f, v])))
    const freqs = new Set()
    curves.forEach((c) => c.points.forEach(([f]) => freqs.add(f)))
    const sorted = [...freqs].sort((a, b) => a - b)
    const escCsv = (s) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)
    const header = ['frequency', ...curves.map((c) => escCsv(c.name))]
    const lines = [header.join(',')]
    for (const f of sorted) {
      const row = [f]
      for (let ci = 0; ci < curves.length; ci++) {
        const v = maps[ci].get(f)
        row.push(v !== undefined ? (+v).toFixed(2) : '')
      }
      lines.push(row.join(','))
    }
    await window.api.saveText('graph-export.csv', lines.join('\n'))
    setStatus('CSV exported')
  }

  // -- favorites & recents --
  const isFav = (m) => favorites.some((f) => f.name === m.name && f.rig === m.rig)

  const toggleFav = (m) => {
    setFavorites((fs) => {
      const out = isFav(m) ? fs.filter((f) => !(f.name === m.name && f.rig === m.rig)) : [...fs, m]
      safeSetItem('favs', JSON.stringify(out))
      return out
    })
  }

  const trackRecent = (m) => {
    // sim/custom curves tak masuk recents — bukan database model
    if (m.rig === 'sim' || m.rig === 'custom') return
    setRecents((rs) => {
      const out = [{ name: m.name, rig: m.rig, source: m.source, files: m.files }, ...rs.filter((r) => !(r.name === m.name && r.rig === m.rig))].slice(0, 10)
      safeSetItem('recents', JSON.stringify(out))
      return out
    })
  }

  // -- diff curve (A−B): dua curve pertama yang visible, normalized seperti graph --
  const diffCurve = useMemo(() => {
    if (!diffOn) return null
    const vis = curves.filter((c) => !c.hidden)
    if (vis.length < 2) return null
    const [a, b] = vis
    if (!a.points?.length || !b.points?.length) return null
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
    // align kedua-dua ke normFreq (sama macam graph bila normalize ON)
    const offA = normalize ? (normDb || 0) - interp(a.points, normFreq) : 0
    const offB = normalize ? (normDb || 0) - interp(b.points, normFreq) : 0
    return a.points.map(([f, v]) => [f, (v + offA) - (interp(b.points, f) + offB)])
  }, [diffOn, curves, normalize, normFreq, normDb])

  // -- EQ presets per curve --
  const saveEqPreset = async () => {
    if (!eqForCurve || !eqFilters.length) { setStatus('No EQ to save'); return }
    const name = await askPrompt(`EQ preset name for "${eqForCurve}":`, 'e.g. Harman -2dB bass')
    if (!name) return
    setEqPresets((ps) => {
      const existing = (ps[eqForCurve] || []).find((p) => p.name === name)
      const list = existing ? (ps[eqForCurve] || []).map((p) => (p.name === name ? { name, filters: eqFilters, preamp: eqPreamp } : p)) : [...(ps[eqForCurve] || []), { name, filters: eqFilters, preamp: eqPreamp }]
      const out = { ...ps, [eqForCurve]: list }
      safeSetItem('eqPresets', JSON.stringify(out))
      return out
    })
    setStatus(`Preset "${name}" saved`)
  }

  const loadEqPreset = (curveName, preset) => {
    switchEqTarget(curveName, preset.filters, preset.preamp)
    setStatus(`Preset "${preset.name}" loaded`)
  }

  const deleteEqPreset = (curveName, presetName) => {
    setEqPresets((ps) => {
      const out = { ...ps, [curveName]: (ps[curveName] || []).filter((p) => p.name !== presetName) }
      if (!out[curveName].length) delete out[curveName]
      safeSetItem('eqPresets', JSON.stringify(out))
      return out
    })
  }

  // Auto-select EQ curve when only one curve exists — sekali sahaja bila curve mula-mula ditambah
  const eqAutoPicked = useRef(false)
  useEffect(() => {
    if (!eqAutoPicked.current && !eqForCurve && curves.length === 1) {
      eqAutoPicked.current = true
      setEqForCurve(curves[0].name)
    }
    // re-arm bila graph kosong — curve baru lepas tu auto-pick semula
    if (curves.length === 0) eqAutoPicked.current = false
  }, [curves, eqForCurve])

  // graph right-click actions
  const handleGraphContext = (action, freq, db) => {
    if (action === 'addFilter') {
      // tambah PK filter di freq itu, gain 0 — boleh drag lepas tu
      const nf = [...eqFilters, { type: 'PK', freq: Math.round(freq), gain: 0, q: 1.41, enabled: true }]
      const pa = calcPreamp(nf)
      setEqFilters(nf)
      setEqPreamp(pa)
      setCurves((cs) => cs.map((c) => (c.name === eqForCurve ? { ...c, eqFilters: nf, preamp: pa } : c)))
      setStatus(`Filter added @ ${Math.round(freq)}Hz — drag the ● node to adjust`)
    } else if (action === 'setTarget') {
      // create custom target dari curve pertama yang visible
      const c = curves.find((x) => !x.hidden)
      if (c) {
        const name = `Target@${Math.round(freq)}Hz`
        setCustomTargets((ct) => {
          const out = { ...ct, [name]: { name, points: c.points, rig: c.rig, source: c.source } }
          safeSetItem('customTargets', JSON.stringify(out))
          return out
        })
        setSelectedTarget(`custom:${name}`)
        setStatus(`Custom target "${name}" created`)
      }
    } else if (action === 'pinTop') {
      const vis = curves.filter((c) => !c.hidden)
      if (vis.length) setCurveField(vis[0].name, 'pinned', !vis[0].pinned)
    }
  }
  // switch EQ target: pindah state dari curve baru; override filters/preamp kalau diberi (preset load)
  // kalau curve baru tiada EQ tapi global ada (right-click/import), attach global — jangan clear senyap
  const switchEqTarget = (name, filters, preamp) => {
    setEqForCurve(name)
    if (filters !== undefined) {
      setEqFilters(filters)
      setEqPreamp(preamp || 0)
      setCurves((cs) => cs.map((c) => (c.name === name ? { ...c, eqFilters: filters, preamp: preamp || 0 } : c)))
      return
    }
    const c = curves.find((x) => x.name === name)
    const cf = c?.eqFilters || []
    if (cf.length) {
      setEqFilters(cf)
      setEqPreamp(c?.preamp || 0)
    }
    // kalau cf kosong & global eqFilters ada — kekalkan global (untuk right-click add)
    eqAutoPicked.current = !!name
  }

  const addModel = async (m, props) => {
    // NOTE: dup/cap checks dilakukan DALAM setCurves updater supaya race-safe
    try {
      // model dengan points sendiri (crossover sim, shared, dll.) — terus add tanpa fetch
      if (Array.isArray(m.points) && m.points.length > 1) {
        let added = false
        setCurves((cs) => {
          if (cs.some((c) => c.name === m.name)) return cs
          if (cs.length >= 10) return cs
          added = true
          return [...cs, { id: uid(), name: m.name, rig: m.rig || 'custom', source: m.source || 'local', points: m.points, channels: {}, channelMode: 'avg', color: COLORS[cs.length % COLORS.length], hidden: false, pinned: false, dash: m.dash || 'solid', weight: 2.2, eqFilters: m.eqFilters || [], ...(props || {}) }]
        })
        // status ikut outcome sebenar — bukan asumsi
        setTimeout(() => setStatus(added ? `Added: ${m.name}` : `${m.name} already on graph or max curves`), 0)
        return
      }
      const channels = await window.api.dbMeasurements(m.name, m.rig, m.source)
      let points
      let channelMode = 'avg'
      if (channels.AVG) {
        points = channels.AVG
        channelMode = 'avg'
      } else if (channels.L && channels.R) {
        const n = Math.min(channels.L.length, channels.R.length)
        points = channels.L.slice(0, n).map(([f, v], i) => [f, (v + channels.R[i][1]) / 2])
      } else {
        points = channels.L || channels.R
        channelMode = channels.L ? 'L' : 'R'
      }
      if (!points || !points.length) {
        setStatus(`Empty measurement for ${m.name}`)
        return
      }
      let added = false
      setCurves((cs) => {
        if (cs.some((c) => c.name === m.name && c.rig === m.rig)) return cs
        if (cs.length >= 10) return cs
        added = true
        return [...cs, { id: uid(), name: m.name, rig: m.rig, source: m.source || 'crinacle', points, channels, channelMode, color: COLORS[cs.length % COLORS.length], hidden: false, pinned: false, dash: 'solid', weight: 2.2, ...(props || {}) }]
      })
      // check selepas commit tak boleh dalam updater — guna flag
      setTimeout(() => {
        if (added) {
          trackRecent(m)
          setStatus(`Added: ${m.name} (${RIG_LABEL[m.rig] || m.rig}${m.source ? ` · ${m.source}` : ''})`)
        } else {
          setStatus(`${m.name} already on graph or max curves`)
        }
      }, 0)
    } catch (e) {
      setStatus(`Failed to load ${m.name}: ${e.message}`)
    }
  }

  const changeChannel = (idx, mode) => {
    setCurves((cs) => cs.map((c, i) => {
      if (i !== idx) return c
      let points = c.points
      const ch = c.channels || {}
      if (mode === 'L' && ch.L) points = ch.L
      else if (mode === 'R' && ch.R) points = ch.R
      else if (mode === 'avg' && ch.L && ch.R) {
        const n = Math.min(ch.L.length, ch.R.length)
        points = ch.L.slice(0, n).map(([f, v], j) => [f, (v + ch.R[j][1]) / 2])
      }
      return { ...c, channelMode: mode, points }
    }))
  }

  const removeCurve = (id) => {
    setCurves((cs) => {
      const target = cs.find((c) => (c.id || c.name) === id)
      if (!target) return cs
      if (eqForCurve === target.name) { setEqForCurve(''); setEqFilters([]); setEqPreamp(0) }
      return cs.filter((c) => (c.id || c.name) !== id)
    })
  }

  const recolor = () => {
    const shuffled = [...COLORS].sort(() => Math.random() - 0.5)
    setCurves((cs) => cs.map((c, i) => ({ ...c, color: shuffled[i % shuffled.length] })))
  }

  const setCurveField = (id, field, value) => {
    setCurves((cs) => cs.map((c) => ((c.id || c.name) === id ? { ...c, [field]: value } : c)))
  }

  const eqCurve = useMemo(() => curves.find((c) => (c.id || c.name) === eqForCurve || c.name === eqForCurve) || null, [curves, eqForCurve])

  // targetName param membolehkan apply EQ ke curve spesifik tanpa bergantung pada state timing
  const onFiltersChange = (filters, preamp, targetName) => {
    const target = targetName || eqForCurve
    setEqFilters(filters)
    setEqPreamp(preamp || 0)
    setCurves((cs) => cs.map((c) => (c.name === target ? { ...c, eqFilters: filters, preamp } : c)))
  }

  // drag EQ node pada graph: update freq/gain, atau null = remove filter
  const onEqFilterGraphChange = (idx, patch) => {
    if (!eqFilters.length) return
    let nf
    if (patch === null) {
      nf = eqFilters.filter((_, i) => i !== idx)
    } else {
      nf = eqFilters.map((f, i) => (i === idx ? { ...f, ...patch } : f))
    }
    const pa = calcPreamp(nf)
    setEqFilters(nf)
    setEqPreamp(pa)
    setCurves((cs) => cs.map((c) => (c.name === eqForCurve ? { ...c, eqFilters: nf, preamp: pa } : c)))
  }

  // attach eq db function to curve for graph preview
  const graphCurves = useMemo(() => {
    return curves.map((c) => {
      if (c.eqFilters && c.eqFilters.length) {
        const fs = 48000
        return {
          ...c,
          _eqDbAt: (f) => filterChainDb(c.eqFilters, f, fs)
        }
      }
      return c
    })
  }, [curves])

  const target = useMemo(() => {
    if (!selectedTarget) return null
    if (selectedTarget.startsWith('custom:')) {
      const t = customTargets[selectedTarget.slice(7)]
      return t || null
    }
    return targets[selectedTarget] || null
  }, [selectedTarget, targets, customTargets])

  const boundsFn = useMemo(() => {
    if (!showBounds) return null
    return (f) => {
      // preference bounds: ±3dB below 1kHz, widening to ±5dB above
      if (f < 1000) return 3
      return 3 + 2 * Math.min(1, Math.log(f / 1000) / Math.log(8))
    }
  }, [showBounds])

  // drag & drop import — drop CSV/JSON terus pada main area
  const [dragOver, setDragOver] = useState(false)

  const handleDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    const files = e.dataTransfer?.files
    if (!files?.length) return
    for (const f of files) {
      const ext = f.name.split('.').pop().toLowerCase()
      if (!['csv', 'txt', 'json'].includes(ext)) continue
      const reader = new FileReader()
      reader.onload = () => {
        try {
          const parsed = parseData({ content: reader.result, ext })
          setCurves((cs) => {
            const next = [...cs]
            for (const p of parsed) {
              if (next.length >= 10) break
              if (next.some((c) => c.name === (p.name || f.name.replace(/\.[^.]+$/, '')))) continue
              next.push({ id: uid(), name: p.name || f.name.replace(/\.[^.]+$/, ''), rig: 'custom', points: p.points, channels: {}, channelMode: 'avg', color: COLORS[next.length % COLORS.length], hidden: false, pinned: false, dash: 'solid', weight: 2.2 })
            }
            return next
          })
          setStatus(`Dropped: ${f.name}`)
        } catch (err) {
          setStatus(`Drop failed: ${err.message}`)
        }
      }
      reader.readAsText(f)
    }
  }

  // quick screenshot Ctrl+S
  useEffect(() => {
    const onKey = (e) => {
      if (e.ctrlKey && e.key.toLowerCase() === 's') {
        e.preventDefault()
        exportPng()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // ── saved crossover simulations ──
  const [savedSims, setSavedSims] = useState(() => {
    try { return JSON.parse(localStorage.getItem('savedSims') || '[]') } catch (_) { return [] }
  })

  const saveSim = async () => {
    const sim = curves.find((c) => c.rig === 'sim')
    if (!sim) { setStatus('No sim curve on graph — simulate a crossover first'); return }
    const name = await askPrompt(`Name for this sim curve:`, sim.name.replace(/^XO: /, ''))
    if (!name) return
    const entry = { name, points: sim.points, source: sim.source, savedAt: new Date().toISOString() }
    setSavedSims((ss) => {
      const out = [...ss.filter((s) => s.name !== name), entry]
      safeSetItem('savedSims', JSON.stringify(out))
      return out
    })
    // rename curve on graph supaya senang rujuk
    setCurves((cs) => cs.map((c) => ((c.id || c.name) === (sim.id || sim.name) ? { ...c, name, savedSim: true } : c)))
    setStatus(`Sim "${name}" saved`)
  }

  const loadSim = (s) => {
    addModel({ ...s, rig: 'sim', source: 'saved sim', points: s.points })
  }

  const deleteSim = (name) => {
    setSavedSims((ss) => {
      const out = ss.filter((s) => s.name !== name)
      safeSetItem('savedSims', JSON.stringify(out))
      return out
    })
  }
  const [workspaces, setWorkspaces] = useState(() => {
    try { return JSON.parse(localStorage.getItem('workspaces') || '{}') } catch (_) { return {} }
  })

  const saveWorkspace = async () => {
    const name = await askPrompt('Workspace name:', 'e.g. Wan\'er daily setup')
    if (!name) return
    const ws = {
      curves, eqFilters, eqPreamp, eqForCurve, selectedTarget, smoothing, normalize, normFreq, normDb,
      xDomain, yDomain, targetAdj, showLabels, inspector, showBands, showBounds, unitVariance, diffOn, theme, accent
    }
    setWorkspaces((w) => {
      const out = { ...w, [name]: { ...ws, savedAt: new Date().toISOString() } }
      safeSetItem('workspaces', JSON.stringify(out))
      return out
    })
    setStatus(`Workspace "${name}" saved`)
  }

  const loadWorkspace = (name) => {
    const ws = workspaces[name]
    if (!ws) return
    setCurves(ws.curves || [])
    setEqFilters(ws.eqFilters || [])
    setEqPreamp(ws.eqPreamp || 0)
    setEqForCurve(ws.eqForCurve || '')
    setSelectedTarget(ws.selectedTarget || '')
    setSmoothing(ws.smoothing ?? 0.15)
    setNormalize(!!ws.normalize)
    setNormFreq(ws.normFreq || 1000)
    setNormDb(ws.normDb || 0)
    if (ws.xDomain) setXDomain(ws.xDomain)
    if (ws.yDomain) setYDomain(ws.yDomain)
    if (ws.targetAdj) setTargetAdj(ws.targetAdj)
    if (ws.showLabels !== undefined) setShowLabels(ws.showLabels)
    if (ws.inspector !== undefined) setInspector(ws.inspector)
    if (ws.showBands !== undefined) setShowBands(ws.showBands)
    if (ws.showBounds !== undefined) setShowBounds(ws.showBounds)
    if (ws.unitVariance !== undefined) setUnitVariance(ws.unitVariance)
    if (ws.diffOn !== undefined) setDiffOn(ws.diffOn)
    if (ws.theme) setTheme(ws.theme)
    if (ws.accent) setAccent(ws.accent)
    setStatus(`Workspace "${name}" loaded`)
  }

  const deleteWorkspace = (name) => {
    setWorkspaces((w) => {
      const out = { ...w }
      delete out[name]
      safeSetItem('workspaces', JSON.stringify(out))
      return out
    })
  }

  const handleImportFile = async () => {
    if (!window.api) return
    try {
      const raw = await window.api.importFile()
      if (!raw) return
      const parsed = parseData(raw)
      setCurves((cs) => {
        const next = [...cs]
        for (const p of parsed) {
          if (next.length >= 10) break
          next.push({ id: uid(), name: p.name || `Imported ${next.length + 1}`, rig: 'custom', points: p.points, channels: {}, channelMode: 'avg', color: COLORS[next.length % COLORS.length], hidden: false, pinned: false, dash: 'solid', weight: 2.2 })
        }
        return next
      })
      setStatus(`Imported: ${parsed.map((c) => c.name).join(', ')}`)
    } catch (e) {
      setStatus(`Import failed: ${e.message}`)
    }
  }

  const handleImportUrl = async () => {
    if (!url) return
    try {
      const raw = await window.api.importUrl(url)
      const parsed = parseData(raw)
      setCurves((cs) => {
        const next = [...cs]
        for (const p of parsed) {
          if (next.length >= 10) break
          next.push({ id: uid(), name: p.name || `Imported ${next.length + 1}`, rig: 'custom', points: p.points, channels: {}, channelMode: 'avg', color: COLORS[next.length % COLORS.length], hidden: false, pinned: false, dash: 'solid', weight: 2.2 })
        }
        return next
      })
      setStatus(`Imported from URL`)
    } catch (e) {
      setStatus(`URL import failed: ${e.message}`)
    }
  }

  const exportPng = () => {
    const svg = document.querySelector('.graph-svg')
    if (!svg) return
    const clone = svg.cloneNode(true)
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    const bgColor = theme === 'light' ? '#fafbfc' : '#14161a'
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
    bg.setAttribute('width', '100%')
    bg.setAttribute('height', '100%')
    bg.setAttribute('fill', bgColor)
    clone.insertBefore(bg, clone.firstChild)
    const data = new XMLSerializer().serializeToString(clone)
    const blob = new Blob([data], { type: 'image/svg+xml' })
    const url2 = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = 2600
      canvas.height = 1400
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = bgColor
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url2)
      try {
        const a = document.createElement('a')
        a.download = 'graph.png'
        a.href = canvas.toDataURL('image/png')
        a.click()
        setStatus('PNG exported')
      } catch (e) {
        setStatus(`PNG export failed: ${e.message}`)
      }
    }
    img.onerror = () => { URL.revokeObjectURL(url2); setStatus('PNG export failed: image load error') }
    img.src = url2
  }

  const shareState = async () => {
    const state = {
      curves: curves.map((c) => ({ name: c.name, rig: c.rig, channelMode: c.channelMode, hidden: c.hidden, dash: c.dash, weight: c.weight })),
      selectedTarget,
      smoothing,
      normalize,
      normFreq,
      normDb,
      xDomain,
      yDomain,
      targetAdj
    }
    const json = JSON.stringify(state)
    if (window.api) {
      const ok = await window.api.saveText('graph-share.json', JSON.stringify(JSON.parse(json), null, 2))
      if (ok) setStatus('Share state saved to file')
    }
  }

  const loadShareState = async () => {
    if (!window.api) return
    let raw = null
    try { raw = await window.api.loadPreset() } catch (e) { setStatus(`Load failed: ${e.message}`); return }
    if (!raw) return
    try {
      const p = JSON.parse(raw)
      setSmoothing(p.smoothing ?? 0.15)
      setNormalize(!!p.normalize)
      setNormFreq(p.normFreq || 1000)
      setNormDb(p.normDb || 0)
      if (p.xDomain) setXDomain(p.xDomain)
      if (p.yDomain) setYDomain(p.yDomain)
      if (p.targetAdj) setTargetAdj(p.targetAdj)
      if (p.selectedTarget) setSelectedTarget(p.selectedTarget)
      for (const sc of p.curves || []) {
        if (sc.rig === 'custom') continue
        await addModel({ name: sc.name, rig: sc.rig })
      }
      // apply per-curve props
      setCurves((cs) => cs.map((c) => {
        const sc = (p.curves || []).find((x) => x.name === c.name && x.rig === c.rig)
        return sc ? { ...c, ...sc } : c
      }))
      setStatus('Share state loaded')
    } catch (e) {
      setStatus(`Load failed: ${e.message}`)
    }
  }

  const resetAdj = () => setTargetAdj({ tilt: 0, earGain: 0, bass: 0, treble: 0 })

  const yScaleOptions = [10, 15, 20, 30, 40, 50]
  const cycleYScale = () => {
    const cur = yDomain[1] - yDomain[0]
    const idx = yScaleOptions.findIndex((v) => Math.abs(v - cur) < 0.5)
    const next = yScaleOptions[(idx + 1) % yScaleOptions.length] || 20
    const mid = (yDomain[0] + yDomain[1]) / 2
    setYDomain([mid - next / 2, mid + next / 2])
  }

  const zoomPreset = (range) => setXDomain(range)

  return (
    <div className="app">
      <aside className={sidebarCollapsed ? 'sidebar collapsed' : 'sidebar'} style={sidebarCollapsed ? undefined : { width: sidebarWidth, minWidth: sidebarWidth }}>
        <h1>IEMunity</h1>
        <div className="tabs">
          <button className={activeTab === 'db' ? 'tab active' : 'tab'} onClick={() => setActiveTab('db')}>Database</button>
          <button className={activeTab === 'eq' ? 'tab active' : 'tab'} onClick={() => setActiveTab('eq')}>EQ</button>
          <button className={activeTab === 'device' ? 'tab active' : 'tab'} onClick={() => setActiveTab('device')}>Device</button>
          <button className={activeTab === 'tools' ? 'tab active' : 'tab'} onClick={() => setActiveTab('tools')}>Tools</button>
          <button className={activeTab === 'extra' ? 'tab active' : 'tab'} onClick={() => setActiveTab('extra')}>Extra</button>
        </div>
        <div className={activeTab === 'db' ? 'tabpanel' : 'tabpanel hidden'}><DbBrowser models={models} onAdd={addModel} isFav={isFav} toggleFav={toggleFav} /></div>
        <div className={activeTab === 'eq' ? 'tabpanel' : 'tabpanel hidden'}>
          <EqPanel
            selectedCurve={eqCurve}
            onFiltersChange={onFiltersChange}
            targetPoints={targets}
            curves={curves}
            deviceConstraints={deviceConstraints}
            customTargets={customTargets}
            hearingProfile={hearingProfile}
            appFilters={eqFilters}
            appPreamp={eqPreamp}
          />
        </div>
        <div className={activeTab === 'device' ? 'tabpanel' : 'tabpanel hidden'}>
          <DevicePanel
            filters={eqFilters}
            preamp={eqPreamp}
            onConstraintsChange={setDeviceConstraints}
            onFiltersFromDevice={(f) => {
              if (eqForCurve) onFiltersChange(f, calcPreamp(f))
              else setStatus('Select a curve to apply EQ to first (Extra tab)')
            }}
          />
        </div>
        <div className={activeTab === 'tools' ? 'tabpanel' : 'tabpanel hidden'}>
          <div className="tools-panel">
            <h3>Universal EQ (squig.link / AutoEq / Wavelet format)</h3>
            <UniversalEqPanel filters={eqFilters} preamp={eqPreamp} onFiltersFromDevice={onFiltersChange} />
            <h3>Find Similar IEMs</h3>
            <p className="hint">Scan database for IEMs with closest FR shape to the selected curve.</p>
            <FindSimilar curve={eqCurve || curves.filter((c) => !c.hidden)[0]} models={models} onLoad={addModel} />
            <h3>Blind A/B Test</h3>
            <BlindTest curves={curves.filter((c) => !c.hidden)} />
            <h3>Unit Variance Compare</h3>
            <UnitVarianceCompare curves={curves.filter((c) => !c.hidden)} />
            <h3>Universal EQ</h3>
            <CrossoverSim
              curves={curves.filter((c) => !c.hidden)}
              onResult={(r) => {
                if (curves.length >= 10) { setStatus('Max 10 curves — remove one first'); return }
                if (curves.some((c) => c.name === r.name)) { setStatus('That sim already on graph'); return }
                setCurves((cs) => [...cs, { ...r, id: uid(), rig: 'sim', source: 'crossover sim', channels: {}, channelMode: 'avg', color: COLORS[cs.length % COLORS.length], hidden: false, pinned: false, dash: 'dashed', weight: 2.2 }])
                setStatus(`Crossover curve added: ${r.name}`)
              }}
            />
            {curves.some((c) => c.rig === 'sim') && (
              <div className="row" style={{ marginTop: 6 }}>
                <button className="primary" onClick={saveSim}>💾 Save sim curve</button>
                <span className="hint" style={{ margin: 0 }}>Name it & add back anytime</span>
              </div>
            )}
            {savedSims.length > 0 && (
              <>
                <p className="mini-label" style={{ marginTop: 10 }}>Saved sims</p>
                <ul className="quick-list">
                  {savedSims.map((s) => (
                    <li key={s.name}>
                      <button className="model-btn" onClick={() => loadSim(s)} title={`${s.points.length} points`}>
                        <span className="mname">🔀 {s.name}</span>
                        <span className="rm" onClick={(e) => { e.stopPropagation(); deleteSim(s.name) }}>×</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
            <HearingTest
              onProfileSave={(p) => {
                setHearingProfile(p)
                safeSetItem('hearingProfile', JSON.stringify(p))
                setStatus('Hearing profile saved')
              }}
            />
            {hearingProfile && (
              <p className="hint">
                Hearing profile: {Object.entries(hearingProfile).map(([f, t]) => `${f >= 1000 ? f / 1000 + 'k' : f}Hz:${['normal', 'mild', 'moderate', 'severe', 'N/A'][t] || t}`).join(' · ')}
              </p>
            )}
            <AmpCalc curves={curves.filter((c) => !c.hidden)} />
          </div>
        </div>
        <div className={activeTab === 'extra' ? 'tabpanel' : 'tabpanel hidden'}>
          <div className="section">
            <h2>Appearance</h2>
            <div className="row">
              <select value={theme} onChange={(e) => setTheme(e.target.value)}>
                <option value="dark">🌙 Dark</option>
                <option value="light">☀️ Light</option>
              </select>
              <select value={accent} onChange={(e) => setAccent(e.target.value)}>
                <option value="cyan">Cyan</option>
                <option value="purple">Purple</option>
                <option value="green">Green</option>
                <option value="orange">Orange</option>
                <option value="pink">Pink</option>
              </select>
            </div>
            <h2>Import</h2>
            <button onClick={handleImportFile}>Import file (CSV/JSON)…</button>
            <div className="row">
              <input type="text" placeholder="URL to CSV/JSON" value={url} onChange={(e) => setUrl(e.target.value)} />
              <button onClick={handleImportUrl}>Fetch</button>
            </div>
            <p className="hint">CSV: "freq,db" per line. Multi-column & JSON supported.</p>
            <h2>Share / Preset</h2>
            <div className="row">
              <button onClick={shareState}>Save state…</button>
              <button onClick={loadShareState}>Load state…</button>
            </div>
            <h2>EQ applies to</h2>
            <select value={eqForCurve} onChange={(e) => switchEqTarget(e.target.value)}>
              <option value="">— none —</option>
              {curves.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
            </select>
            <h2>Share & Export</h2>
            <div className="row">
              <button onClick={shareLink}>🔗 Share link/file</button>
              <button onClick={importShareLink}>Import share</button>
            </div>
            <div className="row">
              <button onClick={exportCsv}>Export CSV</button>
            </div>
            <h2>Custom Target</h2>
            <div className="row">
              <button onClick={saveCurveAsTarget}>＋ Target from first curve</button>
            </div>
            {Object.keys(customTargets).length > 0 && (
              <ul className="quick-list">
                {Object.values(customTargets).map((t) => (
                  <li key={t.name}>
                    <button className="model-btn">
                      <span className="mname">🎯 {t.name} ({t.points.length} pts)</span>
                      <span className="rm" onClick={() => deleteCustomTarget(t.name)}>×</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className="hint">Custom targets appear in the Target & AutoEQ dropdowns instantly.</p>
            <h2>My Collection</h2>
            {curves.filter((c) => c.rig !== 'custom' && c.rig !== 'sim').length > 0 && (
              <div className="row">
                <select onChange={(e) => { if (e.target.value) { toggleCollection(curves.find((c) => c.name === e.target.value)); e.target.value = '' } }}>
                  <option value="">＋ Add to collection…</option>
                  {curves.filter((c) => c.rig !== 'custom' && c.rig !== 'sim' && !inCollection(c.name)).map((c) => (
                    <option key={c.name} value={c.name}>{c.name}</option>
                  ))}
                </select>
              </div>
            )}
            {collection.length > 0 && (
              <ul className="quick-list">
                {collection.map((c) => (
                  <li key={c.name}>
                    <button className="model-btn" onClick={() => addModel(c)} title="Add to graph">
                      <span className="mname">🎧 {c.name}</span>
                      <span className="rm" onClick={(e) => { e.stopPropagation(); toggleCollection(c) }} title="Remove from collection">×</span>
                    </button>
                    <input
                      type="text" placeholder="note… (EQ used, etc.)" defaultValue={c.note}
                      onBlur={(e) => setCollectionNote(c.name, e.target.value)}
                      style={{ width: '100%', marginTop: 2, fontSize: 11 }}
                    />
                  </li>
                ))}
              </ul>
            )}
            <h2>Workspaces</h2>
            <div className="row">
              <button onClick={saveWorkspace}>💾 Save workspace</button>
            </div>
            {Object.keys(workspaces).length > 0 && (
              <ul className="quick-list">
                {Object.entries(workspaces).map(([name, ws]) => (
                  <li key={name}>
                    <button className="model-btn" onClick={() => loadWorkspace(name)} title={new Date(ws.savedAt).toLocaleDateString()}>
                      <span className="mname">📦 {name}</span>
                      <span className="rm" onClick={(e) => { e.stopPropagation(); deleteWorkspace(name) }}>×</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <h2>App Update</h2>
            <div className="row">
              <button disabled={checking} onClick={checkUpdate}>{checking ? 'Checking…' : '🔄 Check for updates'}</button>
              {updateInfo?.available && <button className="primary" onClick={downloadUpdate}>⬇ Download v{updateInfo.latest}</button>}
              {updateProgress && <span className="hint">{updateProgress.percent?.toFixed(0)}% ({updateProgress.mb} MB)</span>}
            </div>
            {updateInfo?.available && (
              <div className="row">
                <button onClick={installUpdate}>⚡ Install & restart</button>
                {updateInfo.notes && <p className="hint">{updateInfo.notes}</p>}
              </div>
            )}
            <h2>Database cache</h2>
            {cacheInfo && (
              <p className="hint">
                {cacheInfo.books} phone books · {cacheInfo.measurements} measurements · {cacheInfo.mb} MB
              </p>
            )}
            <div className="row">
              <button className="primary" disabled={refreshing} onClick={refreshDatabase}>{refreshing ? 'Refreshing…' : '🔄 Refresh database (online)'}</button>
            </div>
            <div className="row">
              <button onClick={clearMeasurementCache}>Clear measurement cache</button>
            </div>
            <p className="hint">Refresh re-fetches crinacle + squig.link phone books (new IEM/models). Measurement cache only re-downloads when a model is opened again.</p>
            <h2>Favorites & Recents</h2>
            {favorites.length > 0 && (
              <>
                <p className="mini-label">★ Favorites</p>
                <ul className="quick-list">
                  {favorites.map((m) => (
                    <li key={m.name + m.rig}>
                      <button className="model-btn" onClick={() => addModel(m)}>
                        <span className="mname">{m.name}</span>
                        <span className="rm" onClick={(e) => { e.stopPropagation(); toggleFav(m) }}>×</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {recents.length > 0 && (
              <>
                <p className="mini-label">🕙 Recent</p>
                <ul className="quick-list">
                  {recents.map((m) => (
                    <li key={m.name + m.rig}>
                      <button className="model-btn" onClick={() => addModel(m)}>
                        <span className="mname">{m.name}</span>
                        <span className="fav-star" onClick={(e) => { e.stopPropagation(); toggleFav(m) }} title="Toggle favorite">{isFav(m) ? '★' : '☆'}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {favorites.length === 0 && recents.length === 0 && <p className="hint">Add IEMs from the database — they appear here.</p>}
            <h2>EQ Presets</h2>
            <div className="row">
              <button onClick={saveEqPreset}>💾 Save preset</button>
            </div>
            {Object.entries(eqPresets).map(([cn, ps]) => (
              <div key={cn}>
                <p className="mini-label">{cn}</p>
                <ul className="quick-list">
                  {ps.map((p) => (
                    <li key={p.name}>
                      <button className="model-btn" onClick={() => loadEqPreset(cn, p)}>
                        <span className="mname">{p.name} ({p.filters.length}F)</span>
                        <span className="rm" onClick={(e) => { e.stopPropagation(); deleteEqPreset(cn, p.name) }}>×</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )            )}
          </div>
        </div>
      </aside>
      {!sidebarCollapsed && (
        <div
          className={draggingSidebar ? 'sidebar-resize dragging' : 'sidebar-resize'}
          onMouseDown={(e) => { e.preventDefault(); setDraggingSidebar(true) }}
          title="Drag to resize"
        />
      )}
      <main className={dragOver ? 'main dragover' : 'main'} onDragOver={(e) => { e.preventDefault(); setDragOver(true) }} onDragLeave={() => setDragOver(false)} onDrop={handleDrop}>
        {dragOver && <div className="drop-overlay">📂 Drop CSV/JSON here to add curves</div>}
        <div className="main-top">
        <div className="controls">
          <label>
            Target:
            <select value={selectedTarget} onChange={(e) => setSelectedTarget(e.target.value)}>
              <option value="">None</option>
              {Object.values(targets).map((t) => <option key={t.name} value={t.name}>{t.name}</option>)}
              {Object.values(customTargets).map((t) => <option key={`c_${t.name}`} value={`custom:${t.name}`}>🎯 {t.name}</option>)}
            </select>
          </label>
          <label>
            Smooth {smoothing.toFixed(2)}
            <input type="range" min="0" max="0.67" step="0.01" value={smoothing} onChange={(e) => setSmoothing(parseFloat(e.target.value))} />
          </label>
          <label className="chk">
            <input type="checkbox" checked={normalize} onChange={(e) => setNormalize(e.target.checked)} /> Norm @
          </label>
          <input type="number" step="100" min="20" max="20000" value={normFreq} onChange={(e) => setNormFreq(+e.target.value)} style={{ width: 70 }} />
          <span>Hz to</span>
          <input type="number" step="1" value={normDb} onChange={(e) => setNormDb(+e.target.value)} style={{ width: 55 }} />
          <span>dB</span>
          <label className="chk"><input type="checkbox" checked={showLabels} onChange={(e) => setShowLabels(e.target.checked)} /> Labels</label>
          <label className="chk"><input type="checkbox" checked={inspector} onChange={(e) => setInspector(e.target.checked)} /> Inspector</label>
          <label className="chk"><input type="checkbox" checked={showBounds} onChange={(e) => setShowBounds(e.target.checked)} /> Pref bounds</label>
          <label className="chk"><input type="checkbox" checked={showBands} onChange={(e) => setShowBands(e.target.checked)} /> Bands</label>
          <label className="chk"><input type="checkbox" checked={unitVariance} onChange={(e) => setUnitVariance(e.target.checked)} /> Unit variance</label>
          <label className="chk"><input type="checkbox" checked={diffOn} onChange={(e) => setDiffOn(e.target.checked)} /> A−B diff</label>
          <button onClick={cycleYScale}>Y: ±{Math.round((yDomain[1] - yDomain[0]) / 2)}dB</button>
          <button onClick={recolor}>🎨 Recolor</button>
          <button onClick={exportPng}>📷 PNG</button>
          <button onClick={() => zoomPreset([20, 20000])}>Full</button>
          <button onClick={() => zoomPreset([20, 300])}>Bass</button>
          <button onClick={() => zoomPreset([200, 3000])}>Mids</button>
          <button onClick={() => zoomPreset([2000, 20000])}>Treble</button>
          <button onClick={() => { setXDomain([20, 20000]); setYDomain([-15, 15]) }}>Reset</button>
          <button onClick={() => setSidebarCollapsed(!sidebarCollapsed)} title={sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'}>{sidebarCollapsed ? '☰' : '✕ Sidebar'}</button>
        </div>

        {target && (
          <div className="controls targetadj">
            <span>Target adj:</span>
            <label>Tilt<input type="range" min="-0.5" max="0.5" step="0.05" value={targetAdj.tilt} onChange={(e) => setTargetAdj({ ...targetAdj, tilt: +e.target.value })} /><span className="val">{targetAdj.tilt.toFixed(2)}</span></label>
            <label>Ear<input type="range" min="-6" max="6" step="0.5" value={targetAdj.earGain} onChange={(e) => setTargetAdj({ ...targetAdj, earGain: +e.target.value })} /><span className="val">{targetAdj.earGain.toFixed(1)}</span></label>
            <label>Bass<input type="range" min="-10" max="10" step="0.5" value={targetAdj.bass} onChange={(e) => setTargetAdj({ ...targetAdj, bass: +e.target.value })} /><span className="val">{targetAdj.bass.toFixed(1)}</span></label>
            <label>Treble<input type="range" min="-10" max="10" step="0.5" value={targetAdj.treble} onChange={(e) => setTargetAdj({ ...targetAdj, treble: +e.target.value })} /><span className="val">{targetAdj.treble.toFixed(1)}</span></label>
            <button onClick={resetAdj}>Remove adj</button>
          </div>
        )}

        <Graph
          curves={graphCurves}
          target={target}
          targetAdj={targetAdj}
          bounds={boundsFn}
          xDomain={xDomain}
          setXDomain={setXDomain}
          yDomain={yDomain}
          setYDomain={setYDomain}
          smoothing={smoothing}
          normalize={normalize}
          normFreq={normFreq}
          normDb={normDb}
          showLabels={showLabels}
          inspector={inspector}
          showBands={showBands}
          diff={diffCurve}
          eqFilters={eqFilters}
          onEqFilterChange={onEqFilterGraphChange}
          unitVariance={unitVariance}
          onContextAction={handleGraphContext}
        />
        <UnitVarianceNote enabled={unitVariance} />
        </div>

        <div className="main-bottom">
        {diffCurve && (
          <p className="hint" style={{ color: '#ffd54f' }}>
            A−B diff: {curves.filter((c) => !c.hidden)[0]?.name} − {curves.filter((c) => !c.hidden)[1]?.name} (yellow dashed line)
          </p>
        )}

        {target && curves.length > 0 && (
          <ScorePanel curves={curves.filter((c) => !c.hidden)} targets={{ ...targets, ...(selectedTarget.startsWith('custom:') ? { [selectedTarget]: target } : {}) }} selectedTarget={selectedTarget} />
        )}

        {curves.filter((c) => !c.hidden).length > 0 && (
          <CompareTable curves={curves.filter((c) => !c.hidden)} />
        )}

        <p className="status">{status}</p>
        <p className="hint">Scroll = zoom · Drag = pan · {models.length} models in database{eqFilters.length > 0 ? ' · EQ nodes ● draggable (freq/gain), double-click remove' : ''}</p>

        <table className="manage">
          <thead>
            <tr><th></th><th>Name</th><th>Rig</th><th>Ch</th><th>Style</th><th>Weight</th><th></th></tr>
          </thead>
          <tbody>
            {curves.map((c) => (
              <tr key={c.id || c.name} className={c.name === eqForCurve ? 'eqsel' : ''}>
                <td>
                  <input type="color" value={c.color} onChange={(e) => setCurveField(c.id || c.name, 'color', e.target.value)} style={{ width: 28, height: 22, padding: 0, border: 'none', background: 'none' }} />
                </td>
                <td className="cname" title={c.name}>
                  {c.name}
                  {c.eqFilters && c.eqFilters.length > 0 && <span className="eqbadge" title={`${c.eqFilters.length} EQ filters`}>EQ</span>}
                </td>
                <td>{RIG_LABEL[c.rig] || c.rig}</td>
                <td>
                  {(c.channels && (c.channels.L || c.channels.R)) ? (
                    <select value={c.channelMode} onChange={(e) => changeChannel(curves.indexOf(c), e.target.value)}>
                      {c.channels.L && <option value="L">L</option>}
                      {c.channels.R && <option value="R">R</option>}
                      {c.channels.L && c.channels.R && <option value="avg">Avg</option>}
                    </select>
                  ) : '—'}
                </td>
                <td>
                  <select value={c.dash} onChange={(e) => setCurveField(c.id || c.name, 'dash', e.target.value)}>
                    <option value="solid">Solid</option>
                    <option value="dashed">Dashed</option>
                    <option value="dotted">Dotted</option>
                    <option value="dashdot">Dash-dot</option>
                  </select>
                </td>
                <td>
                  <select value={c.weight} onChange={(e) => setCurveField(c.id || c.name, 'weight', +e.target.value)}>
                    {[1, 1.5, 2.2, 3, 4].map((w) => <option key={w} value={w}>{w}</option>)}
                  </select>
                </td>
                <td className="actions">
                  <button title={c.hidden ? 'Show' : 'Hide'} onClick={() => setCurveField(c.id || c.name, 'hidden', !c.hidden)}>{c.hidden ? '🚫' : '👁'}</button>
                  <button title="Pin as baseline" className={c.pinned ? 'pinned' : ''} onClick={() => setCurves((cs) => cs.map((x) => (x.name === c.name ? { ...x, pinned: !x.pinned } : { ...x, pinned: false })))}>📌</button>
                  <button title="Apply EQ to this curve" onClick={() => switchEqTarget(c.name)}>🎚</button>
                  <button title="Remove" className="rm-btn" onClick={() => removeCurve(c.id || c.name)}>×</button>
                </td>
              </tr>
            ))}
           </tbody>
        </table>
        </div>
      </main>
      {promptModal && (
        <PromptModal
          title={promptModal.title}
          placeholder={promptModal.placeholder}
          defaultValue={promptModal.defaultValue}
          onSubmit={(v) => { promptModal.resolve(v); setPromptModal(null) }}
          onCancel={() => { promptModal.resolve(null); setPromptModal(null) }}
        />
      )}
    </div>
  )
}
