export type Runner = "codex" | "claude" | "generic";
export type PatientType = "skill" | "hook" | "subagent" | "config" | "folder";
export type Severity = "info" | "low" | "medium" | "high" | "critical";
export type Gate = "publishable" | "warning" | "blocked" | "unknown";

export interface Finding {
  id: string;
  rule_id: string;
  severity: Severity;
  category: string;
  file: string;
  span?: { line: number; column: number };
  evidence: string;
  message: string;
  suggestion: string;
  autofix: string;
  deduction: number;
  patient_id: string;
}

export interface Patient {
  id: string;
  type: PatientType;
  name: string;
  path: string;
  runner: Runner;
  scope: string;
  score: number;
  grade: string;
  gate: Gate;
  confidence: number;
  issues: Finding[];
  treatments: Array<{
    priority: Severity;
    title: string;
    suggestion: string;
    autofix: string;
    projected_gain: number;
  }>;
  projected_score: number;
}

export interface SkillDoctorReport {
  schema_version: "skill-doctor.report.v1";
  generated_at: string;
  summary: {
    score: number;
    confidence: number;
    gate: Gate;
    patient_counts: Record<PatientType, number>;
    blockers: number;
    warnings: number;
  };
  patients: Patient[];
  findings: Finding[];
}
