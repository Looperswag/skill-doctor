import type { SkillDoctorReport } from "@skill-doctor/core";

export type ClinicLiveState = "idle" | "scanning" | "error";

export type ClinicEvent =
  | {
      type: "snapshot";
      version: number;
      state: ClinicLiveState;
      updated_at: string;
      report: SkillDoctorReport;
      error?: string;
    }
  | {
      type: "scan:start";
      version: number;
      state: "scanning";
      updated_at: string;
    }
  | {
      type: "scan:complete";
      version: number;
      state: "idle";
      updated_at: string;
      report: SkillDoctorReport;
    }
  | {
      type: "scan:error";
      version: number;
      state: "error";
      updated_at: string;
      message: string;
      report: SkillDoctorReport;
    };

export type ClinicSnapshot = Extract<ClinicEvent, { type: "snapshot" }>;
export type ClinicEventListener = (event: ClinicEvent) => void;

export class ReportStore {
  private report: SkillDoctorReport;
  private version = 1;
  private state: ClinicLiveState = "idle";
  private updatedAt: string;
  private error: string | undefined;
  private readonly listeners = new Set<ClinicEventListener>();

  constructor(initialReport: SkillDoctorReport) {
    this.report = initialReport;
    this.updatedAt = initialReport.generated_at;
  }

  getReport(): SkillDoctorReport {
    return this.report;
  }

  getSnapshot(): ClinicSnapshot {
    const snapshot: ClinicSnapshot = {
      type: "snapshot",
      version: this.version,
      state: this.state,
      updated_at: this.updatedAt,
      report: this.report
    };
    if (this.error) return { ...snapshot, error: this.error };
    return snapshot;
  }

  subscribe(listener: ClinicEventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  beginScan(): void {
    this.version += 1;
    this.state = "scanning";
    this.error = undefined;
    this.updatedAt = new Date().toISOString();
    this.emit({
      type: "scan:start",
      version: this.version,
      state: "scanning",
      updated_at: this.updatedAt
    });
  }

  completeScan(report: SkillDoctorReport): void {
    this.version += 1;
    this.report = report;
    this.state = "idle";
    this.error = undefined;
    this.updatedAt = report.generated_at;
    this.emit({
      type: "scan:complete",
      version: this.version,
      state: "idle",
      updated_at: this.updatedAt,
      report
    });
  }

  failScan(error: unknown): void {
    this.version += 1;
    this.state = "error";
    this.error = error instanceof Error ? error.message : String(error);
    this.updatedAt = new Date().toISOString();
    this.emit({
      type: "scan:error",
      version: this.version,
      state: "error",
      updated_at: this.updatedAt,
      message: this.error,
      report: this.report
    });
  }

  private emit(event: ClinicEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}
