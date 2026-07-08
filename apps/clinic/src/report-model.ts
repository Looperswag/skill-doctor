import type { Patient, Runner, SkillDoctorReport } from "./types.js";

export type Tone = "excellent" | "good" | "warning" | "risky" | "critical";

export interface Ward {
  id: Runner;
  label: string;
  patients: Patient[];
  averageScore: number;
}

const WARD_LABELS: Record<Runner, string> = {
  codex: "Codex 病区",
  claude: "Claude 病区",
  generic: "通用病区"
};

export function groupPatientsByWard(report: SkillDoctorReport): Ward[] {
  const order: Runner[] = ["codex", "claude", "generic"];
  return order
    .map((runner) => {
      const patients = report.patients.filter((patient) => patient.runner === runner);
      return {
        id: runner,
        label: WARD_LABELS[runner],
        patients,
        averageScore: patients.length === 0
          ? 100
          : Math.round(patients.reduce((sum, patient) => sum + patient.score, 0) / patients.length)
      };
    })
    .filter((ward) => ward.patients.length > 0);
}

export function scoreTone(score: number): Tone {
  if (score >= 90) return "excellent";
  if (score >= 80) return "good";
  if (score >= 70) return "warning";
  if (score >= 50) return "risky";
  return "critical";
}

export function summarizeFindingCount(patient: Patient): string {
  if (patient.issues.length === 0) return "无发现项";
  const blockers = patient.issues.filter((issue) => issue.severity === "critical" || issue.severity === "high").length;
  return `${patient.issues.length} 个发现项 · ${blockers} 个阻断项`;
}
