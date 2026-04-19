import type { SafetyResult } from "../types/command";

const RESTRICTED_PATTERNS: { pattern: RegExp; reason: string }[] = [
  { pattern: /\bdiagnos(e|is|ing)\b/i, reason: "diagnostic" },
  { pattern: /\byour\s+ef\b/i, reason: "patient-specific outcome" },
  { pattern: /\burgent\s+pci\b/i, reason: "treatment urgency" },
  { pattern: /\bpredict\b/i, reason: "prediction" },
  { pattern: /\brisk[- ]?stratif/i, reason: "risk stratification" },
  { pattern: /\bexactly\s+what\s+this\s+patient/i, reason: "patient-specific interpretation" },
  { pattern: /\binterpret\s+this\s+image/i, reason: "autonomous image interpretation" },
];

const SAFE_RESPONSE =
  "I can show a general educational visualization or physician-linked encounter data if available. I do not make diagnoses or treatment decisions.";

export function evaluateSafety(utterance: string): SafetyResult {
  for (const { pattern } of RESTRICTED_PATTERNS) {
    if (pattern.test(utterance)) {
      return { allowed: false, message: SAFE_RESPONSE };
    }
  }
  return { allowed: true };
}
