import type { ParsedCommand } from "../types/command";
import type { AudienceMode } from "../types/command";
import type { ScenePlan } from "../types/scenePlan";

const EDU_DISCLAIMER =
  "Educational visualization — conceptual hemodynamics, not patient-specific quantitation.";

export function buildScenePlan(cmd: ParsedCommand, audience: AudienceMode): ScenePlan {
  if (cmd.intent === "reset_session") {
    return {
      sceneTemplate: "idle_neutral_heart",
      cameraPreset: "default_orbit",
      pathologyParams: {},
      animationSequence: ["idle_loop"],
      flowOverlay: { enabled: false, mode: "none" },
      narrationMode: audience,
      labels: ["Ready"],
    };
  }

  if (cmd.intent === "unknown") {
    return {
      sceneTemplate: "idle_neutral_heart",
      cameraPreset: "default_orbit",
      pathologyParams: { hint: "Try: “Show LAD with 80% stenosis” or “Severe aortic stenosis with TAVR”" },
      animationSequence: ["idle_loop"],
      flowOverlay: { enabled: false, mode: "none" },
      narrationMode: audience,
      labels: ["Command not matched — use touch presets or rephrase"],
    };
  }

  const base = (): ScenePlan => ({
    sceneTemplate: "idle_neutral_heart",
    cameraPreset: "default_orbit",
    pathologyParams: {},
    animationSequence: ["cardiac_cycle"],
    flowOverlay: { enabled: false, mode: "none" },
    narrationMode: audience,
    labels: [],
    disclaimer: EDU_DISCLAIMER,
  });

  switch (cmd.pathology.type) {
    case "coronary_stenosis": {
      const pci = cmd.intervention.type === "PCI_stent";
      return {
        sceneTemplate: pci ? "coronary_stenosis_pci" : "coronary_overview",
        cameraPreset: "anterior_coronary_closeup",
        followTarget: cmd.targets[0]?.entityId ?? "coronary_artery.LAD",
        pathologyParams: {
          stenosisPercent: cmd.pathology.severityPercent ?? 70,
          vessel: cmd.targets[0]?.entityId ?? "coronary_artery.LAD",
          pciPhase: pci ? 0 : -1,
        },
        animationSequence: pci
          ? ["normal_flow", "lesion", "wire", "balloon", "stent", "restored_flow"]
          : ["normal_flow", "stenosis_highlight"],
        flowOverlay: { enabled: true, mode: "velocity" },
        narrationMode: audience,
        labels:
          audience === "patient_friendly"
            ? ["Coronary artery", "Narrowing reduces blood flow", pci ? "Stent helps open the artery" : ""].filter(
                Boolean,
              )
            : ["LAD segment", `Stenosis ~${cmd.pathology.severityPercent ?? "?"}%`, pci ? "PCI sequence (illustrative)" : ""].filter(
                Boolean,
              ),
        disclaimer: EDU_DISCLAIMER,
      };
    }
    case "aortic_stenosis": {
      const tavr = cmd.intervention.type === "TAVR";
      const savr = cmd.intervention.type === "SAVR";
      return {
        sceneTemplate: tavr || savr ? "aortic_stenosis_tavr" : "aortic_stenosis_tavr",
        cameraPreset: "aortic_valve_enface",
        followTarget: "valve.aortic",
        pathologyParams: {
          valveAreaConcept: "reduced",
          calcification: (cmd.pathology.severityPercent ?? 75) / 100,
          replacement: tavr ? "TAVR" : savr ? "SAVR" : "none",
        },
        animationSequence: ["systole_emphasis", "jet_turbulence", ...(tavr || savr ? ["delivery", "deployment"] : [])],
        flowOverlay: { enabled: true, mode: "stenosis_jet" },
        narrationMode: audience,
        labels:
          audience === "patient_friendly"
            ? ["Aortic valve", "Narrow opening — heart works harder", tavr || savr ? "Replacement restores opening (concept)" : ""]
            : ["Severe AS (illustrative)", "Transvalvular gradient concept", tavr ? "TAVR sequence" : savr ? "SAVR concept" : ""].filter(
                Boolean,
              ),
        disclaimer: EDU_DISCLAIMER,
      };
    }
    case "mitral_regurgitation":
      return {
        sceneTemplate: "mitral_regurgitation",
        cameraPreset: "mitral_lv_la_cutaway",
        followTarget: "valve.mitral",
        pathologyParams: { regurgitantSeverity: (cmd.pathology.severityPercent ?? 50) / 100 },
        animationSequence: ["systole", "regurgitant_jet"],
        flowOverlay: { enabled: true, mode: "regurgitant_jet" },
        narrationMode: audience,
        labels:
          audience === "patient_friendly"
            ? ["Mitral valve", "Some blood flows backward when the heart squeezes"]
            : ["MR jet into LA (educational)", "Systolic phase"],
        disclaimer: EDU_DISCLAIMER,
      };
    case "hcm":
      return {
        sceneTemplate: "hcm_lvot",
        cameraPreset: "mitral_lv_la_cutaway",
        pathologyParams: { septalThickening: 1.35, lvotGradientConcept: true },
        animationSequence: ["systole", "lvot_obstruction"],
        flowOverlay: { enabled: true, mode: "velocity" },
        narrationMode: audience,
        labels:
          audience === "patient_friendly"
            ? ["Thickened heart muscle", "Can narrow the outflow path during contraction"]
            : ["Septal hypertrophy (pattern)", "LVOT obstruction concept"],
        disclaimer: EDU_DISCLAIMER,
      };
    case "atrial_fibrillation_mechanism":
      return {
        sceneTemplate: "afib_conduction",
        cameraPreset: "whole_heart_ep_layer",
        pathologyParams: { chaoticAtria: true },
        animationSequence: ["disorganized_atrial_activity"],
        flowOverlay: { enabled: false, mode: "none" },
        narrationMode: audience,
        labels:
          audience === "patient_friendly"
            ? ["Upper chambers beat irregularly — simplified picture"]
            : ["AF mechanism — abstracted wavefronts; not EP mapping"],
        disclaimer: EDU_DISCLAIMER,
      };
    case "dilated_cardiomyopathy":
      return {
        sceneTemplate: "compare_normal_disease",
        cameraPreset: "default_orbit",
        pathologyParams: { lvDilation: 1.25, systolicDysfunction: 0.45 },
        animationSequence: ["compare_abnormal"],
        flowOverlay: { enabled: true, mode: "velocity" },
        narrationMode: audience,
        labels:
          audience === "patient_friendly"
            ? ["Weaker squeeze", "Larger chamber (concept)"]
            : ["DCM pattern — illustrative LV dilation + reduced EF concept"],
        disclaimer: EDU_DISCLAIMER,
      };
    case "normal_reference":
      return {
        ...base(),
        sceneTemplate: "idle_neutral_heart",
        labels: audience === "patient_friendly" ? ["Healthy heart motion — simplified"] : ["Normal cycle — reference"],
      };
    default:
      break;
  }

  if (cmd.intervention.type === "pacemaker" || cmd.intervention.type === "ICD" || cmd.intervention.type === "CRT") {
    return {
      sceneTemplate: "device_crt_pacemaker_icd",
      cameraPreset: "device_leads_focus",
      pathologyParams: { device: cmd.intervention.type },
      animationSequence: ["pacing_spark", "lead_placement_abstract"],
      flowOverlay: { enabled: false, mode: "none" },
      narrationMode: audience,
      labels:
        audience === "patient_friendly"
          ? ["Device helps timing / rhythm — simplified"]
          : [`${cmd.intervention.type} — illustrative leads; not implant planning`],
      disclaimer: EDU_DISCLAIMER,
    };
  }

  if (cmd.intent === "visualize_anatomy" && cmd.targets.length) {
    return {
      sceneTemplate: "coronary_overview",
      cameraPreset: cmd.targets[0].entityId.includes("coronary") ? "anterior_coronary_closeup" : "aortic_valve_enface",
      followTarget: cmd.targets[0].entityId,
      pathologyParams: {},
      animationSequence: ["cardiac_cycle"],
      flowOverlay: { enabled: false, mode: "none" },
      narrationMode: audience,
      labels: [cmd.targets[0].entityId.replace(/\./g, " · ")],
      disclaimer: EDU_DISCLAIMER,
    };
  }

  const plan = base();
  plan.labels = ["Use voice examples or preset buttons"];
  return plan;
}
