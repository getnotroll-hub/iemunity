export function parseCSV(content) {
  const lines = content.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  const curves = []
  let current = null

  const freq = (s) => parseFloat(s.replace(/[^0-9.eE+-]/g, ''))
  const db = (s) => parseFloat(s.replace(/[^0-9.eE+-]/g, ''))

  // detect multi-column header (freq + multiple dB columns)
  if (lines.length > 1) {
    const p2 = lines[1].split(/[,;\t]/)
    if (p2.length > 2 && isFinite(parseFloat(p2[0])) && p2.every((x) => isFinite(parseFloat(x)))) {
      const headerParts = lines[0].split(/[,;\t]/)
      const hasHeader = !headerParts.every((x) => isFinite(parseFloat(x)))
      const headers = hasHeader ? headerParts.slice(1).map((h) => h.trim()) : null
      const nCols = p2.length - 1
      const list = []
      for (let c = 0; c < nCols; c++) list.push({ name: headers && headers[c] ? headers[c] : `Curve ${c + 1}`, points: [] })
      for (const line of hasHeader ? lines.slice(1) : lines) {
        const parts = line.split(/[,;\t]/)
        const f = parseFloat(parts[0])
        if (!isFinite(f)) continue
        for (let c = 1; c < parts.length; c++) {
          const v = parseFloat(parts[c])
          if (isFinite(v)) list[c - 1].points.push([f, v])
        }
      }
      return list.filter((c) => c.points.length > 0)
    }
  }

  for (const line of lines) {
    const parts = line.split(/[,;\t]/).map((p) => p.trim())
    const f = parseFloat(parts[0])
    const v = parts.length > 1 ? parseFloat(parts[1]) : NaN
    if (parts.length >= 2 && isFinite(f) && isFinite(v)) {
      if (!current) {
        current = { name: 'Imported', points: [] }
        curves.push(current)
      }
      current.points.push([f, v])
    } else if (parts.length === 1 && isNaN(f) && !current) {
      current = { name: parts[0], points: [] }
      curves.push(current)
    }
  }
  return curves.filter((c) => c.points.length > 0)
}

export function parseData({ content, ext }) {
  if (ext === 'json') {
    const data = JSON.parse(content)
    if (Array.isArray(data)) {
      if (data.length && Array.isArray(data[0])) return [{ name: data.name || 'Imported', points: data }]
      return [{ name: data.name || 'Imported', points: data.map((d) => [d.frequency ?? d.freq ?? d.x, d.spl ?? d.db ?? d.y]).filter((p) => isFinite(p[0]) && isFinite(p[1])) }]
    }
    if (data.curves) return data.curves.map((c) => ({ name: c.name || 'Imported', points: c.points }))
    if (data.frequency && data.spl) return [{ name: data.name || 'Imported', points: data.frequency.map((f, i) => [f, data.spl[i]]) }]
    if (data.points) return [{ name: data.name || 'Imported', points: data.points }]
    throw new Error('Unknown JSON format')
  }
  return parseCSV(content)
}
