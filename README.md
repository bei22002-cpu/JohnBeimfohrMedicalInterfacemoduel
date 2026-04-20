# JohnBeimfohrMedicalInterfacemoduel

Interactive cardiology exam-room visualization (Vite + React + Three.js) with an optional imaging pipeline and a bundled, offline demo flow.

## Quick start (demo)

```bash
npm install
npm run dev
```

Then open the local URL Vite prints. On first launch you’ll see a **Demo tour** modal:
- **Launch demo** loads a bundled encounter mesh (offline; no network) and a “Normal cycle” scene
- Use the preset buttons to jump to LAD stenosis / PCI / TAVR scenes

## What to click

- **Demo GLB**: loads the bundled offline encounter mesh layer
- **More controls**: shows quick scene presets + typed commands
- **Reset view**: re-frames the camera
- **Labels**: toggles 3D captions

## Optional: full stack

There are additional services under `services/` and an example compose file:

```bash
npm run stack:up
```

## Workspace bundles

Two folders are vendored into this repo under `workspace/` for convenience:
- `workspace/Task02_Heart/` (dataset)
- `workspace/Claude Heart thin/` (thin imaging/mesh service slice)

