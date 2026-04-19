/**
 * Cardiology ontology — maps aliases to canonical IDs for deterministic resolution.
 * Extend with JSON or CMS in production.
 */

export const ANATOMY_ALIASES: Record<string, string> = {
  lad: "coronary_artery.LAD",
  "left anterior descending": "coronary_artery.LAD",
  lcx: "coronary_artery.LCx",
  "left circumflex": "coronary_artery.LCx",
  rca: "coronary_artery.RCA",
  "right coronary": "coronary_artery.RCA",
  "left main": "coronary_artery.left_main",
  aortic: "valve.aortic",
  "aortic valve": "valve.aortic",
  mitral: "valve.mitral",
  "mitral valve": "valve.mitral",
  tricuspid: "valve.tricuspid",
  pulmonic: "valve.pulmonic",
  "pulmonary valve": "valve.pulmonic",
  lv: "chamber.LV",
  rv: "chamber.RV",
  la: "chamber.LA",
  ra: "chamber.RA",
};

export const PATHOLOGY_ALIASES: Record<string, string> = {
  stenosis: "coronary_stenosis",
  "coronary stenosis": "coronary_stenosis",
  "aortic stenosis": "aortic_stenosis",
  as: "aortic_stenosis",
  "mitral regurgitation": "mitral_regurgitation",
  mr: "mitral_regurgitation",
  regurgitation: "mitral_regurgitation",
  hcm: "hcm",
  "hypertrophic cardiomyopathy": "hcm",
  afib: "atrial_fibrillation_mechanism",
  "atrial fibrillation": "atrial_fibrillation_mechanism",
  "heart failure": "dilated_cardiomyopathy",
  dcm: "dilated_cardiomyopathy",
};

export const INTERVENTION_ALIASES: Record<string, string> = {
  pci: "PCI_stent",
  stent: "PCI_stent",
  tavr: "TAVR",
  savr: "SAVR",
  "bypass surgery": "CABG",
  cabg: "CABG",
  pacemaker: "pacemaker",
  icd: "ICD",
  crt: "CRT",
};

export function normalizeToken(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

export function resolveAnatomyPhrase(text: string): string | undefined {
  const n = normalizeToken(text);
  for (const [alias, id] of Object.entries(ANATOMY_ALIASES)) {
    if (n.includes(alias)) return id;
  }
  return undefined;
}
