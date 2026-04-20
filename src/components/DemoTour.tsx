import { useEffect, useMemo, useState } from "react";
import { useSession, type PresetKey } from "../state/sessionStore";

const STORAGE_KEY = "demoTourDismissed:v1";

const TOUR_PRESETS: { key: PresetKey; label: string; blurb: string }[] = [
  { key: "normal", label: "Normal cycle", blurb: "Start with a friendly normal heart + cycle." },
  { key: "lad_stenosis", label: "LAD stenosis", blurb: "Highlight LAD narrowing (classic teaching moment)." },
  { key: "pci", label: "PCI / stent", blurb: "Step through stent restoring flow." },
  { key: "as_tavr", label: "AS + TAVR", blurb: "Valve disease story, then TAVR intervention." },
];

export function DemoTour() {
  const { dispatch } = useSession();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const dismissed = localStorage.getItem(STORAGE_KEY) === "1";
    if (!dismissed) setOpen(true);
  }, []);

  const actions = useMemo(
    () => ({
      dismiss: () => {
        localStorage.setItem(STORAGE_KEY, "1");
        setOpen(false);
      },
      start: () => {
        dispatch({ type: "RESET" });
        dispatch({ type: "LOAD_DEMO_ENCOUNTER_MESH" });
        dispatch({ type: "PRESET", key: "normal" });
        localStorage.setItem(STORAGE_KEY, "1");
        setOpen(false);
      },
    }),
    [dispatch],
  );

  if (!open) return null;

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label="Demo tour">
      <div className="modal-card">
        <div className="modal-head">
          <div className="modal-title">Demo tour</div>
          <button className="btn" type="button" onClick={actions.dismiss}>
            Skip
          </button>
        </div>

        <div style={{ display: "grid", gap: 10 }}>
          <p className="hint" style={{ margin: 0 }}>
            One click to load a bundled encounter mesh + best scenes. No network, no DICOM required.
          </p>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button type="button" className="btn primary" onClick={actions.start}>
              Launch demo
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                dispatch({ type: "LOAD_DEMO_ENCOUNTER_MESH" });
                actions.dismiss();
              }}
              title="Load the bundled encounter mesh only"
            >
              Load demo mesh only
            </button>
          </div>

          <div className="presets" role="toolbar" aria-label="Tour scenes">
            {TOUR_PRESETS.map((p) => (
              <button
                key={p.key}
                type="button"
                className="preset"
                onClick={() => {
                  dispatch({ type: "PRESET", key: p.key });
                  actions.dismiss();
                }}
                title={p.blurb}
              >
                {p.label}
              </button>
            ))}
          </div>

          <p className="subtle" style={{ margin: 0 }}>
            Tip: Use <strong>Reset view</strong> if you get lost, and toggle <strong>Labels</strong> for captions.
          </p>
        </div>
      </div>
    </div>
  );
}

