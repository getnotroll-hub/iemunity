import React, { useState, useCallback, useRef, useEffect } from 'react'
import { HID_DEVICE_CONFIG, SERIAL_DEVICE_CONFIG, matchHidDevice, resolveConstraints } from './deviceConfig'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ── WalkPlay device extras: DAC filter, gain mode, work mode, mic gain, balance ──

// FiiO HID protocol (from Pragmatic Audio devicePEQ)
const FIIO = {
  FILTER_COUNT: 0x18,
  GLOBAL_GAIN: 0x17,
  FILTER_PARAMS: 0x15,
  PRESET_SWITCH: 0x16,
  SAVE: 0x19,
  SAVE_V2: 0x21,
  SET_H1: 0xaa, SET_H2: 0x0a,
  GET_H1: 0xbb, GET_H2: 0x0b,
  END: 0xee
}

function fiioGainBytes(gain) {
  let t = Math.round(gain * 10)
  if (t < 0) t = (Math.abs(t) ^ 65535) + 1
  return [(t >> 8) & 0xff, t & 0xff]
}

function fiioParseGain(lo, hi) {
  let r = (lo << 8) | hi
  return r & 0x8000 ? -(((r ^ 0xffff) + 1) / 10) : r / 10
}

function splitBE(value) {
  return [(value >> 8) & 0xff, value & 0xff]
}

const TYPE_TO_NUM = { PK: 0, LSQ: 1, HSQ: 2 }
const NUM_TO_TYPE = { 0: 'PK', 1: 'LSQ', 2: 'HSQ' }

// WalkPlay protocol (CrinEar Protocol Max, Moondrop/Tanchjim DSP, dll.)
const WP = {
  REPORT_ID: 0x4b,
  READ: 0x80,
  WRITE: 0x01,
  END: 0x00,
  CMD: {
    FLASH_EQ: 0x01,
    MIC_GAIN: 0x02,
    GLOBAL_GAIN: 0x03,
    PEQ_VALUES: 0x09,
    TEMP_WRITE: 0x0a,
    VERSION: 0x0c,
    DAC_FILTER: 0x11,
    DAC_BALANCE: 0x16,
    GAIN_MODE: 0x19,
    DAC_WORK_MODE: 0x1d
  }
}

// IIR coefficients @ 96kHz (WalkPlay DSP)
function computeIIRFilter(freq, gain, q) {
  const bArr = new Array(20).fill(0)
  const sqrt = Math.sqrt(Math.pow(10, gain / 20))
  const d3 = (freq * 6.283185307179586) / 96000
  const sin = Math.sin(d3) / (2 * q)
  const d4 = sin * sqrt
  const d5 = sin / sqrt
  const d6 = d5 + 1
  const a = [1, (Math.cos(d3) * -2) / d6, (1 - d5) / d6]
  const b = [(d4 + 1) / d6, (Math.cos(d3) * -2) / d6, (1 - d4) / d6]
  const qa = a.map((d) => Math.round(d * 1073741824))
  const qb = b.map((d) => Math.round(d * 1073741824))
  const q5 = [qb[0], qb[1], qb[2], -qa[1], -qa[2]]
  let index = 0
  for (const value of q5) {
    bArr[index] = value & 0xff
    bArr[index + 1] = (value >> 8) & 0xff
    bArr[index + 2] = (value >> 16) & 0xff
    bArr[index + 3] = (value >> 24) & 0xff
    index += 4
  }
  return bArr
}

function toLEBytes(value, length) {
  const arr = []
  for (let i = 0; i < length; i++) arr.push((value >> (8 * i)) & 0xff)
  return arr
}

const WP_TYPE_NUM = { PK: 2, LSQ: 1, HSQ: 3, LP: 4, HP: 5 }
const WP_NUM_TYPE = { 1: 'LSQ', 2: 'PK', 3: 'HSQ', 4: 'LP', 5: 'HP' }

