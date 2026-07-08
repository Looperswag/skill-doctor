export type {
  Autofix,
  Finding,
  Gate,
  Grade,
  Patient,
  PatientType,
  ReportSummary,
  Runner,
  ScanOptions,
  Severity,
  SkillDoctorReport,
  Treatment
} from "./types.js";

export { renderMarkdownReport } from "./markdown.js";

import { analyzePatient } from "./rules.js";
import { discoverPatients } from "./inventory.js";
import { scorePatient, summarizePatients } from "./scoring.js";
import type { ScanOptions, SkillDoctorReport } from "./types.js";

export async function scan(options: ScanOptions = {}): Promise<SkillDoctorReport> {
  const drafts = await discoverPatients(options);
  const patients = [];
  const findings = [];

  for (const draft of drafts) {
    const issues = await analyzePatient(draft);
    const patient = scorePatient(draft, issues);
    patients.push(patient);
    findings.push(...issues);
  }

  return {
    schema_version: "skill-doctor.report.v1",
    generated_at: new Date().toISOString(),
    summary: summarizePatients(patients, findings),
    patients,
    findings
  };
}
