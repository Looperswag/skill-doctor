import { scan, type Finding, type Patient, type ScanOptions, type SkillDoctorReport } from "@skill-doctor/core";
import { writeReportFiles } from "./io.js";
import type { ReportStore } from "./live.js";

export interface RepairCoordinatorOptions {
  store: ReportStore;
  scanOptions?: ScanOptions;
  outDir?: string;
  scanFn?: (options: ScanOptions) => Promise<SkillDoctorReport>;
  writeReportFilesFn?: (report: SkillDoctorReport, outDir: string) => Promise<void>;
  applySafeAutofixFn?: (finding: Finding, patient: Patient) => Promise<SafeAutofixResult>;
  stepDelayMs?: number;
}

export interface SafeAutofixResult {
  applied: boolean;
  reason?: string;
  message?: string;
}

export interface RepairStartResult {
  job_id: string;
  status: "running";
  total: number;
  auto_fixable: number;
  manual_required: number;
}

export class RepairRequestError extends Error {
  constructor(message: string, readonly statusCode: number) {
    super(message);
  }
}

export class RepairCoordinator {
  private readonly store: ReportStore;
  private readonly scanOptions: ScanOptions;
  private readonly outDir: string | undefined;
  private readonly scanFn: (options: ScanOptions) => Promise<SkillDoctorReport>;
  private readonly writeReportFilesFn: (report: SkillDoctorReport, outDir: string) => Promise<void>;
  private readonly applySafeAutofixFn: (finding: Finding, patient: Patient) => Promise<SafeAutofixResult>;
  private readonly stepDelayMs: number;
  private runningJobId: string | undefined;
  private pendingExternalChange = false;

  constructor(options: RepairCoordinatorOptions) {
    this.store = options.store;
    this.scanOptions = options.scanOptions ?? {};
    this.outDir = options.outDir;
    this.scanFn = options.scanFn ?? scan;
    this.writeReportFilesFn = options.writeReportFilesFn ?? writeReportFiles;
    this.applySafeAutofixFn = options.applySafeAutofixFn ?? defaultSafeAutofix;
    this.stepDelayMs = options.stepDelayMs ?? 180;
  }

  isRunning(): boolean {
    return this.runningJobId !== undefined;
  }

  markExternalChangePending(): void {
    this.pendingExternalChange = true;
  }

  startPatientRepair(patientId: string): RepairStartResult {
    const patient = this.store.getReport().patients.find((candidate) => candidate.id === patientId);
    if (!patient) throw new RepairRequestError("没有找到对应的诊疗对象", 404);
    return this.startBatch([patient]);
  }

  startAllRepairs(): RepairStartResult {
    return this.startBatch(this.store.getReport().patients.filter((patient) => patient.issues.length > 0));
  }

