export type Runner = "codex" | "claude" | "generic";
export type Scope = "user" | "project" | "legacy" | "fixture" | "unknown";
export type PatientType = "skill" | "hook" | "subagent" | "config" | "folder";
export type Severity = "info" | "low" | "medium" | "high" | "critical";
export type Autofix = "safe_autofix" | "review_required" | "manual_only" | "do_not_autofix";
export type Gate = "publishable" | "warning" | "blocked" | "unknown";
export type Grade = "excellent" | "good" | "warning" | "risky" | "critical";

export interface ScanOptions {
  homeDir?: string;
  paths?: string[];
  runners?: Runner[];
}

export interface Span {
  line: number;
  column: number;
}

export interface Finding {
  id: string;
  rule_id: string;
  severity: Severity;
  category: string;
  file: string;
  span?: Span;
  evidence: string;
  message: string;
  suggestion: string;
  autofix: Autofix;
  deduction: number;
  patient_id: string;
}

export interface Treatment {
  priority: Severity;
  title: string;
  suggestion: string;
  autofix: Autofix;
  projected_gain: number;
}

export interface Patient {
  id: string;
  type: PatientType;
  name: string;
  path: string;
  runner: Runner;
  scope: Scope;
  score: number;
  grade: Grade;
  gate: Gate;
  confidence: number;
  issues: Finding[];
  treatments: Treatment[];
  projected_score: number;
}

export interface ReportSummary {
  score: number;
  confidence: number;
  gate: Gate;
  patient_counts: Record<PatientType, number>;
  blockers: number;
  warnings: number;
}

export interface SkillDoctorReport {
  schema_version: "skill-doctor.report.v1";
  generated_at: string;
  summary: ReportSummary;
  patients: Patient[];
  findings: Finding[];
}

export interface PatientDraft {
  id: string;
  type: PatientType;
  name: string;
  path: string;
  runner: Runner;
  scope: Scope;
}
