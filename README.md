# ULTRON

ULTRON combines a browser-based 3D assistant interface, webcam hand-gesture controls, and a Gemini-powered voice and text assistant. The web app is built with Next.js, React, Three.js, and MediaPipe. An optional local Python bridge connects the interface to the desktop actions in `Mark-L-main`.

![ULTRON orb interface](docs/screenshot.png)

## What is included

### 3D assistant interface

- Animated Three.js orb with layered wireframe shells, a spiral core, orbiting details, floating code, dust, and scan rings.
- Bloom and chromatic-aberration post-processing with a full-screen HUD.
- Mouse and touch controls for rotating and zooming the scene.

### Hand-gesture controls

- MediaPipe HandLandmarker tracks up to two hands using the browser webcam.
- Pinch and move one hand to rotate the orb; pinch with both hands and spread or close them to zoom.
- Pinch hysteresis and motion smoothing help reduce tracking jitter.
- Tracking tries the GPU delegate first and falls back to CPU if the browser cannot initialize it.
- Camera access is only requested when gestures are enabled. Hand tracking runs in the browser; video frames are not sent to the assistant API.

### Voice, text, and assistant integration

- Send typed prompts or record a short voice prompt from the interface.
- Hear responses through browser speech synthesis; supported browsers can also listen for “Hi Ultron” or “Hey Ultron.”
- The `/api/ask` route first tries the optional local Python bridge. When configured, the bridge uses Gemini function calls to invoke available desktop-assistant actions.
- If the bridge is not configured or cannot be used, the route falls back to Gemini text/audio responses. That fallback does not perform the local desktop actions.

The optional desktop actions can interact with the computer running the bridge. Review the Python assistant's actions and permissions before enabling it, and run it locally rather than exposing it as a public service.

## Controls

| Input | Action |
| --- | --- |
| Drag | Rotate the orb |
| Scroll or pinch | Zoom in or out |
| Pinch one hand and move | Rotate the orb |
| Pinch both hands and spread or close | Zoom in or out |
| `G` | Toggle hand gestures |
| `R` | Reset the view |
| `+` / `-` | Zoom in or out |
| `V` | Start or stop voice recording |
| “Hi Ultron” / “Hey Ultron” | Wake phrase in supported browsers |

## Run the web app

Requirements: Node.js and npm.

```bash
npm install
cp .env.example .env.local
```

Set `GEMINI_API_KEY` in `.env.local`, then start the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Camera and microphone features require browser permission; camera access generally requires HTTPS outside localhost.

## Optional local Python bridge

The Python bridge is optional. To enable desktop actions:

1. Set up the Python environment and dependencies for `Mark-L-main` using its [setup instructions](Mark-L-main/readme.md).
2. Provide the local Python executable, the directory containing `main.py`, and the path to `ultron_bridge.py` through `MARK_L_PYTHON`, `MARK_L_ROOT`, and `MARK_L_BRIDGE` in `.env.local`.
3. Configure the Gemini key for the Python assistant using its local configuration instructions.

Keep `.env.local`, `Mark-L-main/config/api_keys.json`, certificates, and personal memory files local. They are excluded from Git.

## Project files

- `app/` — Next.js page, layout, and assistant API route.
- `components/UltronOrb.tsx` — HUD, voice controls, and interaction wiring.
- `lib/orbScene.ts` — Three.js scene and mouse/touch controls.
- `lib/handTracker.ts` — webcam hand detection and gesture mapping.
- `Mark-L-main/` — Python assistant source and optional bridge.

## Credits and licenses

The orb interface is based on the ULTRON Orb UI by [Sagar Tamang](https://sagartamang.com/projects/ultron), licensed under MIT; see [LICENSE](LICENSE).

The `Mark-L-main/` assistant source is by [FatihMakes](https://github.com/FatihMakes/Mark-LVI) and is licensed under [Creative Commons Attribution-NonCommercial 4.0 International](https://creativecommons.org/licenses/by-nc/4.0/). It is not covered by the root MIT license. See [Mark-L-main/readme.md](Mark-L-main/readme.md) for its attribution and license details. Commercial use of that source is not permitted by its license.
