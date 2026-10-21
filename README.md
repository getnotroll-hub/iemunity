# 🎧 IEMunity

Frequency response comparison & hardware PEQ tool for IEMs and headphones — built with Electron + React. **Community-powered by IEMunity.**

Compare **10,000+ measurements** from the world's largest public databases, generate AutoEQ in one click, and write EQ directly to DSP dongles like the **CrinEar Protocol Max**.

![Version](https://img.shields.io/badge/version-1.1.0-blue) ![Platform](https://img.shields.io/badge/platform-Windows-lightgrey) ![License](https://img.shields.io/badge/license-MIT-green)

---

## ✨ Features

### 📊 Graph & Analysis
- **10,000+ measurements** from 30+ sources — Crinacle (711 + 5128 rigs), Super Review, oratory1990, squig.link partner sites (aftersound, precog, pw, kazi, rg, bedrock), Innerfidelity, Rtings, and more
- Multi-curve overlay (up to 10) with log-frequency axis, zoom/pan, crosshair inspector
- Frequency band labels (Sub-Bass → Air), A−B diff curves, unit variance bands
- Preference scoring vs target, comparison tables, RMS deviation stats
- Sound signatures (Warm, V-Shape, Basshead, Vocal Forward...) as AutoEQ targets
- Find Similar IEMs — scan the database for the closest FR match
- Blind A/B test mode — compare without visual bias

### ⚡ EQ System
- **One-click AutoEQ** toward any target: Harman presets, IEMs on your graph, sound signatures, custom targets
- **Hearing-aware AutoEQ** — weight EQ effort by your hearing test results
- Interactive EQ nodes — drag filter points directly on the graph
- Pre-amp auto-calculation, headroom warnings for device limits
- Real-time A/B comparison during playback (pink noise, tones, sweeps, audio files)
- Universal EQ export/import (`.parametric` — works with squig.link, AutoEq, Wavelet, Peace)

### 🔌 Device PEQ (Hardware DSP Control)
Write parametric EQ directly to USB dongles via WebHID:

| Brand | Devices |
|---|---|
| **CrinEar** | Protocol Max |
| **WalkPlay DSP** | Moondrop Chu II/Quark2 DSP, Tanchjim Stargate/One/Bunny DSP, KiwiEars, TRUTHEAR KEYX, ddHiFi, and more |
| **FiiO / JadeAudio** | JA11, KA15, KA17, K17, BTR13, QX13 |
| **KT Micro** | Moondrop CDSP, KiwiEars Allegro, Tanchjim DSP |
| **Moondrop** | Rays, Marigold, FreeDSP, Moonriver 3, DAWN PRO2 |
| **Fosi Audio** | DS3 |
| **JDS Labs** | Element IV (serial) |

Device extras: DAC filter selection, gain mode, work mode, mic gain, L/R balance.

### 🛠 Tools
- **Crossover simulator** — blend sub-bass from one IEM with another's tuning
- **Hearing test** — find your thresholds, save profile for EQ weighting
- **Amp power calculator** — with IEM spec lookup for popular models
- Unit variance compare — see how much units of the same IEM differ

### 💾 Convenience
- Session auto-restore, workspace presets, EQ presets per IEM
- My Collection (your IEMs + notes), favorites, recents
- Share links — full curve + EQ state in one base64 string
- Light/dark themes + accent colors, resizable sidebar
- Offline mode — database caches locally after first run
- Auto-update via GitHub Releases

---

## 📥 Download

Go to [**Releases**](../../releases) and grab:

- **`IEMunity Setup 1.1.0.exe`** — installer (recommended)
- **`IEMunity-Portable-1.1.0.zip`** — portable, no install needed

> ⚠ Windows SmartScreen may warn "unknown publisher" (no code-signing cert). Click **More info → Run anyway**.

---

## 🚀 Quick Start

### 1. Compare IEMs
1. Open the **Database** tab, search any IEM (e.g. "Tangzu Wan'er")
2. Click models to add them to the graph
3. Toggle **Norm @ 1000Hz** to align curves and compare

### 2. AutoEQ your IEM
1. Select your IEM as **EQ applies to** (auto-selected if only one curve)
2. In the **EQ** tab, choose a target:
   - Another IEM on your graph ("EQ toward this IEM")
   - Harman in-ear 2019 (match your measurement's rig!)
   - A sound signature
3. Click **⚡ AutoEQ** — filters + pre-amp are generated
4. Fine-tune by **dragging the yellow EQ nodes** on the graph
5. Press **▶ Play** (pink noise) and use **A/B compare** to hear the difference

### 3. Push EQ to your dongle
1. Connect your dongle (e.g. Protocol Max), go to **Device** tab
2. Click **🔌 Connect USB (HID)** and pick your device
3. **⬆ Push to device** — EQ now runs on the hardware DSP
4. Works on phone/PC/tablet — anything the dongle is plugged into

---

## ⌨ Keyboard Shortcuts

| Key | Action |
|---|---|
| `S` / `Ctrl+S` | Screenshot PNG |
| `D` | Toggle A−B diff |
| `L` | Toggle curve labels |
| `I` | Toggle inspector |
| `U` | Toggle unit variance |
| `H` | Hide last curve |
| `+` / `-` | Zoom in / out |

---

## 📊 Data Sources & Credits

This tool fetches measurement data on-demand from publicly available sources. All measurement data belongs to its respective owners:

- **Crinacle** measurements — [crinacle.com](https://crinacle.com)
- **AutoEq database** by Jaakko Pasanen — [github.com/jaakkopasanen/AutoEq](https://github.com/jaakkopasanen/AutoEq) (Super Review, oratory1990, Kazi, Fahryst, Filk, Harpo, HypetheSonics, kr0mka, Jaytiss, RikudouGoku, Ted's Squig Hoard, ToneDeafMonk, DHRME, and more)
- **squig.link partner sites** — aftersound, precog, pw, kazi, rg, bedrock
- **Device PEQ protocols** — based on the open-source [devicePEQ plugin by Pragmatic Audio](https://eq.hangout.audio) (used at eq.hangout.audio)
- Graph tool inspiration — [graph.hangout.audio](https://graph.hangout.audio), [squig.link](https://squig.link), [CrinGraph by mlochbaum](https://github.com/mlochbaum/CrinGraph)

**Note:** Crinacle headphone (GRAS/EARS) data requires a premium subscription and is intentionally not included.

---

## ⚠ Disclaimer

This tool is for educational and personal use. EQ adjustments affect perceived sound only and cannot "fix" hearing loss — consult an audiologist for hearing concerns. Device PEQ writing is done at your own risk; the authors are not responsible for device damage.

---

## 🛠 Development

```bash
npm install
npm run dev      # development with hot reload
npm run build    # production build
npm run dist     # build installer (.exe)
```

**Stack:** Electron 33 · React 18 · Vite · WebHID / Web Serial · Web Audio API

---

## 📄 License

MIT — see [LICENSE](LICENSE)
