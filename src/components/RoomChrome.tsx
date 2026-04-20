import { useState } from "react";
import { useSession, type PresetKey } from "../state/sessionStore";
import { useVoiceCommand } from "../hooks/useVoiceCommand";
import { useMedicalHoldToRecord } from "../hooks/useMedicalHoldToRecord";
import { runtime } from "../config/runtime";
import { BUDGET_MS } from "../telemetry/latency";

const PRESETS: { key: PresetKey; label: string }[] = [
  { key: "normal", label: "Normal heart" },
  { key: "lad_stenosis", label: "LAD stenosis" },
  { key: "pci", label: "PCI / stent" },
  { key: "as_tavr", label: "AS + TAVR" },
  { key: "mr", label: "Mitral regurg" },
  { key: "hcm", label: "HCM" },
  { key: "afib", label: "AFib concept" },
  { key: "devices", label: "CRT / device" },
];

export function RoomChrome({ onOpenImaging }: { onOpenImaging?: () => void }) {
  const { state, dispatch, submitText } = useSession();
  const [input, setInput] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const listening = state.listening;

  const medical = runtime.useMedicalAsr && !!runtime.fleetApiUrl;

  const { supported, error, start, stop } = useVoiceCommand(
    (text) => {
      submitText(text);
      dispatch({ type: "SET_LISTENING", listening: false });
    },
    listening && !medical,
  );

  const med = useMedicalHoldToRecord({
    enabled: listening && medical,
    onText: (text) => {
      submitText(text);
      dispatch({ type: "SET_LISTENING", listening: false });
    },
  });

  const onPointerDownSpeak = () => {
    dispatch({ type: "SET_LISTENING", listening: true });
    if (medical) void med.start();
    else start();
  };

  const onPointerUpSpeak = () => {
    if (medical) med.stop();
    else stop();
    dispatch({ type: "SET_LISTENING", listening: false });
  };

  const speakSupported = medical ? med.supported : supported;
  const speakError = medical ? med.error : error;

  const latencyHint =
    state.audience === "clinician_detail" && (state.parseLatencyMs != null || state.frameLatencyMs != null)
      ? ` · Parse ${state.parseLatencyMs?.toFixed(0) ?? "—"} ms · Frame ${state.frameLatencyMs?.toFixed(0) ?? "—"} ms (budget local <${BUDGET_MS.localCommand} ms)`
      : "";
  const pickHint = state.selectedId
    ? ` · Selected: ${state.selectedId}`
    : state.hoveredId
      ? ` · Hover: ${state.hoveredId}`
      : "";

  return (
    <div className="chrome">
      <header className="chrome-top">
        <span className="badge">Educational visualization</span>
        <span className="subtle">Not for diagnosis · illustrative anatomy</span>
        {medical && <span className="badge fleet">Medical ASR path (fleet)</span>}
        {runtime.fleetApiUrl && !medical && <span className="badge fleet">Fleet linked</span>}
      </header>

      <footer className="chrome-bottom">
        <div className="status-row">
          <span className="status-dot" data-on={listening || undefined} title={listening ? "Listening" : "Idle"} />
          <span className="status-text">
            {state.statusLine}
            {latencyHint}
            {pickHint}
          </span>
        </div>

        <div className="controls">
          <div className="control-group" role="group" aria-label="Start and reset">
            <button
              type="button"
              className="btn primary"
              onClick={() => {
                dispatch({ type: "RESET" });
                dispatch({ type: "LOAD_DEMO_ENCOUNTER_MESH" });
                dispatch({ type: "PRESET", key: "normal" });
              }}
              title="Start the offline demo: loads bundled encounter mesh and a normal cycle scene"
            >
              Start demo
            </button>

            <button type="button" className="btn" onClick={() => dispatch({ type: "RESET" })} title="Reset session state and scene">
              Reset
            </button>

            <button
              type="button"
              className={`btn ${state.showEncounterMesh ? "active" : ""}`}
              onClick={() => dispatch({ type: "SET_SHOW_ENCOUNTER_MESH", show: !state.showEncounterMesh })}
              disabled={!state.encounterMeshUrl}
              title={state.encounterMeshUrl ? "Toggle encounter mesh layer" : "No encounter mesh loaded"}
            >
              Encounter layer
            </button>

            <button
              type="button"
              className="btn"
              onClick={() => dispatch({ type: "CLEAR_ENCOUNTER_MESH" })}
              disabled={!state.encounterMeshUrl}
              title="Clear encounter mesh from this session"
            >
              Clear encounter
            </button>

            <button
              type="button"
              className="btn"
              onClick={() => dispatch({ type: "LOAD_DEMO_ENCOUNTER_MESH" })}
              title="Load bundled offline demo mesh (no DICOM or network)"
            >
              Load demo mesh
            </button>

            <button
              type="button"
              className="btn"
              onClick={() => onOpenImaging?.()}
              title="Upload a DICOM zip to build an encounter mesh (requires imaging service)"
            >
              Build from DICOM
            </button>
          </div>

          <div className="control-group" role="group" aria-label="Explain and annotate">
            <button
              type="button"
              className={`btn ${state.frozen ? "active" : ""}`}
              onClick={() => dispatch({ type: "SET_FROZEN", frozen: !state.frozen })}
              title={state.frozen ? "Unfreeze animations" : "Freeze animations (recommended before drawing)"}
            >
              {state.frozen ? "Unfreeze" : "Freeze"}
            </button>

            <button
              type="button"
              className={`btn ${state.drawMode ? "active" : ""}`}
              onClick={() => dispatch({ type: "SET_DRAW_MODE", drawMode: !state.drawMode })}
              disabled={!state.frozen}
              title={state.frozen ? "Toggle drawing mode" : "Freeze first to draw"}
            >
              Draw
            </button>

            <button
              type="button"
              className="btn"
              onClick={() => dispatch({ type: "CLEAR_DRAWINGS" })}
              disabled={!state.frozen}
              title="Clear drawings"
            >
              Clear ink
            </button>

            <button
              type="button"
              className="btn primary"
              onPointerDown={onPointerDownSpeak}
              onPointerUp={onPointerUpSpeak}
              onPointerLeave={onPointerUpSpeak}
              disabled={!speakSupported}
              title={
                medical
                  ? "Hold — record clip, server ASR (Azure). Requires mic + fleet + keys."
                  : speakSupported
                    ? "Hold to speak (browser engine)"
                    : "Use typed command"
              }
            >
              {medical ? "Hold — medical ASR" : "Hold to speak"}
            </button>
          </div>

          <div className="control-group" role="group" aria-label="Narration mode">
            <button
              type="button"
              className={`btn ${state.audience === "patient_friendly" ? "active" : ""}`}
              onClick={() => dispatch({ type: "SET_AUDIENCE", audience: "patient_friendly" })}
            >
              Patient mode
            </button>
            <button
              type="button"
              className={`btn ${state.audience === "clinician_detail" ? "active" : ""}`}
              onClick={() => dispatch({ type: "SET_AUDIENCE", audience: "clinician_detail" })}
            >
              Clinician mode
            </button>
          </div>
        </div>

        <button
          type="button"
          className="btn chrome-advanced-toggle"
          aria-expanded={advancedOpen}
          onClick={() => setAdvancedOpen((o) => !o)}
        >
          {advancedOpen ? "Fewer controls" : "More controls"}
        </button>

        <div className={`chrome-advanced ${advancedOpen ? "chrome-advanced--open" : ""}`}>
          <div className="presets" role="toolbar" aria-label="Quick scenes">
            {PRESETS.map(({ key, label }) => (
              <button key={key} type="button" className="preset" onClick={() => dispatch({ type: "PRESET", key })}>
                {label}
              </button>
            ))}
          </div>

          <form
            className="text-cmd"
            onSubmit={(e) => {
              e.preventDefault();
              submitText(input);
              setInput("");
            }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder='Try: "Show LAD with 80% stenosis" or "Severe aortic stenosis with TAVR"'
              aria-label="Typed command"
            />
            <button type="submit" className="btn">
              Run
            </button>
          </form>

          {(speakError || !speakSupported) && (
            <p className="hint">
              {speakError ?? (medical ? "MediaRecorder / fleet unavailable — use typed commands." : "Speech unavailable — type commands.")}
            </p>
          )}

          {runtime.useMedicalAsr && !runtime.fleetApiUrl && (
            <p className="hint">Set VITE_FLEET_API_URL to enable medical ASR proxy.</p>
          )}

          {state.scenePlan.disclaimer && <p className="disclaimer">{state.scenePlan.disclaimer}</p>}
        </div>
      </footer>
    </div>
  );
}
