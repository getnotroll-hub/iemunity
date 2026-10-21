import React, { useState, useMemo, useEffect } from 'react'

// Multi-word fuzzy: setiap word mesti match (substring atau subsequence) nama.
// "red lion" match "TANGZU WAN ER II RED LION"; "waner red" juga match.
function wordsOf(query) {
  return query.toLowerCase().split(/\s+/).filter(Boolean)
}

function wordMatch(word, text) {
  if (text.includes(word)) return 2
  // fuzzy subsequence fallback (e.g. "simgot ea5" -> "ea500")
  let qi = 0
  for (let i = 0; i < text.length && qi < word.length; i++) {
    if (text[i] === word[qi]) qi++
  }
  return qi === word.length ? 1 : 0
}

function matchScore(query, text) {
  const t = text.toLowerCase()
  const words = wordsOf(query)
  if (!words.length) return 1
  let score = 0
  for (const w of words) {
    const m = wordMatch(w, t)
    if (!m) return 0
    score += m
  }
  // bonus: exact substring of full query
  if (t.includes(query.toLowerCase())) score += 10
  return score
}

export default function DbBrowser({ models, onAdd, onReplace, isFav, toggleFav }) {
  const [tab, setTab] = useState('brands')
  const [brand, setBrand] = useState('')
  const [search, setSearch] = useState('')
  const [rigFilter, setRigFilter] = useState('all')

  const rigs = useMemo(() => {
    const s = new Set(models.map((m) => m.rig))
    return ['all', ...[...s].sort()]
  }, [models])

  const brands = useMemo(() => {
    const counts = new Map()
    const q = wordsOf(search)
    for (const m of models) {
      if (rigFilter !== 'all' && m.rig !== rigFilter) continue
      if (q.length && !q.every((w) => m.brand.toLowerCase().includes(w))) continue
      counts.set(m.brand, (counts.get(m.brand) || 0) + 1)
    }
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [models, rigFilter, search])

  // model results — dipaparkan bila user search (di mana-mana tab)
  const searchResults = useMemo(() => {
    if (!wordsOf(search).length) return null
    let list = models
    if (rigFilter !== 'all') list = list.filter((m) => m.rig === rigFilter)
    return list
      .map((m) => ({ m, s: matchScore(search, m.name) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 400)
      .map((x) => x.m)
  }, [models, search, rigFilter])

  const filteredModels = useMemo(() => {
    if (searchResults) return searchResults
    let list = models
    if (rigFilter !== 'all') list = list.filter((m) => m.rig === rigFilter)
    if (brand) list = list.filter((m) => m.brand === brand)
    return [...list].sort((a, b) => a.name.localeCompare(b.name)).slice(0, 400)
  }, [models, brand, searchResults, rigFilter])

  const rigLabel = (r) => {
    if (r === 'Bruel & Kjaer 4620' || r === '5128-ish') return '5128'
    if (r === 'GRAS 43AG-7') return 'GRAS'
    if (r === 'EARS + 711') return 'EARS+711'
    if (r === 'HMS II.3') return 'HMS'
    if (r === 'Headphone.com') return 'HP.com'
    return r || '—'
  }

  const showModelList = tab === 'models' || !!searchResults

  return (
    <div className="dbbrowser">
      <div className="tabs">
        <button className={tab === 'brands' && !searchResults ? 'tab active' : 'tab'} onClick={() => { setTab('brands'); setSearch('') }}>Brands</button>
        <button className={tab === 'models' || searchResults ? 'tab active' : 'tab'} onClick={() => { setTab('models'); setBrand('') }}>Models</button>
      </div>
      <div className="row">
        <select value={rigFilter} onChange={(e) => setRigFilter(e.target.value)}>
          {rigs.map((r) => (
            <option key={r} value={r}>{r === 'all' ? 'All rigs' : r}</option>
          ))}
        </select>
      </div>
      {!showModelList && (
        <>
          <div className="row">
            <input type="text" placeholder="Search brand or model…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <ul className="brand-list">
            {brands.map(([b, n]) => (
              <li key={b} className={brand === b ? 'sel' : ''}>
                <button className="brand-btn" onClick={() => { setBrand(b); setTab('models'); setSearch('') }}>
                  <span>{b}</span> <span className="count">{n}</span>
                </button>
              </li>
            ))}
          </ul>
          {brands.length === 0 && <p className="hint">No brands found.</p>}
        </>
      )}
      {showModelList && (
        <>
          <div className="row">
            <input type="text" placeholder="Search model… (multi-word OK)" value={search} onChange={(e) => setSearch(e.target.value)} autoFocus />
            {brand && !searchResults && <button className="back" onClick={() => { setBrand(''); setTab('brands') }}>×</button>}
          </div>
          {brand && !searchResults && <button className="back" onClick={() => setTab('brands')}>← {brand}</button>}
          <ul className="model-list">
            {filteredModels.map((m, i) => (
              <li key={`${m.name}|||${m.rig}|||${i}`}>
                <button className="model-btn" onClick={() => onAdd(m)} title={m.source ? `${m.source} (${m.form || 'in-ear'})` : 'Add to graph'}>
                  <span className="mname">{m.name}</span>
                  {toggleFav && (
                    <span className="fav-star" onClick={(e) => { e.stopPropagation(); toggleFav(m) }} title="Toggle favorite">
                      {isFav && isFav(m) ? '★' : '☆'}
                    </span>
                  )}
                  {m.source && <span className="src-badge" title={`Source: ${m.source}`}>{m.source}</span>}
                  <span className="rig-badge">{rigLabel(m.rig)}</span>
                </button>
              </li>
            ))}
          </ul>
          {filteredModels.length === 0 && <p className="hint">No models found.</p>}
          {filteredModels.length >= 400 && <p className="hint">Showing first 400 — refine search.</p>}
        </>
      )}
    </div>
  )
}