  private startBatch(patients: Patient[]): RepairStartResult {
    if (this.runningJobId) throw new RepairRequestError("已有治疗任务运行中，请等待当前任务完成", 409);
    const targets = patients.filter((patient) => patient.issues.length > 0);
    if (targets.length === 0) throw new RepairRequestError("当前没有需要治疗的对象", 409);

    const jobId = `repair-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const counts = countFindings(targets);
    this.runningJobId = jobId;
    this.pendingExternalChange = false;

    queueMicrotask(() => {
      void this.runBatch(jobId, targets, counts).catch((error) => {
        const firstPatient = targets[0];
        this.store.failScan(error);
        this.store.failRepair({
          jobId,
          patientId: firstPatient?.id ?? "batch",
          patientName: firstPatient?.name ?? "批量治疗",
          progress: 0,
          message: error instanceof Error ? error.message : String(error)
        });
        this.runningJobId = undefined;
        this.pendingExternalChange = false;
      });
    });

    return {
      job_id: jobId,
      status: "running",
      total: targets.length,
      auto_fixable: counts.autoFixable,
      manual_required: counts.manualRequired
    };
  }

  private async runBatch(
    jobId: string,
    patients: Patient[],
    counts: { autoFixable: number; manualRequired: number }
  ): Promise<void> {
    let processedFindings = 0;
    let autoApplied = 0;
    const totalFindings = Math.max(1, counts.autoFixable + counts.manualRequired);

    this.store.beginRepairBatch({
      jobId,
      total: patients.length,
      autoFixable: counts.autoFixable,
      manualRequired: counts.manualRequired,
      message: `已启动 ${patients.length} 个对象的真实治疗流程`
    });

    for (const patient of patients) {
      this.store.startRepairItem({
        jobId,
        patientId: patient.id,
        patientName: patient.name,
        progress: Math.round(processedFindings / totalFindings * 80),
        totalFindings: patient.issues.length,
        message: `正在处理 ${patient.name}`
      });

      for (const finding of patient.issues) {
        await delay(this.stepDelayMs);
        processedFindings += 1;
        const remaining = totalFindings - processedFindings;
        const progress = Math.min(92, Math.round(processedFindings / totalFindings * 82));

        if (finding.autofix === "safe_autofix") {
          const result = await this.applySafeAutofix(finding, patient);
          if (result.applied) {
            autoApplied += 1;
            this.store.applyRepairItem({
              jobId,
              patientId: patient.id,
              patientName: patient.name,
              findingId: finding.id,
              progress,
              remaining,
              message: result.message ?? `已应用 ${finding.rule_id} 的安全修复`
            });
            continue;
          }

          this.store.skipRepairItem({
            jobId,
            patientId: patient.id,
            patientName: patient.name,
            findingId: finding.id,
            progress,
            remaining,
            reason: result.reason ?? "safe_autofix_missing_patch",
            message: result.message ?? `${finding.rule_id} 未提供可安全应用的补丁`
          });
          continue;
        }

        this.store.skipRepairItem({
          jobId,
          patientId: patient.id,
          patientName: patient.name,
          findingId: finding.id,
          progress,
          remaining,
          reason: finding.autofix,
          message: `${finding.rule_id} 需要人工确认，未自动改写文件`
        });
      }
    }

    this.store.beginRepairRescan({
      jobId,
      pendingExternalChange: this.pendingExternalChange,
      message: this.pendingExternalChange ? "检测到治疗期间文件变化，正在合并复诊" : "治疗动作完成，正在真实复诊"
    });
    this.store.beginScan();
    const report = await this.scanFn(this.scanOptions);
    if (this.outDir) await this.writeReportFilesFn(report, this.outDir);
    this.store.completeScan(report);
    this.store.completeRepairRescan({
      jobId,
      report,
      message: "真实复诊完成，报告已按扫描结果刷新"
    });
    this.store.completeRepairBatch({
      jobId,
      total: patients.length,
      autoApplied,
      manualRequired: counts.manualRequired + counts.autoFixable - autoApplied,
      message: autoApplied > 0 ? "治疗批次完成，已按复诊结果更新" : "治疗批次完成，剩余项目需要人工确认"
    });
    this.runningJobId = undefined;
    this.pendingExternalChange = false;
  }

  private async applySafeAutofix(finding: Finding, patient: Patient): Promise<SafeAutofixResult> {
    try {
      return await this.applySafeAutofixFn(finding, patient);
    } catch (error) {
      return {
        applied: false,
        reason: "safe_autofix_failed",
        message: error instanceof Error ? error.message : "安全修复执行失败，已转入人工确认"
      };
    }
  }
}

function countFindings(patients: Patient[]): { autoFixable: number; manualRequired: number } {
  let autoFixable = 0;
  let manualRequired = 0;
  for (const patient of patients) {
    for (const issue of patient.issues) {
      if (issue.autofix === "safe_autofix") autoFixable += 1;
      else manualRequired += 1;
    }
  }
  return { autoFixable, manualRequired };
}

async function defaultSafeAutofix(): Promise<SafeAutofixResult> {
  return {
    applied: false,
    reason: "safe_autofix_missing_patch",
    message: "当前规则尚未提供可安全应用的自动补丁"
  };
}

async function delay(ms: number): Promise<void> {
  if (ms <= 0) return;
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
}
