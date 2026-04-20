import { useMemo } from "react";
import { useSession } from "../state/sessionStore";

export function HelpModal({ onClose, onLaunchDemo }: { onClose: () => void; onLaunchDemo?: () => void }) {
  const { dispatch } = useSession();

  const tips = useMemo(
    () => [
      { k: "Rotate", v: "Left-drag" },
      { k: "Zoom", v: "Mouse wheel / trackpad pinch" },
      { k: "Select anatomy", v: "Click a structure" },
      { k: "Clear selection", v: "Reset view" },
      { k: "Draw", v: "Freeze → Draw (then Clear ink)" },
    ],
    [],
  );

  const commands = useMemo(
    () => [
      'Show normal heart and cardiac cycle',
      'Show the LAD with 80% stenosis',
      'Demonstrate how a stent restores flow',
      'Show severe aortic stenosis with TAVR',
      'Rotate left a bit',
      'Zoom in',
    ],
    [],
  );

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label="Help">
      <div className="modal-card">
        <div className="modal-head">
          <div className="modal-title">Help</div>
          <button className="btn" type="button" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="help-grid">
          <section className="help-card">
            <div className="help-title">Quick start</div>
            <p className="hint" style={{ marginTop: 6 }}>
              This is an educational visualization. Use <strong>Demo</strong> for a guided flow, or type a command under{" "}
              <strong>More controls</strong>.
            </p>
            <div className="help-actions">
              <button type="button" className="btn primary" onClick={() => onLaunchDemo?.()}>
                Launch demo
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  dispatch({ type: "RESET" });
                  onClose();
                }}
              >
                Reset room
              </button>
            </div>
          </section>

          <section className="help-card">
            <div className="help-title">Mouse / touchpad</div>
            <div className="help-kv">
              {tips.map((t) => (
                <div key={t.k} className="help-kv-row">
                  <div className="help-k">{t.k}</div>
                  <div className="help-v">{t.v}</div>
                </div>
              ))}
            </div>
          </section>

          <section className="help-card">
            <div className="help-title">Try these commands</div>
            <div className="help-chips" role="list">
              {commands.map((c) => (
                <button
                  key={c}
                  type="button"
                  className="preset"
                  role="listitem"
                  onClick={() => {
                    dispatch({ type: "PROCESS_UTTERANCE", text: c });
                    onClose();
                  }}
                  title="Run this command"
                >
                  {c}
                </button>
              ))}
            </div>
            <p className="hint" style={{ marginTop: 8 }}>
              Tip: switch to <strong>Clinician mode</strong> for latency readouts.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

