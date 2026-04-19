import { useSession } from "../state/sessionStore";

export function ViewportToolbar() {
  const { state, dispatch } = useSession();

  return (
    <div className="viewport-toolbar" role="toolbar" aria-label="Viewport">
      <button
        type="button"
        className="viewport-tool-btn"
        onClick={() => dispatch({ type: "RESET_CAMERA_VIEW" })}
        title="Reset orbit, default angle, and distance to frame the scene"
      >
        Reset view
      </button>
      <button
        type="button"
        className={`viewport-tool-btn ${state.showSceneLabels ? "active" : ""}`}
        onClick={() => dispatch({ type: "SET_SHOW_SCENE_LABELS", show: !state.showSceneLabels })}
        title="Toggle 3D scene captions (cycle phase, labels)"
      >
        Labels
      </button>
    </div>
  );
}
