import { app, BrowserWindow, ipcMain, dialog, session } from 'electron'
import { join } from 'path'
import fs from 'fs'

// auto-update (GitHub releases) — hanya aktif dalam build packaged (bukan dev)
let autoUpdater = null
try {
  if (app.isPackaged) {
    autoUpdater = require('electron-updater').autoUpdater
    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = true
  }
} catch (_) {}

const DATA_DIR = app.isPackaged
  ? join(process.resourcesPath, 'data')
  : join(__dirname, '../../data')
const CACHE_DIR = join(app.getPath('userData'), 'cache')
if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true })

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
  'Referer': 'https://crinacle.com/graphing/'
}

// rig -> { bookUrl, dataDir } on crinacle.com
// NOTE: GRAS 43AG-7 & EARS+711 (headphones) data tidak publicly accessible (403/404
// tanpa session premium crinacle) — hanya IEM rigs yang disokong
const CRINACLE_SOURCES = {
  'Bruel & Kjaer 4620': { bookUrl: 'https://crinacle.com/graphing/data_4620/phone_book.json', urlBase: 'https://crinacle.com/graphing/data_4620/', form: 'in-ear' },
  '711': { bookUrl: 'https://crinacle.com/graphing/data/phone_book.json', urlBase: 'https://crinacle.com/graphing/data/', form: 'in-ear' }
}

// AutoEq community databases — index bundled locally (data/autoeq_index.json),
// measurements fetched on demand via jsDelivr CDN (no GitHub rate limit)
const AUTOEQ_RAW = (src, form, file) =>
  `https://cdn.jsdelivr.net/gh/jaakkopasanen/AutoEq@master/measurements/${encodeURIComponent(src)}/data/${form}/${encodeURIComponent(file)}`

function getAutoeqIndex() {
  // cache online (dari db-refresh) dulu, fallback ke bundled index
  const load = (list) => list.filter((m) => m && m.name && m.file && !/[?]{1}/.test(m.file))
  const cached = readJsonCache('autoeq_index')
  if (Array.isArray(cached) && cached.length) return load(cached)
  try {
    return load(JSON.parse(fs.readFileSync(join(DATA_DIR, 'autoeq_index.json'), 'utf-8')))
  } catch (_) {
    return []
  }
}

// fetch AutoEq measurement file listing dari GitHub (1 API call) & rebuild index
async function refreshAutoeqIndex() {
  const r = await fetch('https://api.github.com/repos/jaakkopasanen/AutoEq/git/trees/master?recursive=1', {
    headers: { 'User-Agent': 'IEMunity/1.1.0' }
  })
  if (!r.ok) throw new Error(`GitHub API ${r.status} (rate limit? cuba lagi nanti)`)
  const j = await r.json()
  if (j.truncated) throw new Error('GitHub tree truncated — index tidak lengkap')
  const rigMap = {
    'Super Review': '5128-ish', 'oratory1990': 'HMS II.3', 'Kazi': '711', 'Fahryst': '711',
    'Bakkwatan': '711', 'Filk': '711', 'Harpo': '711', 'HypetheSonics': '711', 'kr0mka': '711',
    'freeryder05': '711', 'Jaytiss': '711', 'RikudouGoku': '711', "Ted's Squig Hoard": '711',
    'ToneDeafMonk': '711', 'DHRME': '711', 'Auriculares Argentina': '711', 'Hi End Portable': '711',
    'Kuulokenurkka': '711', 'Rtings': 'Rtings', 'rtings': 'Rtings', 'Innerfidelity': 'Innerfidelity',
    'Headphone.com Legacy': 'Headphone.com', 'Regan Cipher': '711'
  }
  const models = []
  for (const t of j.tree) {
    if (t.type !== 'blob') continue
    const m = t.path.match(/^measurements\/(.+)\/data\/(in-ear|over-ear|earbud)\/(.+)\.csv$/)
    if (!m) continue
    const source = m[1]
    const form = m[2]
    const name = m[3]
    if (source === 'crinacle') continue // crinacle di-handle phone book sendiri
    const words = name.split(' ')
    const brand = words[0].length <= 2 && words.length > 1 ? words.slice(0, 2).join(' ') : words[0]
    models.push({ name, rig: rigMap[source] || '711', brand, source, form, file: name + '.csv' })
  }
  writeJsonCache('autoeq_index', models)
  return models.length
}

