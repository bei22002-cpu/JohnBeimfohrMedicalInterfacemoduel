import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
  type ReactNode,
} from "react";
import { getDemoEncounterMeshUrl } from "../lib/demoEncounterMeshUrl";
import type { AudienceMode } from "../types/command";
import type { ScenePlan } from "../types/scenePlan";
import { interpretUtterance, mergeAudience } from "../pipeline/commandInterpreter";
import { evaluateSafety } from "../pipeline/safetyFilter";
import { buildScenePlan } from "../pipeline/scenePlanner";

export interface SessionState {
  audience: AudienceMode;
  scenePlan: ScenePlan;
  statusLine: string;
  listening: boolean;
  lastCommand: string;
  cameraYaw: number;
  cameraDistance: number;
  animationSpeed: number;
  pciStep: number;
  sessionNonce: number;
  /** Interpreter + scene plan (sync path), ms */
  parseLatencyMs?: number;
  /** Approx. time to next paint after command (async), ms */
  frameLatencyMs?: number;
  /** Selected anatomy/object id (interactive picking) */
  selectedId?: string;
  /** Hovered anatomy/object id (interactive picking) */
  hoveredId?: string;
  /** When true, pause animations for explanation/drawing. */
  frozen: boolean;
  /** When true, drawing tool captures pointer input. */
  drawMode: boolean;
  /** Increment to clear drawings. */
  drawClearNonce: number;
  /** Encounter-generated mesh URL (GLB) */
  encounterMeshUrl?: string;
  /** Encounter mesh visibility toggle */
  showEncounterMesh: boolean;
  /** 3D overlay captions (cycle phase, scene labels) in HeartScene */
  showSceneLabels: boolean;
  /** Incremented to reset OrbitControls to default orientation. */
  orbitResetNonce: number;
}

type Action =
  | { type: "SET_LISTENING"; listening: boolean }
  | { type: "PROCESS_UTTERANCE"; text: string }
  | { type: "RESET" }
  | { type: "SET_AUDIENCE"; audience: AudienceMode }
  | { type: "PRESET"; key: PresetKey }
  | { type: "CAMERA"; yawDelta?: number; distanceDelta?: number }
  | { type: "ANIMATION_SPEED"; factor: number }
  | { type: "TICK_PCI"; step?: number }
  | { type: "SET_FRAME_LATENCY"; ms: number }
  | { type: "SET_HOVERED"; id?: string }
  | { type: "SET_SELECTED"; id?: string }
  | { type: "SET_FROZEN"; frozen: boolean }
  | { type: "SET_DRAW_MODE"; drawMode: boolean }
  | { type: "CLEAR_DRAWINGS" }
  | { type: "SET_ENCOUNTER_MESH"; url?: string }
  | { type: "SET_SHOW_ENCOUNTER_MESH"; show: boolean }
  | { type: "CLEAR_ENCOUNTER_MESH" }
  | { type: "LOAD_DEMO_ENCOUNTER_MESH" }
  | { type: "RESET_CAMERA_VIEW" }
  | { type: "SET_SHOW_SCENE_LABELS"; show: boolean };

export type PresetKey =
  | "normal"
  | "lad_stenosis"
  | "pci"
  | "as_tavr"
  | "mr"
  | "hcm"
  | "afib"
  | "devices";

const initialPlan = (): ScenePlan =>
  buildScenePlan(
    {
      intent: "reset_session",
      rawText: "",
      targets: [],
      pathology: { type: "none" },
      intervention: { type: "none" },
      renderingHints: [],
    },
    "patient_friendly",
  );

const initialState: SessionState = {
  audience: "patient_friendly",
  scenePlan: initialPlan(),
  statusLine: "Educational mode — not for diagnosis.",
  listening: false,
  lastCommand: "",
  cameraYaw: 0,
  cameraDistance: 6.5,
  animationSpeed: 1,
  pciStep: 0,
  sessionNonce: 0,
  parseLatencyMs: undefined,
  frameLatencyMs: undefined,
  selectedId: undefined,
  hoveredId: undefined,
  frozen: false,
  drawMode: false,
  drawClearNonce: 0,
  encounterMeshUrl: undefined,
  showEncounterMesh: false,
  showSceneLabels: true,
  orbitResetNonce: 0,
};

