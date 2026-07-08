import type { Finding, Gate, Grade, Patient, PatientDraft, PatientType, ReportSummary, Treatment } from "./types.js";

export function scorePatient(draft: PatientDraft, issues: Finding[]): Patient {
  const rawScore = Math.max(0, 100 - issues.reduce((sum, issue) => sum + issue.deduction, 0));
  const hasCritical = issues.some((issue) => issue.severity === "critical");
  const hasHigh = issues.some((issue) => issue.severity === "high");
  const score = hasCritical ? Math.min(rawScore, 49) : hasHigh ? Math.min(rawScore, 69) : rawScore;
  const confidence = Number(Math.max(0.45, 0.95 - issues.length * 0.03).toFixed(2));
  const treatments = buildTreatments(issues);
  const projectedGain = treatments
    .filter((treatment) => treatment.autofix === "safe_autofix" || treatment.autofix === "review_required")
    .reduce((sum, treatment) => sum + treatment.projected_gain, 0);

  return {
    ...draft,
    score,
    grade: gradeFor(score),
    gate: gateFor(score, hasCritical, hasHigh),
    confidence,
    issues,
    treatments,
    projected_score: Math.min(100, score + projectedGain)
  };
}

export function summarizePatients(patients: Patient[], findings: Finding[]): ReportSummary {
  const baseScore = patients.length === 0
    ? 100
    : Math.round(patients.reduce((sum, patient) => sum + patient.score, 0) / patients.length);
  const hasCritical = findings.some((finding) => finding.severity === "critical");
  const hasHigh = findings.some((finding) => finding.severity === "high");
  const score = hasCritical ? Math.min(baseScore, 49) : hasHigh ? Math.min(baseScore, 69) : baseScore;
  const confidence = patients.length === 0
    ? 0.5
    : Number((patients.reduce((sum, patient) => sum + patient.confidence, 0) / patients.length).toFixed(2));
  const patient_counts: Record<PatientType, number> = {
    skill: 0,
    hook: 0,
    subagent: 0,
    config: 0,
    folder: 0
  };

  for (const patient of patients) {
    patient_counts[patient.type] += 1;
  }

  return {
    score,
    confidence,
    gate: gateFor(score, hasCritical, hasHigh),
    patient_counts,
    blockers: findings.filter((finding) => finding.severity === "critical" || finding.severity === "high").length,
    warnings: findings.filter((finding) => finding.severity === "medium" || finding.severity === "low").length
  };
}

function buildTreatments(issues: Finding[]): Treatment[] {
  return issues.map((issue) => ({
    priority: issue.severity,
    title: issue.message,
    suggestion: issue.suggestion,
    autofix: issue.autofix,
    projected_gain: Math.min(issue.deduction, 12)
  }));
}

function gradeFor(score: number): Grade {
  if (score >= 90) return "excellent";
  if (score >= 80) return "good";
  if (score >= 70) return "warning";
  if (score >= 50) return "risky";
  return "critical";
}

function gateFor(score: number, hasCritical: boolean, hasHigh: boolean): Gate {
  if (hasCritical || score < 50) return "blocked";
  if (hasHigh || score < 80) return "warning";
  return "publishable";
}