// squig.link partner sites — phone book + REW-style txt measurements
const SQUIG_SITES = [
  { name: 'aftersound', url: 'https://aftersound.squig.link/', rig: '711' },
  { name: 'precog', url: 'https://precog.squig.link/', rig: '711' },
  { name: 'pw', url: 'https://pw.squig.link/', rig: '711' },
  { name: 'kazi', url: 'https://kazi.squig.link/', rig: '711' },
  { name: 'rg', url: 'https://rg.squig.link/', rig: '711' },
  { name: 'bedrock', url: 'https://bedrock.squig.link/', rig: '711' }
]

let squigBooksCache = null

async function getSquigBooks() {
  if (squigBooksCache) return squigBooksCache
  squigBooksCache = await Promise.all(
    SQUIG_SITES.map(async (site) => {
      let book = null
      try {
        const r = await fetch(site.url + 'data/phone_book.json', { headers: BROWSER_HEADERS })
        if (!r.ok) throw new Error(String(r.status))
        book = await r.json()
        writeJsonCache(`book_squig_${site.name}`, book)
      } catch (_) {
        // offline fallback: cached phone book
        book = readJsonCache(`book_squig_${site.name}`)
      }
      if (!book) return { site, models: [] }
      const models = []
      for (const m of book) {
        for (const p of m.phones) {
          if (typeof p === 'string') {
            models.push({ name: `${m.name} ${p}`.trim(), brand: m.name, file: p.trim() })
          } else {
            const base = `${m.name} ${p.name}`.trim()
            const files = Array.isArray(p.file) ? p.file : [p.file]
            if (files.length > 1 && p.suffix && Array.isArray(p.suffix) && p.suffix.length === files.length) {
              files.forEach((f, i) => models.push({ name: `${base} ${p.suffix[i]}`.trim(), brand: m.name, file: (f || '').toString().trim() }))
            } else {
              models.push({ name: base, brand: m.name, file: (files[0] || p.name).toString().trim() })
            }
          }
        }
      }
      return { site, models: models.filter((x) => x.file) }
    })
  )
  return squigBooksCache
}

function parseSquigRew(text) {
  // squig txt formats: tab-separated, comma, atau space-separated (REW "Freq(Hz) SPL(dB) Phase")
  const points = []
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith('*') || line.startsWith('!') || !line.trim()) continue
    const parts = line.trim().split(/[\s\t,]+/)
    const f = parseFloat(parts[0])
    const v = parseFloat(parts[1])
    if (isFinite(f) && isFinite(v)) points.push([f, v])
  }
  return points
}

function parseAutoeqCsv(content) {
  const points = []
  const lines = content.split(/\r?\n/).slice(1)
  for (const line of lines) {
    if (!line.trim()) continue
    const [f, v] = line.split(',')
    const fr = parseFloat(f)
    const db = parseFloat(v)
    if (isFinite(fr) && isFinite(db)) points.push([fr, db])
  }
  return points
}

let phoneBooksCache = null

function readJsonCache(key) {
  try {
    return JSON.parse(fs.readFileSync(join(CACHE_DIR, key + '.json'), 'utf-8'))
  } catch (_) {
    return null
  }
}

function writeJsonCache(key, data) {
  try {
    fs.writeFileSync(join(CACHE_DIR, key + '.json'), JSON.stringify(data))
  } catch (_) {}
}

