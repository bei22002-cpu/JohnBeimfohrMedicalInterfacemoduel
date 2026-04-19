import type { AudienceMode, InterventionType, ParsedCommand } from "../types/command";
import { resolveAnatomyPhrase } from "../ontology/cardiologyOntology";

function emptyCommand(raw: string): ParsedCommand {
  return {
    intent: "unknown",
    rawText: raw,
    targets: [],
    pathology: { type: "none" },
    intervention: { type: "none" },
    renderingHints: [],
  };
}

/**
 * Deterministic rule-based interpreter (MVP). Replace or augment with ML ASR + grammar in production.
 */
export function interpretUtterance(raw: string, defaultAudience: AudienceMode): ParsedCommand {
  const t = raw.trim();
  if (!t) return emptyCommand(raw);

  const lower = t.toLowerCase();

  if (/\breset\b|\bclear\s+(the\s+)?room\b|\bstart over\b/i.test(t)) {
    return {
      intent: "reset_session",
      rawText: raw,
      targets: [],
      pathology: { type: "none" },
      intervention: { type: "none" },
      renderingHints: ["purge_session"],
    };
  }

  if (/\bpatient\s+(mode|explanation)|lay\s*person|simple(r)?\s+explanation/i.test(t)) {
    return {
      intent: "set_audience_mode",
      rawText: raw,
      targets: [],
      pathology: { type: "none" },
      intervention: { type: "none" },
      audienceMode: "patient_friendly",
      renderingHints: [],
    };
  }

  if (/\bclinician\b|\btrainee\b|\bdetail\s+mode\b|\bmedical\s+terms\b/i.test(t)) {
    return {
      intent: "set_audience_mode",
      rawText: raw,
      targets: [],
      pathology: { type: "none" },
      intervention: { type: "none" },
      audienceMode: "clinician_detail",
      renderingHints: [],
    };
  }

  if (/\brotate\s+left\b/i.test(t)) {
    return {
      intent: "camera_control",
      rawText: raw,
      targets: [],
      pathology: { type: "none" },
      intervention: { type: "none" },
      renderingHints: ["rotate_delta:-0.4"],
    };
  }
  if (/\brotate\s+right\b/i.test(t)) {
    return {
      intent: "camera_control",
      rawText: raw,
      targets: [],
      pathology: { type: "none" },
      intervention: { type: "none" },
      renderingHints: ["rotate_delta:0.4"],
    };
  }
  if (/\bzoom\s+in\b/i.test(t)) {
    return {
      intent: "camera_control",
      rawText: raw,
      targets: [],
      pathology: { type: "none" },
      intervention: { type: "none" },
      renderingHints: ["zoom_delta:-0.6"],
    };
  }
  if (/\bzoom\s+out\b/i.test(t)) {
    return {
      intent: "camera_control",
      rawText: raw,
      targets: [],
      pathology: { type: "none" },
      intervention: { type: "none" },
      renderingHints: ["zoom_delta:0.6"],
    };
  }

  if (/\banimate\s+slower\b|\bslower\b/i.test(t) && /\banimat/i.test(t)) {
    return {
      intent: "camera_control",
      rawText: raw,
      targets: [],
      pathology: { type: "none" },
      intervention: { type: "none" },
      renderingHints: ["animation_speed:0.65"],
    };
  }

  const compare =
    /\bcompare\b.*\b(normal|healthy)\b.*\b(disease|diseased|abnormal)\b/i.test(t) ||
    /\bnormal\s+versus\s+disease/i.test(t);

  // Coronary + stenosis + optional PCI
  if (
    /\b(lad|rca|lcx|left main|coronary)\b/i.test(t) &&
    /\b(\d{1,3})\s*%?\s*stenosis|stenosis|severe\s+proximal|plaque/i.test(t)
  ) {
    const m = t.match(/(\d{1,3})\s*%/);
    const severity = m ? Math.min(99, Math.max(0, parseInt(m[1], 10))) : 70;
    const segment = /\bproximal\b/i.test(t)
      ? "proximal"
      : /\bmid\b/i.test(t)
        ? "mid"
        : /\bdistal\b/i.test(t)
          ? "distal"
          : "unspecified";
    const vessel = /\brca\b/i.test(t)
      ? "RCA"
      : /\blcx\b|circumflex/i.test(t)
        ? "LCx"
        : "LAD";
    const pci = /\bpci\b|\bstent\b|\bballoon\b/i.test(t);
    return {
      intent: pci ? "visualize_pathology_and_intervention" : "visualize_pathology",
      rawText: raw,
      targets: [{ entityId: `coronary_artery.${vessel}`, segment }],
      pathology: { type: "coronary_stenosis", severityPercent: severity },
      intervention: { type: pci ? "PCI_stent" : "none" },
      compareNormalDiseased: compare,
      renderingHints: ["flow_before_after", "camera_focus_target"],
    };
  }

  if (/\bpci\b|\bdemonstrate.*stent|\bstent.*flow\b/i.test(t)) {
    return {
      intent: "visualize_pathology_and_intervention",
      rawText: raw,
      targets: [{ entityId: "coronary_artery.LAD", segment: "proximal" }],
      pathology: { type: "coronary_stenosis", severityPercent: 80 },
      intervention: { type: "PCI_stent" },
      renderingHints: ["pci_sequence"],
    };
  }

  // Aortic stenosis + TAVR / SAVR
  if (/\baortic\s+stenosis\b|\bsevere\s+calcific\s+aortic\b/i.test(t) || (/\bas\b/i.test(t) && /\bvalve\b/i.test(t))) {
    const sev = /\bsevere\b/i.test(t) ? 85 : /\bmoderate\b/i.test(t) ? 55 : 70;
    const tavr = /\btavr\b/i.test(lower);
    const savr = /\bsavr\b|surgical/i.test(lower);
    return {
      intent: tavr || savr ? "visualize_pathology_and_intervention" : "visualize_pathology",
      rawText: raw,
      targets: [{ entityId: "valve.aortic" }],
      pathology: { type: "aortic_stenosis", severityPercent: sev, valve: "aortic" },
      intervention: { type: tavr ? "TAVR" : savr ? "SAVR" : "none" },
      renderingHints: ["stenosis_jet", "pressure_gradient_concept"],
    };
  }

  if (/\btavr\b|\btranscatheter\s+aortic/i.test(t)) {
    return {
      intent: "visualize_pathology_and_intervention",
      rawText: raw,
      targets: [{ entityId: "valve.aortic" }],
      pathology: { type: "aortic_stenosis", severityPercent: 80, valve: "aortic" },
      intervention: { type: "TAVR" },
      renderingHints: ["valve_replacement_sequence"],
    };
  }

  // Mitral regurgitation
  if (/\bmitral\s+regurgitation\b|\bmitral\s+insufficiency\b|\bMR\b/i.test(t) || (/\bregurgitation\b/i.test(t) && /\bmitral\b/i.test(t))) {
    return {
      intent: "visualize_pathology",
      rawText: raw,
      targets: [{ entityId: "valve.mitral" }],
      pathology: { type: "mitral_regurgitation", severityPercent: /\bsevere\b/i.test(t) ? 80 : 50, valve: "mitral" },
      intervention: { type: "none" },
      renderingHints: ["systole_emphasis", "regurgitant_jet"],
    };
  }

  // HCM
  if (/\bhcm\b|\bhypertrophic\s+cardiomyopathy\b|\basymmetric\s+septal\b/i.test(t)) {
    return {
      intent: "visualize_pathology",
      rawText: raw,
      targets: [{ entityId: "myocardium.septum" }],
      pathology: { type: "hcm", severityPercent: 0 },
      intervention: { type: "none" },
      compareNormalDiseased: compare,
      renderingHints: ["lvot_obstruction_concept"],
    };
  }

  // AFib mechanism
  if (/\bafib\b|\batrial\s+fibrillation\b|\bfibrillation\s+mechanism\b/i.test(t)) {
    return {
      intent: "visualize_pathology",
      rawText: raw,
      targets: [{ entityId: "conduction.atria" }],
      pathology: { type: "atrial_fibrillation_mechanism", severityPercent: 0 },
      intervention: { type: "none" },
      renderingHints: ["chaotic_activation_abstract"],
    };
  }

  // Devices
  if (/\bpacemaker\b|\bicd\b|\bcrt\b|\bdefibrillator\b|\bbiventricular\b/i.test(t)) {
    const inter: InterventionType = /\bcrt\b/i.test(t) ? "CRT" : /\bicd\b|defibrillator/i.test(t) ? "ICD" : "pacemaker";
    return {
      intent: "visualize_pathology",
      rawText: raw,
      targets: [{ entityId: "device.leads" }],
      pathology: { type: "none" },
      intervention: { type: inter },
      renderingHints: ["device_leads"],
    };
  }

  // Normal heart / cycle
  if (/\bnormal\s+heart\b|\bcardiac\s+cycle\b|\bshow\s+the\s+heart\b/i.test(t) && !/stenosis|disease/i.test(t)) {
    return {
      intent: "animate_cycle",
      rawText: raw,
      targets: [],
      pathology: { type: "normal_reference" },
      intervention: { type: "none" },
      renderingHints: ["full_cycle"],
    };
  }

  // Coronary tree only
  if (/\bcoronary\b|\blad\b|\brca\b|\blcx\b/i.test(t) && !/stenosis|stenotic/i.test(t)) {
    const resolved = resolveAnatomyPhrase(t);
    const vessel = resolved?.includes("RCA") ? "RCA" : resolved?.includes("LCx") ? "LCx" : "LAD";
    return {
      intent: "visualize_anatomy",
      rawText: raw,
      targets: [{ entityId: `coronary_artery.${vessel}`, segment: "unspecified" }],
      pathology: { type: "none" },
      intervention: { type: "none" },
      renderingHints: ["highlight_coronary"],
    };
  }

  if (/\baortic\s+valve\b/i.test(t)) {
    return {
      intent: "visualize_anatomy",
      rawText: raw,
      targets: [{ entityId: "valve.aortic" }],
      pathology: { type: "none" },
      intervention: { type: "none" },
      renderingHints: ["valve_focus"],
    };
  }

  // DCM
  if (/\bdilated\s+cardiomyopathy\b|\bDCM\b/i.test(t)) {
    return {
      intent: "visualize_pathology",
      rawText: raw,
      targets: [{ entityId: "chamber.LV" }],
      pathology: { type: "dilated_cardiomyopathy", severityPercent: 0 },
      intervention: { type: "none" },
      compareNormalDiseased: compare,
      renderingHints: ["reduced_systolic_function"],
    };
  }

  const cmd = emptyCommand(raw);
  cmd.renderingHints.push(`unresolved: use presets or rephrase`);
  cmd.intent = "unknown";
  return cmd;
}

export function mergeAudience(cmd: ParsedCommand, fallback: AudienceMode): AudienceMode {
  return cmd.audienceMode ?? fallback;
}
