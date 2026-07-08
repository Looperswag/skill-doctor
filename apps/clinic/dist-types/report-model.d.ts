import type { Patient, Runner, SkillDoctorReport } from "./types.js";
export type Tone = "excellent" | "good" | "warning" | "risky" | "critical";
export interface Ward {
    id: Runner;
    label: string;
    patients: Patient[];
    averageScore: number;
}
export declare function groupPatientsByWard(report: SkillDoctorReport): Ward[];
export declare function scoreTone(score: number): Tone;
export declare function summarizeFindingCount(patient: Patient): string;
//# sourceMappingURL=report-model.d.ts.map