async function getPhoneBooks() {
  if (phoneBooksCache) return phoneBooksCache
  phoneBooksCache = {}
  await Promise.all(
    Object.entries(CRINACLE_SOURCES).map(async ([rig, src]) => {
      try {
        const r = await fetch(src.bookUrl, { headers: BROWSER_HEADERS })
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        phoneBooksCache[rig] = await r.json()
        writeJsonCache(`book_crinacle_${rig}`, phoneBooksCache[rig])
      } catch (e) {
        // offline fallback: cached phone book dari run sebelumnya
        phoneBooksCache[rig] = readJsonCache(`book_crinacle_${rig}`) || []
      }
    })
  )
  return phoneBooksCache
}

function bookToModels(book, rig) {
  const models = []
  for (const manufacturer of book) {
    const mName = manufacturer.suffix ? `${manufacturer.name} ${manufacturer.suffix}` : manufacturer.name
    for (const model of manufacturer.phones) {
      if (typeof model === 'string') {
        models.push({ brand: mName, name: `${mName} ${model}`, files: [model.trim()], rig })
      } else {
        const base = `${mName} ${model.name}`
        if (model.suffix && Array.isArray(model.file) && Array.isArray(model.suffix)) {
          model.file.forEach((f, i) => {
            models.push({ brand: mName, name: `${base} ${model.suffix[i]}`, files: [f.trim()], rig })
          })
        } else if (Array.isArray(model.file)) {
          if (model.file.length > 1 && model.file.length === new Set(model.file.map((f) => f.replace(/\s+[LR]\d?\.txt$/i, ''))).size) {
            // multiple distinct measurements = variants
            model.file.forEach((f) => models.push({ brand: mName, name: `${base} (${f.replace(/\.txt$/i, '')})`, files: [f.trim()], rig }))
          } else {
            models.push({ brand: mName, name: base, files: model.file.map((f) => f.trim()), rig })
          }
        } else {
          models.push({ brand: mName, name: base, files: [(model.file || model.name).toString().trim()], rig })
        }
      }
    }
  }
  return models
}

async function fetchWithHeaders(url) {
  const res = await fetch(url, { headers: BROWSER_HEADERS })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.text()
}

// Resolve actual filename on server — phone book names sometimes differ from
// actual file names (e.g. "Sa6 (On)" vs "SA6 (On)", "NM2 Plus" vs "NM2+")
const FILENAME_FIXES = {
  'Sa6 (On)': 'SA6 (On)',
  'Sa6 Mk2 (On)': 'SA6 Mk2 (On)',
  'NM2 Plus': 'NM2+',
  'Voyager 3 00': 'Voyager 3 (00)',
  'Voyager 3 10': 'Voyager 3 (10)',
  'Voyager 3 02': 'Voyager 3 (02)',
  'Voyager 3 12': 'Voyager 3 (12)',
  'NF2u': 'NF-2U',
  'T5 Tin': 'T5'
}

async function fetchMeasurementFile(urlBase, fileName, channel) {
  const candidates = [fileName]
  if (FILENAME_FIXES[fileName]) candidates.push(FILENAME_FIXES[fileName])
  // generic fallbacks: brand-less name, case variants
  const stripped = fileName.replace(/\s*\([^)]*\)\s*$/, '').trim()
  if (stripped !== fileName) candidates.push(stripped)
  const upper = fileName.toUpperCase()
  if (upper !== fileName) candidates.push(upper)

  for (const name of candidates) {
    const url = urlBase + encodeURIComponent(`${name} ${channel}.txt`)
    try {
      const text = await fetchWithHeaders(url)
      const points = parseRewCsv(text)
      if (points.length > 0) return points
    } catch (_) {
      // try next candidate
    }
  }
  return null
}

function parseRewCsv(text) {
  const points = []
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith('*') || line.startsWith('!') || line.trim() === '') continue
    const parts = line.split(',')
    const f = parseFloat(parts[0])
    const v = parseFloat(parts[1])
    if (isFinite(f) && isFinite(v)) points.push([f, v])
  }
  return points
}

