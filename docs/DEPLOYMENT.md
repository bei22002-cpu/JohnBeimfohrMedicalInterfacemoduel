# Exam-room deployment (HIPAA-oriented)

This document describes how the **software spine** maps to a **clinic-grade** deployment. It is operational guidance, not legal advice. Engage privacy/security counsel and sign **Business Associate Agreements (BAAs)** with every subprocessors that handle PHI or voice audio.

## Architecture (reference)

- **Wall client**: static web app (Vite build) served over **TLS 1.2+** behind nginx.
- **Fleet control-plane** (`services/fleet-api`): device registration, heartbeat, **audit JSONL**, optional **Azure Speech** medical ASR proxy.
- **Same-origin** routing: nginx proxies `/fleet/` → fleet-api so the browser does not need CORS for PHI-adjacent calls.

## HIPAA-aligned controls (checklist)

1. **Encryption in transit**: TLS everywhere; no mixed content.
2. **Minimum necessary**: default UI stores **no PHI**; fleet audit logs **hashed command fingerprints** + timing metadata only—no PHI in sample payloads.
3. **Voice (medical ASR)**: audio is sent to **server-side** Azure Speech; **do not** log raw audio or transcripts in production logging (`HIPAA_MINIMAL_LOGGING=1`).
4. **BAA**: execute **Azure HIPAA** / **Microsoft BAA** for the region/account where Speech runs; restrict keys via **Azure RBAC**.
5. **Session isolation**: ephemeral `sessionStorage` device id; no patient identifiers in demo flows.
6. **Audit**: append-only JSONL under `DATA_DIR` (mount encrypted volume in production); ship to SIEM (Splunk/Azure Monitor) with retention policy.
7. **Fleet / MDM**: lock devices via **Intune** or vendor MDM; kiosk Edge profile; **wired Ethernet** preferred.

## Medical-grade 3D assets

- Licensed **GLB/GLTF** meshes with **ontology node IDs** (`content/asset-manifest.schema.json`).
- **Version pin** `CONTENT_VERSION` in fleet and `VITE_CONTENT_VERSION` in web build so every room runs the same signed-off content.
- **CI**: validate SHA-256 of shipped meshes against manifest before release.

## Medical ASR (Azure Speech)

1. Create **Azure Speech** resource in a **HIPAA-eligible** configuration.
2. Set `AZURE_SPEECH_KEY` and `AZURE_SPEECH_REGION` on the fleet container.
3. Build web with `VITE_USE_MEDICAL_ASR=1` and `VITE_FLEET_API_URL=/fleet` (same-origin proxy).
4. Extend `services/fleet-api/src/asr/azureSpeech.ts` with **PhraseListGrammar** for cardiology vocabulary (LAD, TAVR, etc.).

## Fleet / MDM

- **Heartbeat**: client posts every 60s (GPU/mic flags stubbed—extend with real checks).
- **MDM**: see `mdm/windows-edge-kiosk-sample.json` for kiosk direction; enforce **USB**, **patching**, and **remote wipe** per policy.

## Docker (local stack)

From `infra/`:

```bash
docker compose up --build
```

- Web: `http://localhost:8080`
- Fleet: `http://localhost:3001` (proxied at `/fleet/` from web)

**Azure keys** must be supplied for ASR; otherwise `/v1/asr/transcribe` returns `503 ASR_NOT_CONFIGURED`.

## Latency validation

- Clinician mode shows **parse** and **frame** budgets vs. targets in `src/telemetry/latency.ts`.
- Extend with GPU frame time and render benchmark in heartbeat payload.
