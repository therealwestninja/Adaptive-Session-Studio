# Legal

---

## License

Adaptive Session Studio is released under the **MIT License**.

```
MIT License

Copyright (c) 2026 Adaptive Session Studio Contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## Disclaimer

**This software is provided for personal, educational, and creative use.**

The developers of Adaptive Session Studio:

- Make no warranty, express or implied, regarding the safety, suitability, or fitness of this software for any particular purpose.
- Accept no liability for any physical, psychological, financial, legal, or other harm arising from the use or misuse of this software or any sessions created with it.
- Do not endorse, produce, or distribute any specific session content.
- Are not responsible for the actions of third parties who use, modify, or distribute this software.

**You use this software entirely at your own risk.** Read [SAFETY.md](SAFETY.md) before using device integration features.

---

## Content Responsibility

Session content created with this tool — including text, audio, video, subtitle files, and FunScript files — is the sole responsibility of its creator. The developers of this software:

- Do not review, moderate, or endorse any session content.
- Are not responsible for content shared between users.
- Strongly encourage creators to obtain clear, ongoing, informed consent from any person who will experience a conditioning session.

### Age Restriction

This software may be used to create content intended for adults. It is the responsibility of the user to:

- Ensure that any content involving adult themes is only used by and shared with adults (18+ or the age of majority in their jurisdiction).
- Not use this software to create or distribute content that exploits, harms, or targets minors in any way.

---

## Third-Party Software and Standards

### Buttplug.io / Intiface

Adaptive Session Studio communicates with haptic devices using the [Buttplug.io](https://buttplug.io/) protocol via [Intiface Central](https://intiface.com/central/). Buttplug.io is an open-source project maintained by Nonpolynomial Labs, LLC.

- Buttplug.io is licensed under the BSD 3-Clause License.
- This software does not include or redistribute any Buttplug.io code; it communicates with Intiface Central via its published WebSocket API.
- Device compatibility and behaviour is the responsibility of the device manufacturer and Intiface Central.

### FunScript Format

The `.funscript` file format is an open community standard. This software implements the FunScript format for import and export.

- FunScript is not a trademarked or proprietary format.
- This implementation is based on the community specification at [FunScript.info](https://funscript.io/).

### Advanced SubStation Alpha (.ass)

The `.ass` subtitle format is an open community standard originating from the SubStation Alpha project.

- This software implements a subset of the ASS format for import, display, and export.
- No proprietary ASS rendering libraries are included.

### Google Fonts

This software loads the **Syne** and **Inter** typefaces from Google Fonts via the Google Fonts CDN (`fonts.googleapis.com`) when an internet connection is available.

- Syne is designed by Bonjour Monde, licensed under the SIL Open Font License (OFL).
- Inter is designed by Rasmus Andersson, licensed under the SIL Open Font License (OFL).
- When the app is used offline, system fonts are used as fallback. No font data is embedded in the application.

### Web APIs

This software uses the following browser-native APIs:

- **Web Speech API** (TTS) — browser built-in, no third-party library
- **FaceDetector API** — browser built-in (Chrome/Edge), experimental
- **MediaDevices API** (getUserMedia) — browser built-in
- **Web Storage API** (localStorage) — browser built-in
- **requestAnimationFrame** — browser built-in
- **WebSocket API** — browser built-in
- **Canvas 2D API** — browser built-in
- **File API / FileReader** — browser built-in
- **Fullscreen API** — browser built-in

No analytics, tracking, telemetry, or advertising SDKs are included or used.

---

## Privacy

This software collects no user data. It has no telemetry, analytics, or reporting. Specifically:

- **Sessions** are stored only in your browser's localStorage and in `.assp` files you export explicitly.
- **Webcam data** is processed locally in your browser using the browser's FaceDetector API. No video, images, or tracking data are transmitted over the network.
- **Device commands** are sent only to a local WebSocket connection (Intiface Central on your own machine). No device data leaves your computer.
- **No cookies, beacons, fingerprinting, or third-party tracking** of any kind.

The only network request this software makes is to `fonts.googleapis.com` and `fonts.gstatic.com` to load web fonts, and only if you have an internet connection. You can eliminate even this by hosting the fonts locally and updating the `<link>` tag in `index.html`.

---

## Export Controls

This software is general-purpose creative/authoring software with no cryptographic functionality beyond standard browser TLS (used only for the Google Fonts request). No special export control restrictions apply.

---

## Trademarks

"Adaptive Session Studio" is the name of this project. No trademark claim is made. If you fork and redistribute a modified version, please use a distinct name to avoid confusion.

All device brand names, software names, and format names mentioned in this documentation are the property of their respective owners. Their mention does not imply endorsement.
