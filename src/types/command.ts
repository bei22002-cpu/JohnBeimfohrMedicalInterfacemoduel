/** Structured clinical visualization command — ontology-backed, not free text. */

export type AudienceMode = "clinician_detail" | "patient_friendly";

export type Intent =
  | "visualize_anatomy"
  | "visualize_pathology"
  | "visualize_pathology_and_intervention"
  | "animate_cycle"
  | "compare_states"
  | "camera_control"
  | "reset_session"
  | "set_audience_mode"
  | "unknown";

export type CoronaryVessel =
  | "LAD"
  | "LCx"
  | "RCA"
  | "left_main"
  | "OM"
  | "PDA"
  | "unspecified";

export type Valve = "aortic" | "mitral" | "tricuspid" | "pulmonic";

export type PathologyType =
  | "none"
  | "coronary_stenosis"
  | "aortic_stenosis"
  | "mitral_regurgitation"
  | "hcm"
  | "dilated_cardiomyopathy"
  | "atrial_fibrillation_mechanism"
  | "normal_reference";

export type InterventionType =
  | "none"
  | "PCI_stent"
  | "TAVR"
  | "SAVR"
  | "pacemaker"
  | "ICD"
  | "CRT";

export interface AnatomyTarget {
  entityId: string;
  segment?: "proximal" | "mid" | "distal" | "unspecified";
}

export interface PathologySpec {
  type: PathologyType;
  severityPercent?: number;
  valve?: Valve;
}

export interface InterventionSpec {
  type: InterventionType;
}

export interface ParsedCommand {
  intent: Intent;
  rawText: string;
  targets: AnatomyTarget[];
  pathology: PathologySpec;
  intervention: InterventionSpec;
  audienceMode?: AudienceMode;
  renderingHints: string[];
  compareNormalDiseased?: boolean;
}

export interface SafetyResult {
  allowed: boolean;
  message?: string;
}