function presetUtterance(key: PresetKey): string {
  switch (key) {
    case "normal":
      return "Show normal heart and cardiac cycle";
    case "lad_stenosis":
      return "Show the LAD with 80% stenosis";
    case "pci":
      return "Demonstrate how a stent restores flow";
    case "as_tavr":
      return "Show severe aortic stenosis with TAVR";
    case "mr":
      return "Animate mitral regurgitation in systole";
    case "hcm":
      return "Show hypertrophic cardiomyopathy and outflow obstruction";
    case "afib":
      return "Explain atrial fibrillation mechanism simply";
    case "devices":
      return "Show CRT device overview";
    default:
      return "";
  }
}

function dispatchUtterance(state: SessionState, text: string): SessionState {
  const trimmed = text.trim();
  if (!trimmed) return state;

  const t0 = typeof performance !== "undefined" ? performance.now() : 0;
  const elapsed = () => (typeof performance !== "undefined" ? performance.now() - t0 : undefined);

  const safety = evaluateSafety(trimmed);
  if (!safety.allowed) {
    return {
      ...state,
      lastCommand: trimmed,
      statusLine: safety.message ?? "Request outside educational scope.",
      parseLatencyMs: elapsed(),
      frameLatencyMs: undefined,
    };
  }

  const parsed = interpretUtterance(trimmed, state.audience);
  const audience = mergeAudience(parsed, state.audience);

  if (parsed.intent === "set_audience_mode" && parsed.audienceMode) {
    return {
      ...state,
      audience: parsed.audienceMode,
      lastCommand: trimmed,
      statusLine: `Mode: ${parsed.audienceMode === "patient_friendly" ? "Patient-friendly" : "Clinician detail"}`,
      scenePlan: { ...state.scenePlan, narrationMode: parsed.audienceMode },
      parseLatencyMs: elapsed(),
      frameLatencyMs: undefined,
    };
  }

  if (parsed.intent === "camera_control") {
    let cameraYaw = state.cameraYaw;
    let cameraDistance = state.cameraDistance;
    let animationSpeed = state.animationSpeed;
    for (const h of parsed.renderingHints) {
      if (h.startsWith("rotate_delta:")) cameraYaw += parseFloat(h.split(":")[1] ?? "0");
      if (h.startsWith("zoom_delta:")) cameraDistance = Math.min(12, Math.max(4, cameraDistance + parseFloat(h.split(":")[1] ?? "0")));
      if (h.startsWith("animation_speed:"))
        animationSpeed = Math.min(2, Math.max(0.35, parseFloat(h.split(":")[1] ?? "1")));
    }
    return {
      ...state,
      lastCommand: trimmed,
      cameraYaw,
      cameraDistance,
      animationSpeed,
      statusLine: "Camera / pacing adjusted",
      parseLatencyMs: elapsed(),
      frameLatencyMs: undefined,
    };
  }

  if (parsed.intent === "reset_session") {
    return {
      ...initialState,
      sessionNonce: state.sessionNonce + 1,
      audience,
      scenePlan: buildScenePlan(parsed, audience),
      lastCommand: trimmed,
      statusLine: "Session reset — no PHI stored locally in this demo.",
      parseLatencyMs: elapsed(),
      frameLatencyMs: undefined,
    };
  }

  const scenePlan = buildScenePlan({ ...parsed, audienceMode: audience }, audience);
  let pciStep = state.pciStep;
  if (scenePlan.sceneTemplate === "coronary_stenosis_pci") pciStep = 0;

  return {
    ...state,
    audience,
    scenePlan,
    lastCommand: trimmed,
    pciStep,
    statusLine: "Scene updated — educational visualization only.",
    parseLatencyMs: elapsed(),
    frameLatencyMs: undefined,
  };
}

