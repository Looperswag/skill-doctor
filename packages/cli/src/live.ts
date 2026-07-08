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
    }
  | {
      type: "repair:start";
      version: number;
      updated_at: string;
      job_id: string;
      patient_id: string;
      patient_name: string;
      progress: number;
      message: string;
    }
  | {
      type: "repair:progress";
      version: number;
      updated_at: string;
      job_id: string;
      patient_id: string;
      patient_name: string;
      progress: number;
      step: number;
      total_steps: number;
      message: string;
    }
  | {
      type: "repair:item-complete";
      version: number;
      updated_at: string;
      job_id: string;
      patient_id: string;
      patient_name: string;
      finding_id: string;
      progress: number;
      remaining: number;
      message: string;
    }
  | {
      type: "repair:complete";
      version: number;
      updated_at: string;
      job_id: string;
      patient_id: string;
      patient_name: string;
      progress: 100;
      message: string;
    }
  | {
      type: "repair:error";
      version: number;
      updated_at: string;
      job_id: string;
      patient_id: string;
      patient_name: string;
      progress: number;
      message: string;
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

  beginRepair(input: {
    jobId: string;
    patientId: string;
    patientName: string;
    message: string;
    progress?: number;
  }): void {
    const updatedAt = this.nextEventTime();
    this.emit({
      type: "repair:start",
      version: this.version,
      updated_at: updatedAt,
      job_id: input.jobId,
      patient_id: input.patientId,
      patient_name: input.patientName,
      progress: input.progress ?? 4,
      message: input.message
    });
  }

  progressRepair(input: {
    jobId: string;
    patientId: string;
    patientName: string;
    progress: number;
    step: number;
    totalSteps: number;
    message: string;
  }): void {
    const updatedAt = this.nextEventTime();
    this.emit({
      type: "repair:progress",
      version: this.version,
      updated_at: updatedAt,
      job_id: input.jobId,
      patient_id: input.patientId,
      patient_name: input.patientName,
      progress: input.progress,
      step: input.step,
      total_steps: input.totalSteps,
      message: input.message
    });
  }

  completeRepairItem(input: {
    jobId: string;
    patientId: string;
    patientName: string;
    findingId: string;
    progress: number;
    remaining: number;
    message: string;
  }): void {
    const updatedAt = this.nextEventTime();
    this.emit({
      type: "repair:item-complete",
      version: this.version,
      updated_at: updatedAt,
      job_id: input.jobId,
      patient_id: input.patientId,
      patient_name: input.patientName,
      finding_id: input.findingId,
      progress: input.progress,
      remaining: input.remaining,
      message: input.message
    });
  }

  completeRepair(input: {
    jobId: string;
    patientId: string;
    patientName: string;
    message: string;
    report?: SkillDoctorReport;
  }): void {
    if (input.report) {
      this.report = input.report;
      this.state = "idle";
      this.error = undefined;
      this.version += 1;
      this.updatedAt = input.report.generated_at;
    } else {
      this.nextEventTime();
    }
    this.emit({
      type: "repair:complete",
      version: this.version,
      updated_at: this.updatedAt,
      job_id: input.jobId,
      patient_id: input.patientId,
      patient_name: input.patientName,
      progress: 100,
      message: input.message
    });
    if (input.report) {
      this.version += 1;
      this.emit({
        type: "scan:complete",
        version: this.version,
        state: "idle",
        updated_at: this.updatedAt,
        report: input.report
      });
    }
  }

  failRepair(input: {
    jobId: string;
    patientId: string;
    patientName: string;
    progress: number;
    message: string;
  }): void {
    const updatedAt = this.nextEventTime();
    this.emit({
      type: "repair:error",
      version: this.version,
      updated_at: updatedAt,
      job_id: input.jobId,
      patient_id: input.patientId,
      patient_name: input.patientName,
      progress: input.progress,
      message: input.message
    });
  }

  private nextEventTime(): string {
    this.version += 1;
    this.updatedAt = new Date().toISOString();
    return this.updatedAt;
  }

  private emit(event: ClinicEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}
