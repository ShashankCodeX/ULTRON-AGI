# ULTRON

ULTRON is my interactive AI-assistant project, combining a browser-based 3D interface, webcam hand-gesture controls, and a Gemini-powered voice and text assistant. I developed the web app with Next.js, React, Three.js, and MediaPipe, and connected it to an optional local Python assistant bridge.

![ULTRON orb interface](docs/screenshot.png)

## My work

I developed the assistant experience and the integration that brings its interface, gesture input, and AI actions together:

- **Hand-gesture interaction:** I implemented webcam hand tracking with MediaPipe for up to two hands. Pinching and moving one hand rotates the orb; pinching with both hands and spreading or closing them zooms. Hysteresis and smoothing make the controls less jittery, and tracking falls back from GPU to CPU when needed.
- **Assistant connection:** I connected the UI to Gemini for typed and recorded voice prompts, with spoken responses and a wake phrase in supported browsers.
- **Local agent integration:** I added an optional Python bridge that passes Gemini tool calls to desktop-assistant actions. The bridge runs locally; the web-only fallback can answer prompts but cannot execute desktop actions.
- **Interactive 3D experience:** I integrated the Three.js orb with mouse, touch, keyboard, and gesture controls, alongside the HUD and animated visual effects.
- **Privacy and safety details:** Webcam tracking is performed in the browser and does not send camera frames to the assistant API. Camera and microphone access are requested only when their respective features are used.

## How to use it

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

The desktop actions can control the computer running the bridge. Review their permissions before enabling the bridge, and run it locally rather than exposing it as a public service. Keep `.env.local`, `Mark-L-main/config/api_keys.json`, certificates, and personal memory files local; they are excluded from Git.

## Project files

- `app/` — Next.js page, layout, and assistant API route.
- `components/UltronOrb.tsx` — HUD, voice controls, and interaction wiring.
- `lib/orbScene.ts` — Three.js scene and mouse/touch controls.
- `lib/handTracker.ts` — webcam hand detection and gesture mapping.
- `Mark-L-main/` — Python assistant source and optional bridge.

## Inspiration and licenses

The visual UI is inspired by [Sagar Tamang's ULTRON Orb UI](https://sagartamang.com/projects/ultron).

The root [LICENSE](LICENSE) covers the MIT-licensed UI. The bundled `Mark-L-main/` source is by FatihMakes ([source](https://github.com/FatihMakes/Mark-LVI)) and is licensed under [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/), not the root MIT license; commercial use of that source is not permitted. Its attribution and license are also documented in [Mark-L-main/readme.md](Mark-L-main/readme.md).
