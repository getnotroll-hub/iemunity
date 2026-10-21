# 🚀 RELEASE GUIDE — IEMunity v1.1.0

> Complete guide to release IEMunity on GitHub — from zero to a downloadable app for the world.

---

## 📋 WHAT YOU NEED

Before starting, make sure you have:

1. **GitHub account** — sign up free at [github.com](https://github.com) if you don't have one
2. **Git installed** — download from [git-scm.com](https://git-scm.com) (Next → Next → Finish)
3. **IEMunity build ready** — already in your folder:
   - `dist\IEMunity Setup 1.1.0.exe` (79 MB — installer)
   - `dist\IEMunity-Portable-1.1.0.zip` (112 MB — portable)

Check git is installed — open PowerShell and type:
```powershell
git --version
```
If you see a version number (like `git version 2.xx`), you're ready.

---

## PART 1 — CREATE GITHUB REPOSITORY (3 minutes)

1. Go to **github.com** → log in
2. Click the **`+`** icon (top right) → **New repository**
3. Fill in:

   | Field | Value |
   |---|---|
   | Repository name | `iemunity` |
   | Description | `IEMunity — Frequency response comparison & device PEQ tool for IEMs. 10,000+ measurements, AutoEQ, hardware DSP control.` |
   | Visibility | ⚫ **Public** (required for free releases) |

4. **DO NOT** tick any checkboxes (Add README / .gitignore / license) — we already have all these files
5. Click the green **Create repository** button
6. GitHub will show a page with instructions — **ignore it for now**, use the steps below

---

## PART 2 — VERIFY AUTO-UPDATE CONFIG (1 minute)

IEMunity has an **auto-update** feature — it checks GitHub Releases for new versions. Verify it's configured with your username:

1. Open `package.json` in Notepad/VS Code
2. Find this section (~line 28-34):

```json
"publish": [
  {
    "provider": "github",
    "owner": "getnotroll-hub",
    "repo": "iemunity"
  }
],
```

3. Make sure `"owner"` matches your GitHub username. If your username is different, change it.

> Without this, the app still works 100% — auto-update just can't find new versions. You can fix it anytime later.

---

## PART 3 — PUSH CODE TO GITHUB (5 minutes)

Open **PowerShell** (Start → type "powershell") and run these commands one by one:

```powershell
# 1. Go to project folder
cd C:\Users\nashr\Desktop\AUDIOPHILE

# 2. Initialize git repository
git init

# 3. Add all files (node_modules & dist are auto-excluded by .gitignore)
git add .

# 4. Commit with message
git commit -m "IEMunity v1.1.0 — Initial release

- 10,000+ IEM/headphone measurements from 30+ sources
- AutoEQ with hearing-aware weighting
- Device PEQ: Protocol Max, FiiO, WalkPlay, KT Micro, Moondrop, Fosi
- Interactive EQ nodes, A/B compare, crossover sim, hearing test
- Session auto-restore, workspace presets, share links, themes"

# 5. Set branch name
git branch -M main

# 6. Connect to your GitHub repo
git remote add origin https://github.com/getnotroll-hub/iemunity.git

# 7. Upload!
git push -u origin main
```

> **If the remote URL doesn't match your username**, replace `getnotroll-hub` with your actual GitHub username in step 6!

**If git asks you to log in:** a GitHub authentication window will pop up — sign in with your GitHub account. Only once, it remembers.

**If you see warnings about LF/CRLF** — ignore them, they're harmless.

---

## PART 4 — UPLOAD RELEASE FILES (5 minutes)

Now your code is on GitHub, but users can't download the exe yet. You need to upload it as a **Release**:

1. Go to your repo: `github.com/getnotroll-hub/iemunity`
2. Click the **Releases** tab (right side of the page, below About)
3. Click **"Create a new release"** (or "Draft a new release")
4. **Tag:**
   - Click **Choose a tag**
   - Type `v1.1.0`
   - Click **"+ Create new tag on publish"**
5. **Release title:** `IEMunity v1.1.0 — Initial Release 🎧`
6. **Description** (copy-paste this):

```markdown
First public release of IEMunity! 🎧

## ✨ What's inside
- 📊 **10,000+ measurements** from 30+ sources (Crinacle, Super Review, oratory1990, squig.link sites & more)
- ⚡ **One-click AutoEQ** — Harman targets, sound signatures, or EQ toward any IEM
- 🔌 **Device PEQ** — write EQ directly to DSP dongles (CrinEar Protocol Max, FiiO, WalkPlay, KT Micro, Moondrop, Fosi)
- 🎚 **Interactive EQ** — drag filter nodes on the graph, real-time A/B compare
- 👂 **Hearing-aware EQ** — weight AutoEQ by your hearing profile
- 🔀 Crossover simulator, blind A/B test, amp calculator
- 💾 Workspace presets, share links, offline mode, auto-update

## 📥 Download
| File | For |
|---|---|
| **IEMunity-Setup-1.1.0.exe** | Install (recommended) |
| **IEMunity-Portable-1.1.0.zip** | No install needed |

## ⚠ First run
Windows SmartScreen may warn "unknown publisher" (no code-signing cert).
Click **More info → Run anyway**.

## 📊 Data credits
Measurements from Crinacle, AutoEq (Jaakko Pasanen), squig.link partners.
Device protocols from Pragmatic Audio devicePEQ. See README for full credits.
```

7. **Attach files** — drag & drop both files into the "Attach binaries" box:
   - `dist\IEMunity Setup 1.1.0.exe`
   - `dist\IEMunity-Portable-1.1.0.zip`
   
   (You can rename to `IEMunity-Setup-1.1.0.exe` for cleaner URLs)

8. Click **Publish release**

---

## 🎉 DONE! — WHAT YOU HAVE NOW

✅ Public repo: `github.com/getnotroll-hub/iemunity`
✅ Complete source code with professional README
✅ Release v1.1.0 with installer + portable that anyone can download
✅ Auto-update working (users get notified when you release a new version)

**Your share link:** `github.com/getnotroll-hub/iemunity/releases`

---

## 🔄 FUTURE — RELEASE A NEW VERSION

When you want to update the app (bug fixes / new features):

```powershell
# 1. Change version in package.json (e.g. "1.2.0")
# 2. Build & auto-publish in ONE command:
npx electron-builder --win nsis --publish always
```

This auto-creates a new Release with the installer — all existing users get an update notification **inside the app**!

> `--publish always` needs GitHub login once: run `npx gh auth login` and follow the prompts.

---

## ❓ TROUBLESHOOTING

| Problem | Solution |
|---|---|
| `git push` failed — authentication | Run `npx gh auth login` or use GitHub Desktop app |
| `git push` rejected — fetch first | Run `git pull origin main --allow-unrelated-histories` then push again |
| Repo looks empty after push | Refresh browser — sometimes slow |
| Release file doesn't appear | Files > 2GB not allowed. Ours are ~100MB, safe |
| Users report SmartScreen | Normal — no cert. Tell them "More info → Run anyway" |
| Auto-update finds nothing | Check `owner`/`repo` in package.json matches your username + Release is Published (not Draft) |
| Icon still shows Electron | Delete old shortcuts + clear icon cache: `taskkill /f /im explorer.exe; del $env:LOCALAPPDATA\IconCache.db; start explorer.exe` |

---

## ✅ FINAL CHECKLIST

Before announcing to the world:

- [ ] `owner` in package.json matches your GitHub username
- [ ] Remote URL in git commands matches your username
- [ ] Repo visibility = **Public**
- [ ] Release = **Published** (not Draft)
- [ ] Test download installer from Release page using another browser/incognito
- [ ] Test install on another PC

From here to release is only **~15 minutes**. Stuck on any step? Just ask! 🚀
