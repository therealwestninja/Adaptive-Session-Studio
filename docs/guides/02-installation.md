# 02 — Installation

Adaptive Session Studio is a static web app — a folder of HTML, CSS, and JavaScript files. It needs a local HTTP server to run. This guide covers three methods from simplest to most configurable.

---

## Requirements

- **Windows, macOS, or Linux**
- **Chrome, Edge, Firefox, or Safari** (Chrome/Edge recommended for full feature support)
- One of the server options below

**Optional (for haptic device control):**
- [Intiface Central](https://intiface.com/central/) — free, required for any device

---

## Method A: Node.js one-liner (easiest, no install)

If you have Node.js installed:

```bash
cd adaptive-session-studio
npx serve .
```

Open `http://localhost:3000` in your browser.

That's it. `npx serve` downloads and runs a temporary server without installing anything permanently.

---

## Method B: Python (if you have Python installed)

```bash
cd adaptive-session-studio

# Python 3
python3 -m http.server 8080

# Python 2 (older systems)
python -m SimpleHTTPServer 8080
```

Open `http://localhost:8080`.

---

## Method C: Apache (Windows, permanent setup)

This is the method in the original install instructions for users who want a persistent setup.

1. Download and install [Apache HTTP Server 2.4](https://httpd.apache.org/download.cgi)
2. Unzip the Adaptive Session Studio folder into `C:\Apache24\htdocs\`
3. Replace `C:\Apache24\htdocs\index.html` with the app's `index.html`
4. Start Apache:
   ```
   cd C:\Apache24\bin
   httpd -k start
   ```
5. Open `http://localhost` in your browser

**To stop Apache when you're done:**
```
cd C:\Apache24\bin
httpd -k stop
```

> Apache is not installed as a service in this setup — you must start and stop it manually each time.

---

## Method D: VS Code Live Server

If you use Visual Studio Code, install the **Live Server** extension, right-click `index.html`, and choose **Open with Live Server**.

---

## Browser compatibility

| Feature | Chrome/Edge | Firefox | Safari |
|---------|-------------|---------|--------|
| Core playback | ✅ Full | ✅ Full | ✅ Full |
| Text-to-speech | ✅ Full | ✅ Full | ✅ Full |
| Webcam tracking | ✅ Full | ✅ Full | ⚠ Limited |
| Haptic (WebSocket) | ✅ Full | ✅ Full | ✅ Full |
| IndexedDB storage | ✅ Full | ✅ Full | ✅ Full |

**Chrome or Edge is strongly recommended.** The FaceDetector API (used for attention tracking) is Chrome/Edge only.

---

## First launch

When you open the app for the first time you'll see the **onboarding tutorial** — a guided walkthrough of the interface. Go through it or skip it. You can replay it any time from **Settings → System → Restart Tutorial**.

---

## Setting up Intiface Central (optional)

Intiface Central is a free app that acts as a bridge between the browser and your device.

1. Download from [intiface.com/central](https://intiface.com/central/)
2. Install and open it
3. Click **Start Server** — it runs on `ws://localhost:12345` by default
4. In Adaptive Session Studio, open **Settings → FunScript** and verify the WebSocket address matches
5. Connect your device in Intiface Central before pressing play

The device icon in the app toolbar shows the connection status.

---

## Next step

→ [03 — Your First Session](03-first-session.md)
