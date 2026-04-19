import type { AudienceMode } from "./command";

export type SceneTemplate =
  | "idle_neutral_heart"
  | "coronary_overview"
  | "coronary_stenosis_pci"
  | "aortic_stenosis_tavr"
  | "mitral_regurgitation"
  | "hcm_lvot"
  | "afib_conduction"
  | "device_crt_pacemaker_icd"
  | "compare_normal_disease";

export type CameraPreset =
  | "default_orbit"
  | "anterior_coronary_closeup"
  | "aortic_valve_enface"
  | "mitral_lv_la_cutaway"
  | "whole_heart_ep_layer"
  | "device_leads_focus";

export interface ScenePlan {
  sceneTemplate: SceneTemplate;
  cameraPreset: CameraPreset;
  followTarget?: string;
  pathologyParams: Record<string, number | string | boolean>;
  animationSequence: string[];
  flowOverlay: { enabled: boolean; mode: "none" | "velocity" | "regurgitant_jet" | "stenosis_jet" };
  narrationMode: AudienceMode;
  labels: string[];
  disclaimer?: string;
}