// ── Device info dashboard: firmware, battery, active filter, gain mode ──
function DeviceInfoPanel({ device, handler, model }) {
  const [info, setInfo] = useState({})
  const [loading, setLoading] = useState(false)

  const read = async (cmd, parseFn) => {
    if (!device) return null
    return new Promise((resolve) => {
      let done = false
      const timer = setTimeout(() => { if (!done) { done = true; try { device.removeEventListener('inputreport', h) } catch (_) {}; resolve(null) } }, 1200)
      const h = (event) => {
        if (done) return
        const d = new Uint8Array(event.data.buffer, event.data.byteOffset, event.data.byteLength)
        if (d[0] !== WP.READ || d[1] !== cmd) return
        done = true
        clearTimeout(timer)
        try { device.removeEventListener('inputreport', h) } catch (_) {}
        resolve(parseFn(d))
      }
      device.addEventListener('inputreport', h)
      device.sendReport(WP.REPORT_ID, new Uint8Array([WP.READ, cmd, 0x00])).catch(() => { if (!done) { done = true; clearTimeout(timer); resolve(null) } })
    })
  }

  const load = async () => {
    if (!device) return
    setLoading(true)
    const out = {}
    // firmware version (WalkPlay)
    if (handler === 'walkplay') {
      const ver = await read(WP.CMD.VERSION, (d) => String.fromCharCode(d[3], d[4], d[5]))
      if (ver) out.firmware = ver
      // global gain
      const gg = await read(WP.CMD.GLOBAL_GAIN, (d) => new Int8Array([d[4]])[0])
      if (gg !== null) out.globalGain = gg
      // gain mode
      const gm = await read(WP.CMD.GAIN_MODE, (d) => d[3] === 1)
      if (gm !== null) out.gainMode = gm ? 'High' : 'Low'
      // DAC work mode
      const wm = await read(WP.CMD.DAC_WORK_MODE, (d) => d[3])
      if (wm !== null) out.workMode = wm === 0 ? 'Class AB' : 'Class H'
    }
    setInfo(out)
    setLoading(false)
  }

  return (
    <div className="extras">
      <button className="extras-toggle" onClick={load} disabled={loading}>
        📊 Device info {loading ? '…' : ''}
      </button>
      {Object.keys(info).length > 0 && (
        <div className="extras-panel" style={{ marginTop: 6 }}>
          {info.firmware && <div className="extras-row"><span className="extras-label">Firmware</span><span className="hint">{info.firmware}</span></div>}
          {info.gainMode && <div className="extras-row"><span className="extras-label">Gain mode</span><span className="hint">{info.gainMode}</span></div>}
          {info.workMode && <div className="extras-row"><span className="extras-label">Work mode</span><span className="hint">{info.workMode}</span></div>}
          {info.globalGain !== undefined && <div className="extras-row"><span className="extras-label">Global gain</span><span className="hint">{info.globalGain} dB</span></div>}
        </div>
      )}
    </div>
  )
}
const DAC_FILTER_NAMES = { 1: 'FAST-LL', 2: 'FAST-PC', 3: 'SLOW-LL', 4: 'SLOW-PC', 5: 'NON-OS' }
const DAC_FILTERS = ['FAST-LL', 'FAST-PC', 'SLOW-LL', 'SLOW-PC', 'NON-OS']
const DAC_FILTER_NUM = { 'FAST-LL': 1, 'FAST-PC': 2, 'SLOW-LL': 3, 'SLOW-PC': 4, 'NON-OS': 5 }