function loadTargets() {
  const dir = join(DATA_DIR, 'targets')
  const targets = {}
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.csv')) continue
    const content = fs.readFileSync(join(dir, f), 'utf-8')
    const lines = content.split(/\r?\n/).slice(1)
    const points = []
    for (const l of lines) {
      const [fr, v] = l.split(',')
      const f = parseFloat(fr)
      const db = parseFloat(v)
      if (isFinite(f) && isFinite(db)) points.push([f, db])
    }
    targets[f.replace('.csv', '')] = { name: f.replace('.csv', ''), points }
  }
  return targets
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1500,
    height: 950,
    minWidth: 1100,
    minHeight: 700,
    title: 'IEMunity',
    icon: join(__dirname, '../../build/icon.png'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  // Grant WebHID & Web Serial device access (device PEQ feature)
  const ses = session.defaultSession
  ses.setDevicePermissionHandler((_details) => true)

  // WebHID: kalau tepat 1 device, auto-pick; kalau lebih, jangan panggil callback kosong (cancel request)
  // biarkan default Electron picker handle multi-device
  ses.on('select-hid-device', (event, details, callback) => {
    if (details.deviceList && details.deviceList.length === 1) {
      callback(details.deviceList[0].deviceId)
      return
    }
    // >1 device — jangan callback() kosong (cancel); biarkan Electron tunjuk picker
    // hanya callback kalau nak pilih secara programatik, jadi kita tidak campur tangan
  })
  // Allow all HID devices to be listed in the picker (vendor filters are applied
  // by the renderer via requestDevice filters)
  ses.setPermissionCheckHandler((_wc, permission, requestingOrigin, _mediaOrigin) => {
    if (permission === 'hid' || permission === 'serial' || permission === 'media' || permission === 'clipboard-sanitized-write' || permission === 'clipboard-read') return true
    return false
  })

  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

ipcMain.handle('db-refresh', async () => {
  // invalidate in-memory caches & delete cached phone books — next db-index call
  // akan re-fetch semuanya online
  phoneBooksCache = null
  squigBooksCache = null
  let removed = 0
  for (const f of fs.readdirSync(CACHE_DIR)) {
    if (f.startsWith('book_')) {
      fs.rmSync(join(CACHE_DIR, f))
      removed++
    }
  }
  // trigger re-fetch sekarang
  await getPhoneBooks()
  await getSquigBooks()
  // refresh AutoEq index online (kalau GitHub API rate-limit, bundled index kekal)
  let autoeqCount = null
  try {
    autoeqCount = await refreshAutoeqIndex()
  } catch (_) {}
  return { removed, autoeqCount }
})

ipcMain.handle('db-clear-measurement-cache', async () => {
  let removed = 0
  for (const f of fs.readdirSync(CACHE_DIR)) {
    if (!f.startsWith('book_')) {
      fs.rmSync(join(CACHE_DIR, f))
      removed++
    }
  }
  return { removed }
})

ipcMain.handle('db-cache-info', () => {
  let books = 0
  let measurements = 0
  let bytes = 0
  for (const f of fs.readdirSync(CACHE_DIR)) {
    const size = fs.statSync(join(CACHE_DIR, f)).size
    bytes += size
    if (f.startsWith('book_')) books++
    else measurements++
  }
  return { books, measurements, mb: Math.round(bytes / 1e5) / 10 }
})

ipcMain.handle('db-index', async () => {
  const books = await getPhoneBooks()
  const models = []
  for (const [rig, book] of Object.entries(books)) {
    for (const m of bookToModels(book, rig)) models.push(m)
  }
  // community AutoEq databases (bundled index)
  models.push(...getAutoeqIndex())
  // squig.link partner sites
  const squig = await getSquigBooks()
  for (const { site, models: sm } of squig) {
    for (const m of sm) models.push({ name: m.name, rig: site.rig, brand: m.brand, source: site.name, files: [m.file], squigSite: site.url })
  }
  return models.map(({ name, rig, brand, files, source, form }) => ({ name, rig, brand, files, source, form }))
})

ipcMain.handle('db-measurements', async (_e, name, rig, source) => {
  // community AutoEq source? (source disambiguates duplicate name+rig entries)
  const aq = getAutoeqIndex().find((x) => x.name === name && x.rig === rig && (source ? x.source === source : true))
  if (aq) {
    const cacheKey = `autoeq_${aq.source}_${aq.form}_${aq.file}`.replace(/[^a-zA-Z0-9_-]/g, '_')
    const cacheFile = join(CACHE_DIR, cacheKey + '.json')
    if (fs.existsSync(cacheFile)) {
      const points = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'))
      return { AVG: points }
    }
    const src = aq
    const tryUrls = [
      AUTOEQ_RAW(src.source, src.form, src.file),
      `https://raw.githubusercontent.com/jaakkopasanen/AutoEq/master/measurements/${encodeURIComponent(src.source)}/data/${src.form}/${encodeURIComponent(src.file)}`
    ]
    let text = null
    for (const u of tryUrls) {
      try {
        text = await fetchWithHeaders(u)
        break
      } catch (_) {}
    }
    if (!text) throw new Error('Measurement download failed (CDN + GitHub both failed)')
    const points = parseAutoeqCsv(text)
    if (!points.length) throw new Error('Empty measurement')
    fs.writeFileSync(cacheFile, JSON.stringify(points))
    return { AVG: points }
  }

  // squig.link partner site?
  const squig = await getSquigBooks()
  for (const { site, models: sm } of squig) {
    if (source && site.name !== source) continue
    const sq = sm.find((x) => x.name === name)
    if (!sq) continue
    const out = {}
    for (const ch of ['L', 'R']) {
      const cacheKey = `squig_${site.name}_${sq.file}_${ch}`.replace(/[^a-zA-Z0-9_-]/g, '_')
      const cacheFile = join(CACHE_DIR, cacheKey + '.json')
      let points
      if (fs.existsSync(cacheFile)) {
        points = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'))
      } else {
        const url = site.url + 'data/' + encodeURIComponent(`${sq.file} ${ch}.txt`)
        try {
          const text = await fetchWithHeaders(url)
          points = parseSquigRew(text)
        } catch (_) {
          points = null
        }
        if (points && points.length) fs.writeFileSync(cacheFile, JSON.stringify(points))
      }
      if (points && points.length > 0) out[ch] = points
    }
    if (out.L || out.R) return out
  }

  const books = await getPhoneBooks()
  const book = books[rig]
  if (!book) throw new Error('Unknown rig')
  const models = bookToModels(book, rig)
  const m = models.find((x) => x.name === name)
  if (!m) throw new Error('Model not found')
  const out = {}
  const urlBase = CRINACLE_SOURCES[rig].urlBase
  for (const fileName of m.files) {
    for (const ch of ['L', 'R']) {
      const cacheKey = `${rig}_${fileName}_${ch}`.replace(/[^a-zA-Z0-9_-]/g, '_')
      const cacheFile = join(CACHE_DIR, cacheKey + '.json')
      let points
      if (fs.existsSync(cacheFile)) {
        points = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'))
      } else {
        points = await fetchMeasurementFile(urlBase, fileName, ch)
        if (points) fs.writeFileSync(cacheFile, JSON.stringify(points))
      }
      if (points && points.length > 0) out[ch] = points
    }
  }
  if (!out.L && !out.R) throw new Error(`Measurement data not found for "${m.files.join(', ')}" on server`)
  return out
})

ipcMain.handle('db-targets', () => loadTargets())

// ── auto-update IPC ──
ipcMain.handle('update-check', async () => {
  if (!autoUpdater) return { available: false, reason: 'dev-mode atau updater tak available' }
  try {
    const result = await autoUpdater.checkForUpdates()
    const current = app.getVersion()
    const latest = result?.updateInfo?.version
    if (latest && latest !== current) {
      return { available: true, current, latest, notes: (result.updateInfo.releaseNotes || '').toString().slice(0, 500) }
    }
    return { available: false, current, latest: latest || current }
  } catch (e) {
    return { available: false, reason: e.message }
  }
})

ipcMain.handle('update-download', async (_e) => {
  if (!autoUpdater) return { ok: false, reason: 'dev-mode' }
  return new Promise((resolve) => {
    const onProgress = (info) => {
      const win = BrowserWindow.getAllWindows()[0]
      if (win && !win.isDestroyed()) win.webContents.send('update-progress', { percent: info.percent, mb: Math.round(info.transferred / 1e5) / 10 })
    }
    const onDone = () => { cleanup(); resolve({ ok: true }) }
    const onErr = (err) => { cleanup(); resolve({ ok: false, reason: err.message }) }
    const cleanup = () => {
      autoUpdater.off('download-progress', onProgress)
      autoUpdater.off('update-downloaded', onDone)
      autoUpdater.off('error', onErr)
    }
    autoUpdater.on('download-progress', onProgress)
    autoUpdater.once('update-downloaded', onDone)
    autoUpdater.once('error', onErr)
    autoUpdater.downloadUpdate().catch(onErr)
  })
})

ipcMain.handle('update-install', () => {
  if (!autoUpdater) return false
  autoUpdater.quitAndInstall()
  return true
})

ipcMain.handle('import-file', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'Measurement data', extensions: ['csv', 'txt', 'json'] }]
  })
  if (result.canceled || result.filePaths.length === 0) return null
  const filePath = result.filePaths[0]
  const content = fs.readFileSync(filePath, 'utf-8')
  return { name: filePath.split(/[\\/]/).pop().replace(/\.[^.]+$/, ''), content, ext: filePath.split('.').pop().toLowerCase() }
})

