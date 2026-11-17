# Packaging *Syndicate Idle: Capo's Rise* for itch.io

This project builds into a **single, self-contained `dist/index.html`** with relative paths (`base: './'`) and all JS/CSS assets inlined via `vite-plugin-singlefile` — eliminating broken `/assets/...` 404 black screens inside itch.io's CDN subfolders.

---

## 3-Step Build & Zip Commands

Run these commands from the project root after pulling from GitHub:

```bash
# 1. Install dependencies
npm install

# 2. Build the self-contained single-file production bundle into dist/
npm run build

# 3. Zip the CONTENTS of dist/ (NOT the outer dist/ folder itself!)
cd dist && zip -r ../syndicate-idle-itchio.zip . && cd ..
```

> **Windows PowerShell alternative for Step 3:**
> ```powershell
> Compress-Archive -Path .\dist\* -DestinationPath .\syndicate-idle-itchio.zip -Force
> ```
> **Important:** Make sure `index.html` is at the **root** of the `.zip` archive (i.e. inside `syndicate-idle-itchio.zip`, you see `index.html` directly — not `dist/index.html`).

---

## Recommended itch.io Project Settings

When uploading `syndicate-idle-itchio.zip` on your itch.io Edit Game page:

1. **Kind of project:** `HTML`
2. **Upload file:** Check **"This file will be played in the browser"**
3. **Embed options -> Viewport dimensions:**
   - **Width:** `450` px
   - **Height:** `800` px
   - **Orientation:** Portrait (or Default)
4. **Frame options:**
   - Enable **"Mobile friendly"**
   - Enable **"Fullscreen button"** (the game locks to `100vw` × `100dvh` with responsive 9:16 framing)
   - Enable **"Automatically start on page load"** (optional; Web Audio unlocks safely on the player's first tap/click)