function reducer(state: SessionState, action: Action): SessionState {
  switch (action.type) {
    case "SET_LISTENING":
      return { ...state, listening: action.listening };
    case "SET_FRAME_LATENCY":
      return { ...state, frameLatencyMs: action.ms };
    case "SET_HOVERED":
      return { ...state, hoveredId: action.id };
    case "SET_SELECTED":
      return { ...state, selectedId: action.id };
    case "SET_FROZEN":
      return { ...state, frozen: action.frozen, drawMode: action.frozen ? state.drawMode : false };
    case "SET_DRAW_MODE":
      return { ...state, drawMode: action.drawMode };
    case "CLEAR_DRAWINGS":
      return { ...state, drawClearNonce: state.drawClearNonce + 1 };
    case "SET_ENCOUNTER_MESH":
      return { ...state, encounterMeshUrl: action.url, showEncounterMesh: !!action.url };
    case "SET_SHOW_ENCOUNTER_MESH":
      return { ...state, showEncounterMesh: action.show };
    case "CLEAR_ENCOUNTER_MESH":
      return { ...state, encounterMeshUrl: undefined, showEncounterMesh: false };
    case "LOAD_DEMO_ENCOUNTER_MESH":
      // Minimal offline GLB (single triangle) — no network; see `npm run write-demo-glb` for `public/` copy
      return {
        ...state,
        encounterMeshUrl: getDemoEncounterMeshUrl(),
        showEncounterMesh: true,
        statusLine: "Loaded offline demo mesh (minimal GLB) — encounter layer smoke test.",
      };
    case "SET_AUDIENCE":
      return {
        ...state,
        audience: action.audience,
        scenePlan: { ...state.scenePlan, narrationMode: action.audience },
      };
    case "CAMERA": {
      const yaw = state.cameraYaw + (action.yawDelta ?? 0);
      const dist = Math.min(12, Math.max(4, state.cameraDistance + (action.distanceDelta ?? 0)));
      return { ...state, cameraYaw: yaw, cameraDistance: dist };
    }
    case "RESET_CAMERA_VIEW":
      return {
        ...state,
        cameraYaw: 0,
        cameraDistance: 6.5,
        selectedId: undefined,
        hoveredId: undefined,
        orbitResetNonce: state.orbitResetNonce + 1,
        statusLine: "Camera reset — default framing.",
      };
    case "SET_SHOW_SCENE_LABELS":
      return {
        ...state,
        showSceneLabels: action.show,
        statusLine: action.show ? "Scene labels on." : "Scene labels off.",
      };
    case "ANIMATION_SPEED":
      return { ...state, animationSpeed: Math.min(2, Math.max(0.35, action.factor)) };
    case "TICK_PCI":
      return { ...state, pciStep: action.step ?? state.pciStep + 1 };
    case "RESET":
      return {
        ...initialState,
        sessionNonce: state.sessionNonce + 1,
        audience: state.audience,
        encounterMeshUrl: undefined,
        showEncounterMesh: false,
        scenePlan: buildScenePlan(
          {
            intent: "reset_session",
            rawText: "reset",
            targets: [],
            pathology: { type: "none" },
            intervention: { type: "none" },
            renderingHints: [],
          },
          state.audience,
        ),
      };
    case "PRESET":
      return dispatchUtterance(state, presetUtterance(action.key));
    case "PROCESS_UTTERANCE":
      return dispatchUtterance(state, action.text);
    default:
      return state;
  }
}

const Ctx = createContext<{
  state: SessionState;
  dispatch: (a: Action) => void;
  submitText: (t: string) => void;
} | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  const submitText = useCallback((t: string) => {
    dispatch({ type: "PROCESS_UTTERANCE", text: t });
  }, []);

  const value = useMemo(() => ({ state, dispatch, submitText }), [state, submitText]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession() {
  const x = useContext(Ctx);
  if (!x) throw new Error("useSession needs SessionProvider");
  return x;
}