function WalkplayExtras({ device, onLog }) {
  const [open, setOpen] = useState(false)
  const [dacFilter, setDacFilter] = useState(null)
  const [gainMode, setGainMode] = useState(null)
  const [workMode, setWorkMode] = useState(null)
  const [micGain, setMicGain] = useState(null)
  const [balance, setBalance] = useState(null)

  const send = async (packet) => {
    try {
      await device.sendReport(WP.REPORT_ID, new Uint8Array(packet))
      return true
    } catch (e) {
      console.warn('HID send failed:', e.message)
      return false
    }
  }

  const read = async (cmd, parseFn) => {
    if (!device) return null
    return new Promise((resolve) => {
      let done = false
      const timer = setTimeout(() => {
        if (!done) { done = true; try { device.removeEventListener('inputreport', h) } catch (_) {} resolve(null) }
      }, 1200)
      const h = (event) => {
        if (done) return
        const d = new Uint8Array(event.data.buffer, event.data.byteOffset, event.data.byteLength)
        if (d[0] !== WP.READ || d[1] !== cmd) return
        done = true
        clearTimeout(timer)
        try { device.removeEventListener('inputreport', h) } catch (_) {}
        resolve(parseFn(d))
      }
      device.addEventListener('inputreport', h)
      send([WP.READ, cmd, 0x00]).catch(() => {
        if (!done) { done = true; clearTimeout(timer); resolve(null) }
      })
    })
  }

  // read current values when panel opens
  useEffect(() => {
    if (!open) return
    read(WP.CMD.DAC_FILTER, (d) => DAC_FILTER_NAMES[d[3]] || String(d[3])).then(setDacFilter)
    read(WP.CMD.GAIN_MODE, (d) => d[3] === 1).then(setGainMode)
    read(WP.CMD.DAC_WORK_MODE, (d) => d[3]).then(setWorkMode)
    read(WP.CMD.MIC_GAIN, (d) => {
      const raw = d[3] | (d[4] << 8)   // 16-bit value di bytes 3-4 (bukan 2-3)
      const signed = raw > 32767 ? raw - 65536 : raw
      return Math.round((signed * 15 / 32767) * 10) / 10
    }).then(setMicGain)
  }, [open])

  const apply = async (label, packet, val, setter) => {
    const ok = await send(packet)
    if (ok) {
      setter(val)
      onLog(`${label}: saved ✓`)
    } else {
      onLog(`${label}: failed to write — device disconnected?`)
    }
  }

  return (
    <div className="extras">
      <button className="extras-toggle" onClick={() => setOpen(!open)}>
        ⚙️ Device extras {open ? '▲' : '▼'}
      </button>
      {open && (
        <div className="extras-panel">
          {/* DAC Filter */}
          <div className="extras-row">
            <span className="extras-label">DAC Filter</span>
            <select value={dacFilter ?? ''} onChange={(e) => setDacFilter(e.target.value)}>
              {DAC_FILTERS.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
            <button onClick={() => apply('DAC filter', [WP.WRITE, WP.CMD.DAC_FILTER, 0x01, DAC_FILTER_NUM[dacFilter]], dacFilter, setDacFilter)}>Apply</button>
          </div>

          {/* Gain Mode */}
          <div className="extras-row">
            <span className="extras-label">Gain Mode</span>
            <label className="chk">
              <input type="checkbox" checked={gainMode === true} onChange={(e) => apply('Gain mode', [WP.WRITE, WP.CMD.GAIN_MODE, 0x01, e.target.checked ? 1 : 0], e.target.checked, setGainMode)} />
              High gain
            </label>
            {gainMode !== null && <span className="hint">{gainMode ? 'On' : 'Off'}</span>}
          </div>

          {/* DAC Work Mode */}
          <div className="extras-row">
            <span className="extras-label">DAC Work Mode</span>
            <select value={workMode ?? 0} onChange={(e) => apply('Work mode', [WP.WRITE, WP.CMD.DAC_WORK_MODE, 0x01, +e.target.value], +e.target.value, setWorkMode)}>
              <option value={0}>Class AB</option>
              <option value={1}>Class H</option>
            </select>
            {workMode !== null && <span className="hint">{workMode === 0 ? 'Class AB' : 'Class H'}</span>}
          </div>

          {/* Mic Gain */}
          <div className="extras-row">
            <span className="extras-label">Mic Gain</span>
            <input type="range" min="-15" max="15" step="1" value={micGain ?? 0} onChange={(e) => setMicGain(+e.target.value)} />
            <span className="hint">{micGain ?? 0}dB</span>
            <button onClick={() => {
              const v = Math.round((micGain ?? 0) * (32767 / 15))
              const enc = v < 0 ? v + 65536 : v
              apply('Mic gain', [WP.WRITE, WP.CMD.MIC_GAIN, 0x02, enc & 0xff, (enc >> 8) & 0xff], micGain, setMicGain)
            }}>Apply</button>
          </div>

          {/* Balance */}
          <div className="extras-row">
            <span className="extras-label">L/R Balance</span>
            <input type="range" min="-20" max="20" step="1" value={balance ?? 0} onChange={(e) => setBalance(+e.target.value)} />
            <span className="hint">{balance === 0 ? 'Center' : balance > 0 ? `L+${balance}` : `R+${-balance}`}</span>
            <button onClick={async () => {
              const v = balance ?? 0
              if (v > 0) {
                await apply('Balance L', [WP.WRITE, WP.CMD.DAC_BALANCE, 0x04, 0x01, 0x00, v & 0xff, 0x00], v, setBalance)
                await send([WP.WRITE, WP.CMD.DAC_BALANCE, 0x04, 0x00, 0x00, 0x00, 0x00])
              } else if (v < 0) {
                await send([WP.WRITE, WP.CMD.DAC_BALANCE, 0x04, 0x01, 0x00, 0x00, 0x00])
                await apply('Balance R', [WP.WRITE, WP.CMD.DAC_BALANCE, 0x04, 0x00, 0x00, (-v) & 0xff, 0x00], v, setBalance)
              } else {
                await send([WP.WRITE, WP.CMD.DAC_BALANCE, 0x04, 0x00, 0x01, 0x00, 0x00])
                await send([WP.WRITE, WP.CMD.DAC_BALANCE, 0x04, 0x00, 0x00, 0x00, 0x00])
                setBalance(0)
                onLog('Balance: centered ✓')
              }
            }}>Apply</button>
          </div>
          <p className="hint">DAC filter changes rolloff character (FAST-LL = cleanest, NON-OS = most analog-sounding). Work mode Class H = power saving.</p>
        </div>
      )}
    </div>
  )
}

export default function DevicePanel({ filters, preamp, onFiltersFromDevice, onConstraintsChange }) {
  const [connected, setConnected] = useState(null)
  const [status, setStatus] = useState('')
  const [slot, setSlot] = useState(-1)
  const [busy, setBusy] = useState(false)
  const devRef = useRef(null)
  const responseWaiter = useRef(null)

  const wireListener = useCallback((event) => {
    const data = new Uint8Array(event.data.buffer, event.data.byteOffset, event.data.byteLength)
    if (responseWaiter.current) responseWaiter.current(data)
  }, [])

  const sendReport = async (device, reportId, packet) => {
    const data = new Uint8Array(packet)
    await device.sendReport(reportId, data)
  }

  const waitResponse = (device, matchFn, timeout = 3000) => {
    return new Promise((resolve) => {
      let done = false
      const timer = setTimeout(() => {
        if (!done) { done = true; responseWaiter.current = null; resolve(null) }
      }, timeout)
      responseWaiter.current = (data) => {
        if (matchFn(data)) {
          done = true
          clearTimeout(timer)
          responseWaiter.current = null
          resolve(data)
        }
      }
    })
  }

  const connectHid = async () => {
    try {
      if (!navigator.hid) {
        setStatus('WebHID not available in this build!')
        return
      }
      setStatus('Opening device picker…')
      const allVendorIds = HID_DEVICE_CONFIG.flatMap((v) => v.vendorIds || []).filter(Boolean)
      const filters = allVendorIds.length ? allVendorIds.map((vendorId) => ({ vendorId })) : undefined
      let device
      try {
        const [d] = await navigator.hid.requestDevice({ filters })
        device = d
      } catch (e) {
        if (e.name === 'NotFoundError') {
          // user cancel — diam sahaja
          setStatus('')
          return
        }
        throw e
      }
      if (!device) {
        setStatus('No device selected (picker cancelled or empty)')
        return
      }
      setStatus(`Selected: ${device.productName || 'unnamed'} (VID 0x${device.vendorId.toString(16)} PID 0x${device.productId.toString(16)})`)
      await device.open()
      const matched = matchHidDevice(device.vendorId, device.productId, device.productName)
      if (!matched) {
        setStatus(`Device not supported: "${device.productName}" VID 0x${device.vendorId.toString(16)} PID 0x${device.productId.toString(16)} — beritahu saya VID/PID ini untuk tambah support`)
        await device.close()
        return
      }
      device.oninputreport = wireListener
      devRef.current = { rawDevice: device, ...matched, constraints: resolveConstraints(matched.modelConfig) }
      const displayName = matched.model !== device.productName ? `${matched.model} (${device.productName})` : matched.model
      setConnected({ name: displayName, manufacturer: matched.manufacturer, constraints: devRef.current.constraints, slots: matched.modelConfig.availableSlots || [] })
      setSlot(matched.modelConfig.firstWritableEQSlot ?? 0)
      setStatus(`Connected: ${displayName} (${matched.manufacturer})`)
    } catch (e) {
      setStatus(`HID connect failed: ${e.message}`)
    }
  }

  const connectSerial = async () => {
    try {
      const filters = SERIAL_DEVICE_CONFIG
        .filter((d) => d.vendorId)
        .flatMap((d) => Object.values(d.devices).map((dev) => ({ usbVendorId: d.vendorId, usbProductId: dev.usbProductId })))
      const port = await navigator.serial.requestPort({ filters })
      if (!port) return
      // identify device
      const info = port.getInfo()
      let matched = null
      for (const vendor of SERIAL_DEVICE_CONFIG) {
        for (const [name, cfg] of Object.entries(vendor.devices)) {
          if (info.usbVendorId === vendor.vendorId && info.usbProductId === cfg.usbProductId) {
            matched = { manufacturer: vendor.manufacturer, handler: vendor.handler, model: name, modelConfig: { disconnectOnSave: false, disabledPresetId: -1, ...cfg } }
            break
          }
        }
        if (matched) break
      }
      if (!matched) {
        setStatus(`Serial device not supported (VID ${info.usbVendorId?.toString(16) || 'BT'} PID ${info.usbProductId?.toString(16) || '-'})`)
        return
      }
      await port.open({ baudRate: matched.modelConfig.baudRate || 115200 })
      const writer = port.writable.getWriter()
      const reader = port.readable.getReader()
      devRef.current = { rawDevice: port, writer, reader, ...matched, constraints: resolveConstraints(matched.modelConfig), serial: true }
      setConnected({ name: matched.model, manufacturer: matched.manufacturer, constraints: devRef.current.constraints, slots: matched.modelConfig.availableSlots || [{ id: 0, name: 'Custom EQ' }] })
      if (onConstraintsChange) onConstraintsChange({ model: matched.model, ...devRef.current.constraints })
      setSlot(matched.modelConfig.firstWritableEQSlot ?? 0)
      setStatus(`Connected: ${matched.model} via Serial`)
    } catch (e) {
      setStatus(`Serial connect failed: ${e.message}`)
    }
  }

  const disconnect = async () => {
    const d = devRef.current
    if (!d) return
    try {
      if (d.serial) {
        await d.reader?.cancel()
        d.reader?.releaseLock()
        d.writer?.releaseLock()
        await d.rawDevice.close()
      } else {
        d.rawDevice.oninputreport = null
        await d.rawDevice.close()
      }
    } catch (_) {}
    devRef.current = null
    setConnected(null)
    if (onConstraintsChange) onConstraintsChange(null)
    setStatus('Disconnected')
  }

  const pushFiio = async () => {
    const d = devRef.current
    if (!d) return
    setBusy(true)
    try {
      const device = d.rawDevice
      const reportId = d.modelConfig.reportId ?? 7
      const mc = d.modelConfig
      const maxGain = d.constraints?.maxGain ?? 12
      const activeFilters = filters.filter((f) => f.enabled !== false)
      const n = Math.min(activeFilters.length, d.constraints?.maxFilters ?? 10)

      // global gain: maxGain + preamp (device auto-cuts headroom)
      const globalGain = Math.round((maxGain + (preamp || 0)) * 10)
      const [gLo, gHi] = [(globalGain & 0xff), (globalGain >> 8) & 0xff]
      await sendReport(device, reportId, [FIIO.SET_H1, FIIO.SET_H2, 0, 0, FIIO.GLOBAL_GAIN, 2, gLo, gHi, 0, FIIO.END])
      await sleep(100)

      // filter count
      await sendReport(device, reportId, [FIIO.SET_H1, FIIO.SET_H2, 0, 0, FIIO.FILTER_COUNT, 1, n, 0, FIIO.END])
      await sleep(100)

      // each filter
      for (let i = 0; i < n; i++) {
        const f = activeFilters[i]
        const [fHi, fLo] = splitBE(Math.round(f.freq))
        const [gnHi, gnLo] = fiioGainBytes(f.gain)
        const [qHi, qLo] = splitBE(Math.round(f.q * 100))
        await sendReport(device, reportId, [
          FIIO.SET_H1, FIIO.SET_H2, 0, 0, FIIO.FILTER_PARAMS, 8,
          i, gnHi, gnLo, fHi, fLo, qHi, qLo,
          TYPE_TO_NUM[f.type] ?? 0, 0, FIIO.END
        ])
        await sleep(50)
      }
      await sleep(100)

      // save
      const saveCmd = mc.saveCommandId || FIIO.SAVE
      await sendReport(device, reportId, [FIIO.SET_H1, FIIO.SET_H2, 0, 0, saveCmd, 1, slot, 0, FIIO.END])
      setStatus(`Pushed ${n} filters to ${d.model} (slot ${slot})`)
      if (mc.disconnectOnSave) {
        await sleep(500)
        await disconnect()
      }
    } catch (e) {
      setStatus(`Push failed: ${e.message}`)
    }
    setBusy(false)
  }

  const pullFiio = async () => {
    const d = devRef.current
    if (!d) return
    setBusy(true)
    try {
      const device = d.rawDevice
      const reportId = d.modelConfig.reportId ?? 7
      const filtersOut = []
      let peqCount = 0

      device.oninputreport = async (event) => {
        const data = new Uint8Array(event.data.buffer, event.data.byteOffset, event.data.byteLength)
        if (data[0] !== FIIO.GET_H1) return
        if (data[4] === FIIO.FILTER_COUNT) {
          peqCount = data[6]
          for (let i = 0; i < peqCount; i++) {
            await sleep(30)
            await sendReport(device, reportId, [FIIO.GET_H1, FIIO.GET_H2, 0, 0, FIIO.FILTER_PARAMS, 1, i, 0, FIIO.END])
          }
        } else if (data[4] === FIIO.FILTER_PARAMS) {
          const idx = data[6]
          filtersOut[idx] = {
            type: NUM_TO_TYPE[data[13]] || 'PK',
            freq: (data[9] << 8) | data[10],
            gain: fiioParseGain(data[7], data[8]),
            q: ((data[11] << 8) | data[12]) / 100 || 1,
            enabled: true
          }
        }
      }

      await sendReport(device, reportId, [FIIO.GET_H1, FIIO.GET_H2, 0, 0, FIIO.FILTER_COUNT, 0, 0, FIIO.END])
      await sleep(2500)

      const got = filtersOut.filter(Boolean)
      if (got.length) {
        onFiltersFromDevice(got)
        setStatus(`Pulled ${got.length} filters from ${d.model}`)
      } else {
        setStatus('No filters received (device may be empty or timeout)')
      }
    } catch (e) {
      setStatus(`Pull failed: ${e.message}`)
    } finally {
      // sentiasa restore wireListener
      if (devRef.current?.rawDevice) devRef.current.rawDevice.oninputreport = wireListener
      setBusy(false)
    }
  }

  const push = async () => {
    const d = devRef.current
    if (!d) return
    if (d.handler === 'fiio') return pushFiio()
    if (d.handler === 'walkplay') return pushWalkplay()
    if (d.handler === 'ktmicro') return pushKtmicro()
    if (d.handler === 'moondrop') return pushMoondrop()
    if (d.handler === 'fosi') return pushFosi()
    if (d.serial && d.handler === 'jdslabs') return pushJds()
    setStatus(`Push not yet implemented for handler: ${d.handler}`)
  }

  const pull = async () => {
    const d = devRef.current
    if (!d) return
    if (d.handler === 'fiio') return pullFiio()
    if (d.handler === 'walkplay') return pullWalkplay()
    if (d.handler === 'ktmicro') return pullKtmicro()
    if (d.handler === 'moondrop') return pullMoondrop()
    if (d.handler === 'fosi') return pullFosi()
    setStatus(`Pull not yet implemented for handler: ${d.handler}`)
  }

  // ── KT Micro protocol (Moondrop CDSP, Tanchjim DSP, KiwiEars) ──
  const KTM = { REPORT_ID: 0x4b, READ: 0x52, WRITE: 0x57, COMMIT: 0x53, CLEAR: 0x43 }

  const ktmWaitResponse = (device, reg, cmd, timeoutMs = 1000) => {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { responseWaiter.current = null; reject(new Error('KT Micro timeout')) }, timeoutMs)
      responseWaiter.current = (data) => {
        if (data[0] === reg && data[4] === cmd) {
          clearTimeout(timer)
          responseWaiter.current = null
          resolve(data)
        }
      }
    })
  }

  const ktmBandRegs = (mc, i) => {
    if (Array.isArray(mc.bandRegisters) && mc.bandRegisters[i]) return { g: mc.bandRegisters[i].freq, q: mc.bandRegisters[i].q }
    const base = mc.baseRegisterOffset || 0x26
    return { g: base + i * 2, q: base + i * 2 + 1 }
  }

  const pushKtmicro = async () => {
    const d = devRef.current
    setBusy(true)
    try {
      const device = d.rawDevice
      const mc = d.modelConfig
      const maxF = d.constraints?.maxFilters ?? mc.maxFilters ?? 5
      const active = filters.filter((f) => f.enabled !== false).slice(0, maxF)

      // clear first
      responseWaiter.current = null
      const clearP = ktmWaitResponse(device, 0, KTM.CLEAR)
      await sendReport(device, KTM.REPORT_ID, [0, 0, 0, 0, KTM.CLEAR, 0, 0, 0, 0, 0])
      await clearP.catch(() => {})
      await sleep(200)

      for (let i = 0; i < maxF; i++) {
        const f = active[i] || { freq: 100, gain: 0, q: 1, type: 'PK' }
        const { g, q } = ktmBandRegs(mc, i)
        let freq = f.freq
        if (mc.compensate2X) freq = Math.round(f.freq / 2)
        const gain = Math.round(f.gain * 10)
        const gEnc = gain < 0 ? gain + 0x10000 : gain
        const qEnc = Math.round(f.q * 1000)
        const typeVal = f.type === 'LSQ' ? 3 : f.type === 'HSQ' ? 4 : 0
        await sendReport(device, KTM.REPORT_ID, [g, 0, 0, 0, KTM.WRITE, 0, gEnc & 0xff, (gEnc >> 8) & 0xff, freq & 0xff, (freq >> 8) & 0xff])
        await sendReport(device, KTM.REPORT_ID, [q, 0, 0, 0, KTM.WRITE, 0, qEnc & 0xff, (qEnc >> 8) & 0xff, typeVal, 0])
        await sleep(30)
      }

      if (mc.deviceHandlesPregain === false) {
        let pv = Math.round(preamp || 0)
        if (pv < 0) pv = pv & 0xff
        await sendReport(device, KTM.REPORT_ID, [0x66, 0, 0, 0, KTM.WRITE, 0, pv, 0, 0, 0])
      }

      await sendReport(device, KTM.REPORT_ID, [0, 0, 0, 0, KTM.COMMIT, 0, 0, 0, 0, 0])
      await sleep(1000)
      setStatus(`Pushed ${active.length} filters to ${d.model}`)
      if (mc.disconnectOnSave) await sleep(300)
    } catch (e) {
      setStatus(`KT Micro push failed: ${e.message}`)
    }
    setBusy(false)
  }

  const pullKtmicro = async () => {
    const d = devRef.current
    setBusy(true)
    try {
      const device = d.rawDevice
      const mc = d.modelConfig
      const maxF = d.constraints?.maxFilters ?? mc.maxFilters ?? 5
      const out = []
      for (let i = 0; i < maxF; i++) {
        const { g, q } = ktmBandRegs(mc, i)
        const pG = ktmWaitResponse(device, g, KTM.READ)
        await sendReport(device, KTM.REPORT_ID, [g, 0, 0, 0, KTM.READ, 0, 0, 0, 0, 0])
        const dg = await pG
        let gainRaw = dg[6] | (dg[7] << 8)
        if (gainRaw > 0x7fff) gainRaw -= 0x10000
        let freq = dg[8] | (dg[9] << 8)
        if (mc.compensate2X) freq *= 2
        const pQ = ktmWaitResponse(device, q, KTM.READ)
        await sendReport(device, KTM.REPORT_ID, [q, 0, 0, 0, KTM.READ, 0, 0, 0, 0, 0])
        const dq = await pQ
        const qv = (dq[6] | (dq[7] << 8)) / 1000
        const typeVal = dq[8]
        out.push({ type: typeVal === 3 ? 'LSQ' : typeVal === 4 ? 'HSQ' : 'PK', freq, q: qv || 1, gain: gainRaw / 10, enabled: true })
        await sleep(30)
      }
      responseWaiter.current = null
      onFiltersFromDevice(out)
      setStatus(`Pulled ${out.length} filters from ${d.model}`)
    } catch (e) {
      setStatus(`KT Micro pull failed: ${e.message}`)
    }
    setBusy(false)
  }

  // ── Moondrop protocol (Rays, Marigold, FreeDSP, Moonriver...) ──
  const MD = { WRITE: 0x01, READ: 0x80, UPDATE_EQ: 0x09, COEFF_TO_REG: 0x0a, SAVE: 0x01, PRE_GAIN: 0x23 }

  const pushMoondrop = async () => {
    const d = devRef.current
    setBusy(true)
    try {
      const device = d.rawDevice
      const mc = d.modelConfig
      const maxF = d.constraints?.maxFilters ?? mc.maxFilters ?? 8
      const active = filters.filter((f) => f.enabled !== false).slice(0, maxF)

      for (let i = 0; i < maxF; i++) {
        const f = active[i] || { freq: 100, gain: 0, q: 1, type: 'PK' }
        const bArr = computeIIRFilter(f.freq, f.gain, f.q)
        const gainEnc = Math.round(f.gain * 256)
        const gainV = gainEnc < 0 ? gainEnc + 0x10000 : gainEnc
        const qEnc = Math.round(f.q * 256)
        const packet = [
          MD.WRITE, 0x09, 0x18, 0x00, i, 0x00, 0x00,
          ...bArr,
          f.freq & 0xff, (f.freq >> 8) & 0xff,
          qEnc & 0xff, (qEnc >> 8) & 0xff,
          gainV & 0xff, (gainV >> 8) & 0xff,
          f.type === 'LSQ' ? 1 : f.type === 'HSQ' ? 3 : 2,
          0x00, 0x07
        ]
        await sendReport(device, WP.REPORT_ID, packet)
        await sleep(20)
        // coeff-to-reg enable
        await sendReport(device, WP.REPORT_ID, [MD.WRITE, MD.COEFF_TO_REG, i, 0x00, 0xff, 0xff, 0xff])
        await sleep(20)
      }

      if (mc.deviceHandlesPregain === false) {
        const pv = Math.round((preamp || 0) * 256)
        const enc = pv < 0 ? pv + 0x10000 : pv
        await sendReport(device, WP.REPORT_ID, [MD.WRITE, MD.PRE_GAIN, 0x00, enc & 0xff, (enc >> 8) & 0xff])
        await sleep(50)
      }

      await sendReport(device, WP.REPORT_ID, [MD.WRITE, MD.SAVE])
      setStatus(`Pushed ${active.length} filters to ${d.model}`)
    } catch (e) {
      setStatus(`Moondrop push failed: ${e.message}`)
    }
    setBusy(false)
  }

  const pullMoondrop = async () => {
    const d = devRef.current
    setBusy(true)
    try {
      const device = d.rawDevice
      const maxF = d.constraints?.maxFilters ?? d.modelConfig.maxFilters ?? 8
      const out = []
      for (let i = 0; i < maxF; i++) {
        const p = new Promise((resolve) => {
          const timer = setTimeout(() => { responseWaiter.current = null; resolve(null) }, 1000)
          responseWaiter.current = (data) => {
            if (data[1] === 0x09 && data[4] === i) {
              clearTimeout(timer)
              responseWaiter.current = null
              resolve(data)
            }
          }
        })
        await sendReport(device, WP.REPORT_ID, [MD.READ, 0x09, 0x18, 0x00, i, 0x00])
        const data = await p
        if (data && data.length >= 34) {
          const freq = data[27] | (data[28] << 8)
          let qRaw = data[29] | (data[30] << 8)
          if (qRaw > 0x7fff) qRaw -= 0x10000
          let gRaw = data[31] | (data[32] << 8)
          if (gRaw > 0x7fff) gRaw -= 0x10000
          const type = data[33] === 1 ? 'LSQ' : data[33] === 3 ? 'HSQ' : 'PK'
          if (freq > 10 && freq < 24000) out.push({ type, freq, q: qRaw / 256, gain: gRaw / 256, enabled: true })
        }
        await sleep(50)
      }
      responseWaiter.current = null
      onFiltersFromDevice(out)
      setStatus(`Pulled ${out.length} filters from ${d.model}`)
    } catch (e) {
      setStatus(`Moondrop pull failed: ${e.message}`)
    }
    setBusy(false)
  }

  // ── Fosi Audio protocol (DS3) — feature reports ──
  const pushFosi = async () => {
    const d = devRef.current
    setBusy(true)
    try {
      const device = d.rawDevice
      const maxF = d.constraints?.maxFilters ?? 10
      const active = filters.filter((f) => f.enabled !== false).slice(0, maxF)
      const slotId = slot >= 0 ? slot : 7
      const f32 = (v) => { const b = new Uint8Array(4); new DataView(b.buffer).setFloat32(0, v, true); return [...b] }
      const typeVal = (t) => (t === 'LSQ' ? 1 : t === 'HSQ' ? 3 : 2)

      await device.receiveFeatureReport(0x91).catch(() => {})
      await sleep(50)
      await device.sendFeatureReport(1, new Uint8Array([0x77, 0x8a, slotId, 0, 0]))
      await sleep(30)

      for (let i = 0; i < maxF; i++) {
        const f = active[i] || { freq: 1000, gain: 0, q: 1, type: 'PK' }
        const packet = [0x77, 0x8d, slotId, i, typeVal(f.type), ...f32(f.freq), ...f32(f.q), ...f32(0), ...f32(f.gain)]
        const padded = [...packet, ...new Array(63 - packet.length).fill(0)]
        await device.sendFeatureReport(1, new Uint8Array(padded)).catch(async () => {
          await sendReport(device, 1, padded)
        })
        await sleep(20)
        await sendReport(device, 1, [0x77, 0x8e, slotId, i, ...new Array(59).fill(0)])
        await sleep(20)
      }

      await device.sendFeatureReport(1, new Uint8Array([0x77, 0x92, slotId, 0, 0])).catch(() => {})
      await sleep(50)
      setStatus(`Pushed ${active.length} filters to ${d.model} (slot ${slotId})`)
    } catch (e) {
      setStatus(`Fosi push failed: ${e.message}`)
    }
    setBusy(false)
  }

  const pullFosi = async () => {
    setStatus('Fosi pull: use Push only (pull not supported for Fosi)')
  }

  // WalkPlay push (CrinEar Protocol Max etc.)
  const pushWalkplay = async () => {
    const d = devRef.current
    setBusy(true)
    try {
      const device = d.rawDevice
      const mc = d.modelConfig
      const maxFilters = d.constraints?.maxFilters ?? mc.maxFilters ?? 8
      const active = filters.filter((f) => f.enabled !== false)
      const n = Math.min(active.length, maxFilters)
      const defaultSlot = mc.firstWritableEQSlot ?? 101

      for (let i = 0; i < n; i++) {
        const f = active[i]
        const bArr = computeIIRFilter(f.freq, f.gain, f.q)
        const packet = [
          WP.WRITE, WP.CMD.PEQ_VALUES, 0x18, 0x00, i, 0x00, 0x00,
          ...bArr,
          ...toLEBytes(Math.round(f.freq), 2),
          ...toLEBytes(Math.round(f.q * 256), 2),
          ...toLEBytes(Math.round(f.gain * 256), 2),
          WP_TYPE_NUM[f.type] ?? 2,
          0x00,
          mc.defaultIndex !== undefined ? mc.defaultIndex : defaultSlot,
          WP.END
        ]
        await sendReport(device, WP.REPORT_ID, packet)
        await sleep(20)
      }
      await sleep(100)

      // preamp via global gain register (only if device doesn't handle pregain itself)
      if (mc.deviceHandlesPregain === false) {
        const buffer = mc.globalGainBuffer ?? null
        const gainToWrite = buffer !== null ? Math.min(0, (preamp || 0) - buffer) : (preamp || 0)
        await sendReport(device, WP.REPORT_ID, [WP.WRITE, WP.CMD.GLOBAL_GAIN, 0x02, 0x00, Math.round(gainToWrite)])
        await sleep(50)
      }

      // commit sequence (WalkPlay app order)
      await sendReport(device, WP.REPORT_ID, [WP.WRITE, 0x05, WP.END])
      await sleep(20)
      await sendReport(device, WP.REPORT_ID, [WP.WRITE, 0x17, WP.END])
      await sleep(20)
      await sendReport(device, WP.REPORT_ID, [WP.WRITE, WP.CMD.TEMP_WRITE, 0x04, 0x00, 0x00, 0xff, 0xff, WP.END])
      await sleep(50)
      await sendReport(device, WP.REPORT_ID, [WP.WRITE, WP.CMD.FLASH_EQ, WP.END])

      setStatus(`Pushed ${n} filters to ${d.model} (SchemeNo${mc.schemeNo ?? '?'})`)
    } catch (e) {
      setStatus(`Push failed: ${e.message}`)
    }
    setBusy(false)
  }

  // WalkPlay pull
  const pullWalkplay = async () => {
    const d = devRef.current
    setBusy(true)
    try {
      const device = d.rawDevice
      const mc = d.modelConfig
      const maxFilters = d.constraints?.maxFilters ?? mc.maxFilters ?? 8
      const filtersOut = []

      device.oninputreport = (event) => {
        const data = new Uint8Array(event.data.buffer, event.data.byteOffset, event.data.byteLength)
        if (data[1] !== WP.CMD.PEQ_VALUES || data.length < 32) return
        const idx = data[4]
        const freq = data[27] | (data[28] << 8)
        const qRaw = data[29] | (data[30] << 8)
        const q = Math.round((qRaw / 256) * 100) / 100
        let gainRaw = data[31] | (data[32] << 8)
        if (gainRaw > 32767) gainRaw -= 65536
        const gain = Math.round((gainRaw / 256) * 100) / 100
        const type = WP_NUM_TYPE[data[33]] || 'PK'
        filtersOut[idx] = { type, freq, q, gain, enabled: !!(freq || q || gain) }
      }

      for (let i = 0; i < maxFilters; i++) {
        await sendReport(device, WP.REPORT_ID, [WP.READ, WP.CMD.PEQ_VALUES, 0x00, 0x00, i, WP.END])
        await sleep(50)
      }
      await sleep(1500)

      const got = filtersOut.filter(Boolean)
      if (got.length) {
        onFiltersFromDevice(got)
        setStatus(`Pulled ${got.length} filters from ${d.model}`)
      } else {
        setStatus('No filters received (timeout)')
      }
    } catch (e) {
      setStatus(`Pull failed: ${e.message}`)
    } finally {
      if (devRef.current?.rawDevice) devRef.current.rawDevice.oninputreport = wireListener
      setBusy(false)
    }
  }

  // JDS Labs Element IV serial protocol
  const pushJds = async () => {
    const d = devRef.current
    setBusy(true)
    try {
      const { writer } = d
      const active = filters.filter((f) => f.enabled !== false).slice(0, d.constraints?.maxFilters ?? 10)
      const n = active.length
      // Element IV: text protocol "SET PEQ i type freq gain q\n"
      let cmd = ''
      for (let i = 0; i < n; i++) {
        const f = active[i]
        cmd += `SET PEQ ${i} ${f.type} ${f.freq.toFixed(1)} ${f.gain.toFixed(1)} ${f.q.toFixed(3)}\n`
      }
      if (preamp) cmd += `SET PREGAIN ${preamp.toFixed(1)}\n`
      await writer.write(new TextEncoder().encode(cmd))
      setStatus(`Pushed ${n} filters to ${d.model}`)
    } catch (e) {
      setStatus(`Push failed: ${e.message}`)
    }
    setBusy(false)
  }

  const writableSlots = connected ? (devRef.current?.modelConfig?.availableSlots || []).filter((s) => s.id >= 0) : []

  return (
    <div className="devicepanel">
      <h3>Device PEQ</h3>
      {!connected && (
        <>
          <div className="row">
            <button className="primary" onClick={connectHid}>🔌 Connect USB (HID)</button>
            <button onClick={connectSerial}>Connect Serial</button>
          </div>
          <p className="hint">
            Supported: FiiO dongles (JA11, KA15/17, K17, BTR13), WalkPlay DSP cables (Moondrop/Tanchjim/KiwiEars), KT Micro, Fosi DS3, JDS Labs Element IV.
          </p>
        </>
      )}
      {connected && (
        <>
          <div className="device-pill">
            <span className="dot" />
            <span>{connected.name}</span>
            <span className="hint">· {connected.constraints?.maxFilters} bands · ±{connected.constraints?.maxGain}dB{connected.constraints?.supportsLS ? ' · LS/HS' : ''}</span>
            <button className="rm" onClick={disconnect} title="Disconnect">×</button>
          </div>
          {writableSlots.length > 0 && (
            <div className="row">
              <label>Slot:</label>
              <select value={slot} onChange={(e) => setSlot(+e.target.value)}>
                {writableSlots.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          )}
          <div className="row">
            <button className="primary" disabled={busy} onClick={push}>{busy ? '…' : '⬆ Push to device'}</button>
            <button disabled={busy} onClick={pull}>⬇ Pull from device</button>
          </div>
          <p className="hint">Push writes {Math.min(filters.filter((f) => f.enabled !== false).length, connected.constraints?.maxFilters ?? 10)} filters + pre-amp {(preamp || 0).toFixed(1)} dB to the device DSP.</p>

          {/* WalkPlay device extras: DAC filter, gain mode, work mode, mic gain, balance */}
          {devRef.current?.handler === 'walkplay' && (
            <>
              <DeviceInfoPanel device={devRef.current.rawDevice} handler={devRef.current.handler} model={devRef.current.model} />
              <WalkplayExtras device={devRef.current.rawDevice} onLog={setStatus} />
            </>
          )}
        </>
      )}
      {status && <p className="status">{status}</p>}
      {!connected && (
        <details>
          <summary style={{ cursor: 'pointer', color: '#8a8f98', fontSize: 11, marginTop: 8 }}>Diagnostics</summary>
          <p className="hint">
            WebHID: {typeof navigator.hid !== 'undefined' ? 'available ✓' : 'NOT AVAILABLE ✗'}
            <br />
            Web Serial: {typeof navigator.serial !== 'undefined' ? 'available ✓' : 'NOT AVAILABLE ✗'}
          </p>
          <button onClick={async () => {
            const devices = await navigator.hid.getDevices()
            setStatus(devices.length
              ? `Granted devices: ${devices.map((d) => `${d.productName || 'unnamed'} (VID 0x${d.vendorId.toString(16)} PID 0x${d.productId.toString(16)})`).join(' | ')}`
              : 'No previously granted devices. Click Connect and pick a device in the picker.')
          }}>List granted devices</button>
          <p className="hint">Tips: close other WalkPlay/VC apps using the dongle, try a different USB port.</p>
        </details>
      )}
    </div>
  )
}
