import { useEffect, useRef, useState } from "react";
import { SessionProvider, useSession } from "./state/sessionStore";
import { RoomCanvas } from "./components/RoomCanvas";
import { RoomChrome } from "./components/RoomChrome";
import { AnnotationOverlay } from "./components/AnnotationOverlay";
import { DicomUploader } from "./components/imaging/DicomUploader";
import { ViewportToolbar } from "./components/ViewportToolbar";
import { runtime } from "./config/runtime";
import { registerDeviceIfNeeded, sendHeartbeat, postLatencyAudit } from "./fleet/fleetClient";
import { hashCommand, measureFrameCommit } from "./telemetry/latency";
import "./index.css";

function Shell() {
  const { state, dispatch } = useSession();
  const lastSigRef = useRef("");
  const [showImaging, setShowImaging] = useState(false);

  useEffect(() => {
    if (!runtime.fleetApiUrl) return;
    void registerDeviceIfNeeded();
    const id = window.setInterval(() => {
      void sendHeartbeat({ gpuOk: true, micOk: true });
    }, 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!state.lastCommand) return;
    const sig = `${state.sessionNonce}:${state.lastCommand}`;
    if (sig === lastSigRef.current) return;
    lastSigRef.current = sig;
    const t0 = performance.now();
    const parseMs = state.parseLatencyMs;
    const cmd = state.lastCommand;
    measureFrameCommit((t1) => {
      const ms = t1 - t0;
      dispatch({ type: "SET_FRAME_LATENCY", ms });
      void postLatencyAudit({
        parseMs,
        frameMs: ms,
        commandHash: hashCommand(cmd),
      });
    });
  }, [state.lastCommand, state.sessionNonce, state.parseLatencyMs, dispatch]);

  return (
    <div className="app">
      <div className="viewport" key={state.sessionNonce}>
        <RoomCanvas />
        <div className="viewport-hud" aria-live="polite">
          <span className="hud-pill">{state.audience === "patient_friendly" ? "Patient view" : "Clinician view"}</span>
          {state.encounterMeshUrl ? (
            <span className="hud-pill">{state.showEncounterMesh ? "Encounter mesh on" : "Encounter mesh off"}</span>
          ) : null}
          {state.frozen ? <span className="hud-pill">Frozen</span> : null}
          {state.selectedId ? (
            <span className="hud-pill hud-pill-detail" title="Selected structure">
              {state.selectedId}
            </span>
          ) : null}
          {!state.showSceneLabels ? <span className="hud-pill">Labels off</span> : null}
        </div>
        <ViewportToolbar />
        <AnnotationOverlay
          enabled={state.frozen && state.drawMode}
          clearSignal={state.drawClearNonce}
          onClearHandled={() => {}}
        />
        {showImaging && (
          <div className="modal">
            <div className="modal-card">
              <div className="modal-head">
                <div className="modal-title">Encounter mesh (upload)</div>
                <button className="btn" type="button" onClick={() => setShowImaging(false)}>
                  Close
                </button>
              </div>
              <DicomUploader
                apiBase="/imaging"
                onDone={(meshUrl) => {
                  dispatch({ type: "SET_ENCOUNTER_MESH", url: meshUrl });
                }}
              />
            </div>
          </div>
        )}
      </div>
      <RoomChrome onOpenImaging={() => setShowImaging(true)} />
    </div>
  );
}

export default function App() {
  return (
    <SessionProvider>
      <Shell />
    </SessionProvider>
  );
}