ipcMain.handle('import-url', async (_event, url) => {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const content = await res.text()
  const clean = url.split(/[?#]/)[0]
  const ext = clean.split('.').pop().toLowerCase()
  return { name: clean.split(/[\\/]/).pop().replace(/\.[^.]+$/, ''), content, ext: ['csv', 'json', 'txt'].includes(ext) ? ext : 'csv' }
})

ipcMain.handle('save-preset', async (_event, data) => {
  const result = await dialog.showSaveDialog({
    defaultPath: 'preset.json',
    filters: [{ name: 'Preset', extensions: ['json'] }]
  })
  if (result.canceled || !result.filePath) return false
  fs.writeFileSync(result.filePath, JSON.stringify(JSON.parse(data), null, 2), 'utf-8')
  return true
})

ipcMain.handle('load-preset', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'Preset', extensions: ['json'] }]
  })
  if (result.canceled || result.filePaths.length === 0) return null
  return fs.readFileSync(result.filePaths[0], 'utf-8')
})

ipcMain.handle('save-text', async (_e, defaultName, data) => {
  const result = await dialog.showSaveDialog({
    defaultPath: defaultName,
    filters: [{ name: 'Text', extensions: ['txt'] }, { name: 'Graphic EQ param', extensions: ['txt'] }]
  })
  if (result.canceled || !result.filePath) return false
  fs.writeFileSync(result.filePath, data, 'utf-8')
  return true
})

ipcMain.handle('open-audio-file', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'Audio', extensions: ['mp3', 'wav', 'flac', 'ogg', 'm4a', 'aac'] }]
  })
  if (result.canceled || result.filePaths.length === 0) return null
  // renderer perlukan file:// URL untuk fetch dalam Electron — encode path parts
  const p = result.filePaths[0]
  return 'file:///' + p.replace(/\\/g, '/').split('/').map(encodeURIComponent).join('/')
})
