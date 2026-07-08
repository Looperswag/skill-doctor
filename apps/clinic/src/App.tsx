import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Download,
  FileJson,
  FileText,
  Gauge,
  HeartPulse,
  ImageDown,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Stethoscope,
  TrendingUp
} from "lucide-react";
import {
  averageProjectedScore,
  buildMarkdownSummary,
  buildRecoverySeries,
  displayGate,
  displayPatientType,
  displayRunner,
  displaySeverity,
  groupPatientsByWard,
  scoreTone,
  severityBreakdown,
  severityRows,
  sortPatientsByUrgency,
  summarizeFindingCount
} from "./report-model.js";
import type { RecoveryPoint, SeverityBreakdown, Tone, Ward } from "./report-model.js";
import type { Patient, Severity, SkillDoctorReport } from "./types.js";

type LoadState =
  | { state: "loading" }
  | { state: "error"; message: string }
  | { state: "ready"; report: SkillDoctorReport };

type LiveState =
  | { state: "connecting"; message: string; updatedAt?: string }
  | { state: "ready"; message: string; updatedAt?: string; version?: number }
  | { state: "scanning"; message: string; updatedAt?: string; version?: number }
  | { state: "error"; message: string; updatedAt?: string; version?: number };

type RepairState = {
  status: "idle" | "running" | "rescanning" | "review" | "complete" | "error";
  progress: number;
  message: string;
  jobId?: string | undefined;
  updatedAt?: string | undefined;
  completedFindingIds?: string[] | undefined;
  skippedFindingIds?: string[] | undefined;
};

type BatchRepairState = {
  status: "idle" | "running" | "rescanning" | "complete" | "error";
  jobId?: string | undefined;
  total: number;
  autoFixable: number;
  manualRequired: number;
  message: string;
};

type ClinicLivePayload =
  | {
      type: "snapshot";
      version: number;
      state: "idle" | "scanning" | "error";
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
    }
  | {
      type: "repair:batch-start";
      version: number;
      updated_at: string;
      job_id: string;
      total: number;
      auto_fixable: number;
      manual_required: number;
      message: string;
    }
  | {
      type: "repair:item-start";
      version: number;
      updated_at: string;
      job_id: string;
      patient_id: string;
      patient_name: string;
      progress: number;
      total_findings: number;
      message: string;
    }
  | {
      type: "repair:item-applied";
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
      type: "repair:item-skipped";
      version: number;
      updated_at: string;
      job_id: string;
      patient_id: string;
      patient_name: string;
      finding_id: string;
      progress: number;
      remaining: number;
      reason: string;
      message: string;
    }
  | {
      type: "repair:rescan-start";
      version: number;
      updated_at: string;
      job_id: string;
      pending_external_change: boolean;
      message: string;
    }
  | {
      type: "repair:rescan-complete";
      version: number;
      updated_at: string;
      job_id: string;
      report: SkillDoctorReport;
      message: string;
    }
  | {
      type: "repair:batch-complete";
      version: number;
      updated_at: string;
      job_id: string;
      total: number;
      auto_applied: number;
      manual_required: number;
      message: string;
    };

type RepairPayload = Extract<ClinicLivePayload, {
  type: `repair:${string}`;
}>;

export function App() {
  const [loadState, setLoadState] = useState<LoadState>({ state: "loading" });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [repairStates, setRepairStates] = useState<Record<string, RepairState>>({});
  const [batchRepairState, setBatchRepairState] = useState<BatchRepairState>({
    status: "idle",
    total: 0,
    autoFixable: 0,
    manualRequired: 0,
    message: "暂无治疗任务"
  });
  const [liveState, setLiveState] = useState<LiveState>({
    state: "connecting",
    message: "正在连接实时复诊"
  });

  useEffect(() => {
    let cancelled = false;
    let eventSource: EventSource | undefined;
    let pollingTimer: number | undefined;

    const applyReport = (report: SkillDoctorReport) => {
      withViewTransition(() => {
        setLoadState({ state: "ready", report });
        setSelectedId((currentId) => {
          if (currentId && report.patients.some((patient) => patient.id === currentId)) return currentId;
          return sortPatientsByUrgency(report.patients)[0]?.id ?? null;
        });
        setRepairStates((current) => {
          const activeIds = new Set(report.patients.map((patient) => patient.id));
          return Object.fromEntries(Object.entries(current)
            .filter(([patientId]) => activeIds.has(patientId))
            .map(([patientId, state]) => {
              const patient = report.patients.find((candidate) => candidate.id === patientId);
              if (!patient) return [patientId, state];
              if (patient.issues.length === 0 && (state.status === "running" || state.status === "rescanning" || state.status === "review")) {
                return [patientId, {
                  ...state,
                  status: "complete",
                  progress: 100,
                  message: "真实复诊通过，该对象已可发布。"
                }];
              }
              if (patient.issues.length > 0 && (state.status === "running" || state.status === "rescanning")) {
                return [patientId, {
                  ...state,
                  status: "review",
                  progress: 100,
                  message: "真实复诊后仍有发现项，需要人工确认。"
                }];
              }
              return [patientId, state];
            }));
        });
      });
    };

    const startPolling = (message: string) => {
      if (pollingTimer) return;
      setLiveState({ state: "ready", message });
      pollingTimer = window.setInterval(() => {
        void fetchReport()
          .then((report) => {
            if (cancelled) return;
            applyReport(report);
            setLiveState({
              state: "ready",
              message: "轮询复诊中",
              updatedAt: report.generated_at
            });
          })
          .catch((error: unknown) => {
            if (cancelled) return;
            setLiveState({
              state: "error",
              message: error instanceof Error ? `轮询报告失败：${error.message}` : "轮询报告失败，已保留最近报告"
            });
          });
      }, 4000);
    };

    const startEvents = () => {
      if (!("EventSource" in window)) {
        startPolling("浏览器不支持实时事件，已切换为轮询复诊");
        return;
      }

      eventSource = new EventSource("/api/events");
      eventSource.onopen = () => {
        if (!cancelled) {
          setLiveState((current) => ({
            state: current.state === "scanning" ? "scanning" : "ready",
            message: current.state === "scanning" ? "复诊中" : "实时监听中",
            ...(current.updatedAt ? { updatedAt: current.updatedAt } : {}),
            ...("version" in current && current.version !== undefined ? { version: current.version } : {})
          }));
        }
      };

      eventSource.addEventListener("snapshot", (event) => {
        const payload = parseLivePayload(event);
        if (!payload || payload.type !== "snapshot" || cancelled) return;
        applyReport(payload.report);
        setLiveState({
          state: payload.state === "scanning" ? "scanning" : payload.state === "error" ? "error" : "ready",
          message: payload.error ?? (payload.state === "scanning" ? "复诊中" : "实时监听中"),
          updatedAt: payload.updated_at,
          version: payload.version
        });
      });

      eventSource.addEventListener("scan:start", (event) => {
        const payload = parseLivePayload(event);
        if (!payload || payload.type !== "scan:start" || cancelled) return;
        setLiveState({
          state: "scanning",
          message: "复诊中",
          updatedAt: payload.updated_at,
          version: payload.version
        });
      });

      eventSource.addEventListener("scan:complete", (event) => {
        const payload = parseLivePayload(event);
        if (!payload || payload.type !== "scan:complete" || cancelled) return;
        applyReport(payload.report);
        setLiveState({
          state: "ready",
          message: "实时监听中",
          updatedAt: payload.updated_at,
          version: payload.version
        });
      });

      eventSource.addEventListener("scan:error", (event) => {
        const payload = parseLivePayload(event);
        if (!payload || payload.type !== "scan:error" || cancelled) return;
        applyReport(payload.report);
        setLiveState({
          state: "error",
          message: payload.message,
          updatedAt: payload.updated_at,
          version: payload.version
        });
      });

      const handleRepairEvent = (event: Event) => {
        const payload = parseLivePayload(event);
        if (!payload || !isRepairPayload(payload) || cancelled) return;
        setBatchRepairState((current) => batchStateFromPayload(payload, current));
        setRepairStates((current) => repairStatesFromPayload(payload, current));
      };
      eventSource.addEventListener("repair:start", handleRepairEvent);
      eventSource.addEventListener("repair:progress", handleRepairEvent);
      eventSource.addEventListener("repair:item-complete", handleRepairEvent);
      eventSource.addEventListener("repair:complete", handleRepairEvent);
      eventSource.addEventListener("repair:error", handleRepairEvent);
      eventSource.addEventListener("repair:batch-start", handleRepairEvent);
      eventSource.addEventListener("repair:item-start", handleRepairEvent);
      eventSource.addEventListener("repair:item-applied", handleRepairEvent);
      eventSource.addEventListener("repair:item-skipped", handleRepairEvent);
      eventSource.addEventListener("repair:rescan-start", handleRepairEvent);
      eventSource.addEventListener("repair:rescan-complete", handleRepairEvent);
      eventSource.addEventListener("repair:batch-complete", handleRepairEvent);

      eventSource.onerror = () => {
        if (cancelled) return;
        eventSource?.close();
        eventSource = undefined;
        startPolling("实时连接中断，已切换为轮询复诊");
      };
    };

    void fetchReport()
      .then((report) => {
        if (cancelled) return;
        applyReport(report);
        setLiveState({
          state: "connecting",
          message: "正在连接实时复诊",
          updatedAt: report.generated_at
        });
        startEvents();
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoadState({ state: "error", message: error instanceof Error ? error.message : "无法加载报告" });
        }
      });

    return () => {
      cancelled = true;
      eventSource?.close();
      if (pollingTimer) window.clearInterval(pollingTimer);
    };
  }, []);

  const startRepair = async (patient: Patient) => {
    setRepairStates((current) => ({
      ...current,
      [patient.id]: {
        status: "running",
        progress: Math.max(4, current[patient.id]?.progress ?? 0),
        message: "治疗任务已提交，正在建立实时进度...",
        jobId: current[patient.id]?.jobId,
        updatedAt: new Date().toISOString(),
        completedFindingIds: [],
        skippedFindingIds: []
      }
    }));

    try {
      const response = await fetch("/api/repairs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ patient_id: patient.id })
      });
      const payload = await response.json().catch(() => null) as { job_id?: string; message?: string } | null;
      if (!response.ok) throw new Error(payload?.message ?? `治疗请求失败：${response.status}`);
      setRepairStates((current) => ({
        ...current,
        [patient.id]: {
          ...current[patient.id],
          status: "running",
          progress: Math.max(current[patient.id]?.progress ?? 0, 8),
          message: payload?.message ?? "治疗任务已创建",
          jobId: payload?.job_id,
          updatedAt: new Date().toISOString(),
          completedFindingIds: current[patient.id]?.completedFindingIds ?? [],
          skippedFindingIds: current[patient.id]?.skippedFindingIds ?? []
        }
      }));
    } catch (error) {
      setRepairStates((current) => ({
        ...current,
        [patient.id]: {
          status: "error",
          progress: current[patient.id]?.progress ?? 0,
          message: error instanceof Error ? error.message : "治疗请求失败",
          jobId: current[patient.id]?.jobId,
          updatedAt: new Date().toISOString(),
          completedFindingIds: current[patient.id]?.completedFindingIds ?? [],
          skippedFindingIds: current[patient.id]?.skippedFindingIds ?? []
        }
      }));
    }
  };

  const startAllRepairs = async () => {
    setBatchRepairState((current) => ({
      ...current,
      status: "running",
      message: "一键治疗任务已提交"
    }));
    try {
      const response = await fetch("/api/repairs/all", { method: "POST" });
      const payload = await response.json().catch(() => null) as {
        job_id?: string;
        total?: number;
        auto_fixable?: number;
        manual_required?: number;
        message?: string;
      } | null;
      if (!response.ok) throw new Error(payload?.message ?? `一键治疗请求失败：${response.status}`);
      setBatchRepairState({
        status: "running",
        jobId: payload?.job_id,
        total: payload?.total ?? 0,
        autoFixable: payload?.auto_fixable ?? 0,
        manualRequired: payload?.manual_required ?? 0,
        message: "一键治疗任务已创建"
      });
    } catch (error) {
      setBatchRepairState((current) => ({
        ...current,
        status: "error",
        message: error instanceof Error ? error.message : "一键治疗请求失败"
      }));
    }
  };

  if (loadState.state === "loading") return <LoadingState />;
  if (loadState.state === "error") return <ErrorState message={loadState.message} />;

  const selectedPatient = loadState.report.patients.find((patient) => patient.id === selectedId) ?? loadState.report.patients[0] ?? null;
  return (
    <Clinic
      report={loadState.report}
      liveState={liveState}
      repairStates={repairStates}
      batchRepairState={batchRepairState}
      selectedPatient={selectedPatient}
      onSelectPatient={setSelectedId}
      onStartRepair={startRepair}
      onStartAllRepairs={startAllRepairs}
    />
  );
}

function Clinic({
  report,
  liveState,
  repairStates,
  batchRepairState,
  selectedPatient,
  onSelectPatient,
  onStartRepair,
  onStartAllRepairs
}: {
  report: SkillDoctorReport;
  liveState: LiveState;
  repairStates: Record<string, RepairState>;
  batchRepairState: BatchRepairState;
  selectedPatient: Patient | null;
  onSelectPatient: (id: string) => void;
  onStartRepair: (patient: Patient) => Promise<void>;
  onStartAllRepairs: () => Promise<void>;
}) {
  const wards = useMemo(() => groupPatientsByWard(report), [report]);
  const projectedScore = useMemo(() => averageProjectedScore(report.patients), [report.patients]);
  const rankedPatients = useMemo(() => sortPatientsByUrgency(report.patients), [report.patients]);
  const recoverySeries = useMemo(() => buildRecoverySeries(report.patients), [report.patients]);
  const severityMix = useMemo(() => severityBreakdown(report.findings), [report.findings]);
  const tone = scoreTone(report.summary.score);
  const projectedGain = Math.max(0, projectedScore - report.summary.score);
  const selectedRepairState = selectedPatient ? repairStates[selectedPatient.id] : undefined;
  const repairableCount = rankedPatients.filter((patient) => patient.issues.length > 0).length;
  const autoFixableCount = rankedPatients.reduce((sum, patient) => sum + patient.issues.filter((issue) => issue.autofix === "safe_autofix").length, 0);
  const manualRequiredCount = rankedPatients.reduce((sum, patient) => sum + patient.issues.filter((issue) => issue.autofix !== "safe_autofix").length, 0);
  const runningRepairCount = batchRepairState.status === "running" || batchRepairState.status === "rescanning"
    ? batchRepairState.total
    : rankedPatients.filter((patient) => repairStates[patient.id]?.status === "running" || repairStates[patient.id]?.status === "rescanning").length;

  return (
    <main className="clinic-shell">
      <header className="app-bar">
        <div className="brand-block">
          <div className="brand-mark" aria-hidden="true">SD</div>
          <div>
            <p className="app-kicker">Skill Doctor 诊疗台</p>
            <h1>Agent 能力诊断报告</h1>
            <p className="generated-at">生成时间：{formatDateTime(report.generated_at)}</p>
          </div>
        </div>

        <div className="app-actions">
          <LivePill liveState={liveState} />
          <TreatAllButton
            count={repairableCount}
            autoFixableCount={autoFixableCount}
            manualRequiredCount={manualRequiredCount}
            runningCount={runningRepairCount}
            onClick={() => {
              void onStartAllRepairs();
            }}
          />
          <GatePill gate={report.summary.gate} />
          <div className={`score-chip tone-${tone}`} aria-label={`整体健康分 ${report.summary.score} 分，满分 100 分`}>
            <Stethoscope aria-hidden="true" size={18} />
            <strong>{report.summary.score}</strong>
            <span>/100</span>
          </div>
          <div className="export-cluster" aria-label="报告导出">
            <ExportButton icon={<FileText size={16} />} label="摘要" onClick={() => downloadText("skill-doctor-summary.md", buildMarkdownSummary(report))} />
            <ExportButton icon={<FileJson size={16} />} label="JSON" onClick={() => downloadText("skill-doctor-report.json", JSON.stringify(report, null, 2))} />
            <ExportButton icon={<Download size={16} />} label="发现项" onClick={() => downloadText("skill-doctor-findings.jsonl", report.findings.map((finding) => JSON.stringify(finding)).join("\n"))} />
            <ExportButton icon={<ImageDown size={16} />} label="PNG" onClick={() => downloadPng(report)} />
          </div>
        </div>
      </header>

      <section className="metric-grid" aria-label="诊疗摘要">
        <MetricCard
          icon={<Gauge size={18} />}
          label="当前健康分"
          value={report.summary.score.toString()}
          suffix="/100"
          detail={`门禁：${displayGate(report.summary.gate)}`}
          tone={tone}
        />
        <MetricCard
          icon={<TrendingUp size={18} />}
          label="预计恢复"
          value={projectedScore.toString()}
          suffix="/100"
          detail={projectedGain > 0 ? `可提升 ${projectedGain} 分` : "已接近最佳状态"}
          tone={scoreTone(projectedScore)}
        />
        <MetricCard
          icon={<ShieldAlert size={18} />}
          label="阻断项"
          value={report.summary.blockers.toString()}
          detail={`${report.summary.warnings} 个警告需要复查`}
          tone={report.summary.blockers > 0 ? "critical" : "excellent"}
        />
        <MetricCard
          icon={<Sparkles size={18} />}
          label="置信度"
          value={`${Math.round(report.summary.confidence * 100)}`}
          suffix="%"
          detail={`${report.patients.length} 个病人已纳入评估`}
          tone="good"
        />
      </section>

      {wards.length === 0 ? (
        <EmptyState />
      ) : (
        <section className="clinic-dashboard" aria-label="诊疗台主体">
          <WardRail wards={wards} selectedPatient={selectedPatient} onSelectPatient={onSelectPatient} />

          <section className="diagnostic-main">
            <div className="insight-grid">
              <RecoveryChart points={recoverySeries} totalCount={report.patients.length} />
              <SeverityDonut breakdown={severityMix} />
            </div>

            <PatientTable patients={rankedPatients} repairStates={repairStates} selectedPatient={selectedPatient} onSelectPatient={onSelectPatient} />
          </section>

          <PatientPanel patient={selectedPatient} repairState={selectedRepairState} onStartRepair={onStartRepair} />
        </section>
      )}
    </main>
  );
}

async function fetchReport(): Promise<SkillDoctorReport> {
  const response = await fetch("/api/report");
  if (!response.ok) throw new Error(`报告请求失败：${response.status}`);
  return response.json() as Promise<SkillDoctorReport>;
}

function parseLivePayload(event: Event): ClinicLivePayload | null {
  try {
    return JSON.parse((event as MessageEvent<string>).data) as ClinicLivePayload;
  } catch {
    return null;
  }
}

function withViewTransition(update: () => void) {
  const documentWithTransition = document as Document & {
    startViewTransition?: (callback: () => void) => { finished: Promise<void> };
  };
  if (typeof documentWithTransition.startViewTransition !== "function") {
    update();
    return;
  }
  void documentWithTransition.startViewTransition(update).finished.catch(() => undefined);
}

function isRepairPayload(payload: ClinicLivePayload): payload is RepairPayload {
  return payload.type.startsWith("repair:");
}

function batchStateFromPayload(payload: RepairPayload, current: BatchRepairState): BatchRepairState {
  switch (payload.type) {
    case "repair:batch-start":
      return {
        status: "running",
        jobId: payload.job_id,
        total: payload.total,
        autoFixable: payload.auto_fixable,
        manualRequired: payload.manual_required,
        message: payload.message
      };
    case "repair:rescan-start":
      return {
        ...current,
        status: "rescanning",
        jobId: payload.job_id,
        message: payload.message
      };
    case "repair:batch-complete":
      return {
        status: "complete",
        jobId: payload.job_id,
        total: payload.total,
        autoFixable: payload.auto_applied,
        manualRequired: payload.manual_required,
        message: payload.message
      };
    case "repair:error":
      return {
        ...current,
        status: "error",
        jobId: payload.job_id,
        message: payload.message
      };
    default:
      return current;
  }
}

function repairStatesFromPayload(
  payload: RepairPayload,
  current: Record<string, RepairState>
): Record<string, RepairState> {
  switch (payload.type) {
    case "repair:item-start":
      return {
        ...current,
        [payload.patient_id]: {
          ...(current[payload.patient_id] ?? emptyRepairState()),
          status: "running",
          progress: clampScore(payload.progress),
          message: payload.message,
          jobId: payload.job_id,
          updatedAt: payload.updated_at
        }
      };
    case "repair:item-applied":
    case "repair:item-complete":
      return updateFindingRepairState(payload, current, "applied");
    case "repair:item-skipped":
      return updateFindingRepairState(payload, current, "skipped");
    case "repair:rescan-start":
      return Object.fromEntries(Object.entries(current).map(([patientId, state]) => [
        patientId,
        state.status === "running" || state.status === "review"
          ? { ...state, status: "rescanning", progress: Math.max(state.progress, 96), message: payload.message, jobId: payload.job_id, updatedAt: payload.updated_at }
          : state
      ]));
    case "repair:start":
    case "repair:progress":
      return {
        ...current,
        [payload.patient_id]: {
          ...(current[payload.patient_id] ?? emptyRepairState()),
          status: "running",
          progress: clampScore(payload.progress),
          message: payload.message,
          jobId: payload.job_id,
          updatedAt: payload.updated_at
        }
      };
    case "repair:complete":
      return {
        ...current,
        [payload.patient_id]: {
          ...(current[payload.patient_id] ?? emptyRepairState()),
          status: "rescanning",
          progress: 96,
          message: "治疗动作完成，等待真实复诊确认。",
          jobId: payload.job_id,
          updatedAt: payload.updated_at
        }
      };
    case "repair:error":
      return {
        ...current,
        [payload.patient_id]: {
          ...(current[payload.patient_id] ?? emptyRepairState()),
          status: "error",
          progress: clampScore(payload.progress),
          message: payload.message,
          jobId: payload.job_id,
          updatedAt: payload.updated_at
        }
      };
    default:
      return current;
  }
}

function updateFindingRepairState(
  payload: Extract<RepairPayload, { type: "repair:item-applied" | "repair:item-complete" | "repair:item-skipped" }>,
  current: Record<string, RepairState>,
  result: "applied" | "skipped"
): Record<string, RepairState> {
  const previous = current[payload.patient_id] ?? emptyRepairState();
  const completedFindingIds = previous.completedFindingIds ?? [];
  const skippedFindingIds = previous.skippedFindingIds ?? [];
  const nextCompleted = result === "applied"
    ? Array.from(new Set([...completedFindingIds, payload.finding_id]))
    : completedFindingIds;
  const nextSkipped = result === "skipped"
    ? Array.from(new Set([...skippedFindingIds, payload.finding_id]))
    : skippedFindingIds;

  return {
    ...current,
    [payload.patient_id]: {
      ...previous,
      status: result === "skipped" ? "review" : "running",
      progress: clampScore(payload.progress),
      message: payload.message,
      jobId: payload.job_id,
      updatedAt: payload.updated_at,
      completedFindingIds: nextCompleted,
      skippedFindingIds: nextSkipped
    }
  };
}

function emptyRepairState(): RepairState {
  return {
    status: "idle",
    progress: 0,
    message: "等待治疗",
    completedFindingIds: [],
    skippedFindingIds: []
  };
}

function LivePill({ liveState }: { liveState: LiveState }) {
  const isScanning = liveState.state === "scanning";
  const icon = isScanning
    ? <RefreshCw aria-hidden="true" size={15} />
    : liveState.state === "error"
      ? <AlertTriangle aria-hidden="true" size={15} />
      : <HeartPulse aria-hidden="true" size={15} />;

  return (
    <span className={`live-pill live-${liveState.state}`} role="status" aria-live="polite" title={liveState.message}>
      {icon}
      <span>{liveStatusLabel(liveState)}</span>
    </span>
  );
}

function liveStatusLabel(liveState: LiveState): string {
  if (liveState.state === "scanning") return "复诊中";
  if (liveState.state === "error") return liveState.message;
  const suffix = liveState.updatedAt ? ` · ${formatClock(liveState.updatedAt)}` : "";
  return `${liveState.message}${suffix}`;
}

function MetricCard({
  icon,
  label,
  value,
  suffix,
  detail,
  tone
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  suffix?: string;
  detail: string;
  tone: Tone;
}) {
  return (
    <article className={`metric-card tone-${tone}`}>
      <div className="metric-icon" aria-hidden="true">{icon}</div>
      <p>{label}</p>
      <div className="metric-value">
        <strong>{value}</strong>
        {suffix ? <span>{suffix}</span> : null}
      </div>
      <small>{detail}</small>
    </article>
  );
}

function WardRail({
  wards,
  selectedPatient,
  onSelectPatient
}: {
  wards: Ward[];
  selectedPatient: Patient | null;
  onSelectPatient: (id: string) => void;
}) {
  return (
    <aside className="ward-rail panel-card" aria-label="病区索引">
      <div className="panel-heading">
        <p>病区索引</p>
        <h2>运行器病区</h2>
      </div>
      <div className="ward-list">
        {wards.map((ward) => {
          const isActive = ward.patients.some((patient) => patient.id === selectedPatient?.id);
          const firstPatient = ward.patients[0];
          return (
            <button
              className={`ward-card ${isActive ? "is-selected" : ""}`}
              key={ward.id}
              type="button"
              onClick={() => {
                if (firstPatient) onSelectPatient(firstPatient.id);
              }}
            >
              <span>
                <strong>{ward.label}</strong>
                <small>{ward.patients.length} 个病人</small>
              </span>
              <span className={`ward-score tone-${scoreTone(ward.averageScore)}`}>{ward.averageScore}</span>
              <HealthBar value={ward.averageScore} projected={ward.averageScore} compact />
            </button>
          );
        })}
      </div>
    </aside>
  );
}

function RecoveryChart({ points, totalCount }: { points: RecoveryPoint[]; totalCount: number }) {
  if (points.length === 0) {
    return (
      <section className="chart-card panel-card" aria-label="恢复走势">
        <ChartHeading icon={<BarChart3 size={18} />} title="恢复走势" caption="暂无病人数据" />
        <div className="chart-empty">暂无可绘制的恢复曲线。</div>
      </section>
    );
  }

  const hiddenCount = Math.max(0, totalCount - points.length);

  return (
    <section className="chart-card panel-card" aria-label="恢复走势">
      <ChartHeading
        icon={<BarChart3 size={18} />}
        title="恢复走势"
        caption={`低分优先展示 ${points.length} 个对象${hiddenCount > 0 ? `，其余 ${hiddenCount} 个在清单中查看` : ""}`}
      />
      <div className="chart-legend">
        <span className="legend-current">当前分</span>
        <span className="legend-projected">预计恢复</span>
        <span className="legend-gain">提升空间</span>
      </div>
      <div className="recovery-viewport" role="img" aria-label="按当前分从低到高排列的恢复走势图">
        <div className="recovery-chart">
        <div className="chart-grid-lines" aria-hidden="true" />
        {points.map((point) => (
          <div className="recovery-column" key={point.id}>
            <span className="column-score current">{point.score}</span>
            <span className="column-score projected">{point.projectedScore}</span>
            <div className="column-track">
              <span
                className="column-projected"
                style={{ height: `${clampScore(point.projectedScore)}%` }}
              />
              <span
                className="column-gain"
                style={{
                  height: `${Math.max(0, clampScore(point.projectedScore) - clampScore(point.score))}%`,
                  bottom: `${clampScore(point.score)}%`
                }}
              />
              <span
                className={`column-current tone-${scoreTone(point.score)}`}
                style={{ height: `${clampScore(point.score)}%` }}
              />
            </div>
            <span className="column-label" title={point.label}>{shortLabel(point.label)}</span>
          </div>
        ))}
        </div>
      </div>
    </section>
  );
}

function SeverityDonut({ breakdown }: { breakdown: SeverityBreakdown }) {
  const rows = severityRows(breakdown);
  return (
    <section className="donut-card panel-card" aria-label="发现项分布">
      <ChartHeading icon={<AlertTriangle size={18} />} title="发现项分布" caption={`${breakdown.total} 个发现项`} />
      {breakdown.total === 0 ? (
        <div className="donut-empty">
          <CheckCircle2 aria-hidden="true" size={28} />
          <span>没有发现问题</span>
        </div>
      ) : (
        <div className="donut-layout">
          <div
            className={`severity-donut ${breakdown.total >= 100 ? "is-large-total" : ""}`}
            role="img"
            aria-label={`严重 ${breakdown.critical} 个，高 ${breakdown.high} 个，中 ${breakdown.medium} 个，低 ${breakdown.low} 个，信息 ${breakdown.info} 个`}
            style={{ background: donutGradient(breakdown) }}
          >
            <span>{breakdown.total}</span>
            <small>发现项</small>
          </div>
          <div className="severity-legend">
            {rows.map((row) => (
              <div className={`severity-row severity-${row.severity}`} key={row.severity}>
                <span>{row.label}</span>
                <strong>{row.count}</strong>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function ChartHeading({ icon, title, caption }: { icon: React.ReactNode; title: string; caption: string }) {
  return (
    <div className="chart-heading">
      <span className="chart-icon" aria-hidden="true">{icon}</span>
      <div>
        <h2>{title}</h2>
        <p>{caption}</p>
      </div>
    </div>
  );
}

function PatientTable({
  patients,
  repairStates,
  selectedPatient,
  onSelectPatient
}: {
  patients: Patient[];
  repairStates: Record<string, RepairState>;
  selectedPatient: Patient | null;
  onSelectPatient: (id: string) => void;
}) {
  return (
    <section className="patient-ledger panel-card" aria-label="病人清单">
      <div className="ledger-heading">
        <div>
          <p>病人清单</p>
          <h2>待诊断对象</h2>
        </div>
        <span>{patients.length} 个对象</span>
      </div>
      <div className="patient-table">
        <div className="patient-row patient-row-head" aria-hidden="true">
          <span>对象</span>
          <span>运行器</span>
          <span>当前分</span>
          <span>预计恢复</span>
          <span>走势</span>
          <span>门禁</span>
        </div>
        {patients.map((patient) => {
          const repairStatus = repairStates[patient.id]?.status;
          const isRepairActive = repairStatus === "running" || repairStatus === "rescanning";
          const isReview = repairStatus === "review";
          const isReportClear = patient.gate === "publishable" && patient.issues.length === 0;

          return (
            <button
              className={`patient-row tone-${scoreTone(patient.score)} ${selectedPatient?.id === patient.id ? "is-selected" : ""} ${isReportClear ? "is-repair-complete" : ""} ${isRepairActive ? "is-repair-active" : ""} ${isReview ? "is-repair-review" : ""}`}
              key={patient.id}
              type="button"
              aria-pressed={selectedPatient?.id === patient.id}
              onClick={() => onSelectPatient(patient.id)}
              style={{ viewTransitionName: patientTransitionName(patient.id) }}
            >
              <span className="patient-identity">
                <span className="patient-avatar" aria-hidden="true">{avatarFor(patient.type)}</span>
                <span>
                  <strong>{patient.name}</strong>
                  <small>{displayPatientType(patient.type)}</small>
                </span>
              </span>
              <span className="runner-pill">{displayRunner(patient.runner)}</span>
              <span className="score-number">{patient.score}</span>
              <span className="score-number projected">{patient.projected_score}</span>
              <MiniSparkline value={patient.score} projected={patient.projected_score} />
              <span className={`status-pill gate-${patient.gate}`}>{displayGate(patient.gate)}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function PatientPanel({
  patient,
  repairState,
  onStartRepair
}: {
  patient: Patient | null;
  repairState: RepairState | undefined;
  onStartRepair: (patient: Patient) => Promise<void>;
}) {
  if (!patient) {
    return (
      <aside className="patient-panel panel-card" aria-label="病人详情">
        <div className="panel-heading">
          <p>病人详情</p>
          <h2>尚未选择病人</h2>
        </div>
      </aside>
    );
  }

  const completedFindingIds = new Set(repairState?.completedFindingIds ?? []);
  const skippedFindingIds = new Set(repairState?.skippedFindingIds ?? []);

  return (
    <aside className="patient-panel panel-card" aria-label={`${patient.name} 诊疗详情`}>
      <div className="patient-panel-head">
        <span className="patient-avatar large" aria-hidden="true">{avatarFor(patient.type)}</span>
        <div>
          <p>{displayRunner(patient.runner)} / {displayPatientType(patient.type)}</p>
          <h2>{patient.name}</h2>
        </div>
      </div>
      <p className="path-line">{patient.path}</p>

      <SummaryMeter label="恢复进度" value={patient.score} projected={patient.projected_score} tone={scoreTone(patient.score)} />

      <div className="diagnosis-row">
        <span>{summarizeFindingCount(patient)}</span>
        <span className={`status-pill gate-${patient.gate}`}>{displayGate(patient.gate)}</span>
      </div>

      <RepairControls patient={patient} state={repairState} onStartRepair={onStartRepair} />

      <div className="treatment-list">
        <h3>治疗队列</h3>
        {patient.issues.length === 0 ? (
          <p className="quiet">无需治疗。</p>
        ) : (
          patient.issues.map((issue) => {
            const isSkipped = skippedFindingIds.has(issue.id);
            return (
            <article className={`finding severity-${issue.severity} ${completedFindingIds.has(issue.id) ? "is-resolved" : ""} ${isSkipped ? "is-skipped" : ""}`} key={issue.id}>
              <div className="finding-head">
                <strong>{issue.rule_id}</strong>
                <span>{isSkipped ? "需确认" : displaySeverity(issue.severity)}</span>
              </div>
              <p>{issue.message}</p>
              <small>{issue.file}{issue.span ? `:${issue.span.line}` : ""} / {issue.evidence}</small>
              <p className="suggestion">{issue.suggestion}</p>
            </article>
            );
          })
        )}
      </div>
    </aside>
  );
}

function RepairControls({
  patient,
  state,
  onStartRepair
}: {
  patient: Patient;
  state: RepairState | undefined;
  onStartRepair: (patient: Patient) => Promise<void>;
}) {
  const repairState = state ?? {
    status: "idle" as const,
    progress: 0,
    message: patient.issues.length === 0 ? "当前对象无需治疗。" : repairReadiness(patient)
  };
  const hasIssues = patient.issues.length > 0;
  const isRunning = repairState.status === "running" || repairState.status === "rescanning";
  const isComplete = repairState.status === "complete" && patient.issues.length === 0;
  const isReview = repairState.status === "review";
  const actionLabel = isComplete
    ? "再次检查"
    : repairState.status === "rescanning"
      ? "复诊中"
      : repairState.status === "running"
        ? "治疗中"
        : isReview
          ? "再次治疗"
          : "开始治疗";

  return (
    <section className={`repair-card repair-${repairState.status}`} aria-label="治疗控制" aria-live="polite">
      <div className="repair-head">
        <div>
          <p>治疗控制</p>
          <h3>{hasIssues ? isReview ? "需要人工确认" : "可启动真实治疗流程" : "状态健康"}</h3>
        </div>
        <span className={`repair-badge repair-${repairState.status}`}>
          {isComplete ? <CheckCircle2 aria-hidden="true" size={15} /> : <Sparkles aria-hidden="true" size={15} />}
          {repairStatusLabel(repairState.status)}
        </span>
      </div>
      <div className="repair-progress-row">
        <span>治疗进度</span>
        <strong>{Math.round(clampScore(repairState.progress))}%</strong>
      </div>
      <div className="repair-meter" aria-label={`治疗进度 ${Math.round(clampScore(repairState.progress))}%`}>
        <span style={{ width: `${clampScore(repairState.progress)}%` }} />
      </div>
      <p className="repair-message">{repairState.message}</p>
      {isComplete ? <p className="repair-done">真实复诊通过。该对象已进入可发布状态，并会在清单中自然后移。</p> : null}
      {isReview ? <p className="repair-review-note">复诊后仍有发现项，未被自动消除的问题已进入人工确认队列。</p> : null}
      <button
        className="repair-button"
        type="button"
        disabled={!hasIssues || isRunning}
        onClick={() => {
          void onStartRepair(patient);
        }}
      >
        {isRunning ? <RefreshCw aria-hidden="true" size={16} /> : isComplete ? <CheckCircle2 aria-hidden="true" size={16} /> : <Sparkles aria-hidden="true" size={16} />}
        <span>{hasIssues ? actionLabel : "无需治疗"}</span>
      </button>
    </section>
  );
}

function SummaryMeter({ label, value, projected, tone }: { label: string; value: number; projected?: number; tone: Tone }) {
  return (
    <div className="meter-block">
      <div className="meter-label">
        <span>{label}</span>
        <strong>{value}/100</strong>
      </div>
      <div className="meter" aria-label={`${label} ${value} 分，满分 100 分${projected !== undefined ? `，预计恢复到 ${projected} 分` : ""}`}>
        {projected !== undefined ? <span className="meter-projected" style={{ width: `${clampScore(projected)}%` }} /> : null}
        <span className={`meter-fill tone-${tone}`} style={{ width: `${clampScore(value)}%` }} />
      </div>
    </div>
  );
}

function HealthBar({ value, projected, compact = false }: { value: number; projected: number; compact?: boolean }) {
  return (
    <span className={`healthbar ${compact ? "compact" : ""}`} aria-label={`当前健康分 ${value}，预计恢复到 ${projected}`}>
      <span className="healthbar-projected" style={{ width: `${clampScore(projected)}%` }} />
      <span className={`healthbar-fill tone-${scoreTone(value)}`} style={{ width: `${clampScore(value)}%` }} />
    </span>
  );
}

function MiniSparkline({ value, projected }: { value: number; projected: number }) {
  return (
    <span className="mini-sparkline" aria-hidden="true">
      <span style={{ height: `${Math.max(12, clampScore(value))}%` }} />
      <span style={{ height: `${Math.max(12, clampScore(projected))}%` }} />
    </span>
  );
}

function TreatAllButton({
  count,
  autoFixableCount,
  manualRequiredCount,
  runningCount,
  onClick
}: {
  count: number;
  autoFixableCount: number;
  manualRequiredCount: number;
  runningCount: number;
  onClick: () => void;
}) {
  const disabled = count === 0 || runningCount > 0;
  const label = count === 0 ? "全部可发布" : runningCount > 0 ? `治疗中 ${runningCount}` : "一键治疗";

  return (
    <button className={`treat-all-button ${runningCount > 0 ? "is-running" : ""}`} type="button" disabled={disabled} onClick={onClick}>
      {runningCount > 0 ? <RefreshCw aria-hidden="true" size={16} /> : <Sparkles aria-hidden="true" size={16} />}
      <span>{label}</span>
      {runningCount > 0 ? <strong>{runningCount}</strong> : null}
      {runningCount === 0 && autoFixableCount > 0 ? <strong>{autoFixableCount} 可自动</strong> : null}
      {runningCount === 0 && manualRequiredCount > 0 ? <strong className="manual-count">{manualRequiredCount} 需确认</strong> : null}
    </button>
  );
}

function repairReadiness(patient: Patient): string {
  const autoFixable = patient.issues.filter((issue) => issue.autofix === "safe_autofix").length;
  const reviewRequired = patient.issues.filter((issue) => issue.autofix === "review_required").length;
  if (autoFixable > 0) return `${autoFixable} 个发现项可安全治疗，${reviewRequired} 个需要复核。`;
  if (reviewRequired > 0) return `${reviewRequired} 个发现项需要先生成治疗方案并人工确认。`;
  return "当前发现项需要人工处理，诊疗台会生成清晰的治疗步骤。";
}

function repairStatusLabel(status: RepairState["status"]): string {
  switch (status) {
    case "idle":
      return "待治疗";
    case "running":
      return "治疗中";
    case "rescanning":
      return "待复诊";
    case "review":
      return "需确认";
    case "complete":
      return "已完成";
    case "error":
      return "失败";
  }
}

function GatePill({ gate }: { gate: SkillDoctorReport["summary"]["gate"] }) {
  const isClear = gate === "publishable";
  return (
    <span className={`gate-pill gate-${gate}`}>
      {isClear ? <CheckCircle2 aria-hidden="true" size={16} /> : <ShieldAlert aria-hidden="true" size={16} />}
      {displayGate(gate)}
    </span>
  );
}

function ExportButton({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button className="export-button" type="button" onClick={onClick}>
      {icon}
      <span>{label}</span>
    </button>
  );
}

function EmptyState() {
  return (
    <section className="empty-state panel-card" role="status">
      <Activity aria-hidden="true" />
      <h2>没有发现病人</h2>
      <p>请对包含 skills、hooks、subagents 或运行器配置的 home 目录或 fixture 运行诊疗台。</p>
    </section>
  );
}

function LoadingState() {
  return (
    <main className="center-state" aria-busy="true">
      <Stethoscope aria-hidden="true" />
      <h1>正在准备诊疗台</h1>
      <p>正在读取治疗报告...</p>
    </main>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <main className="center-state" role="alert">
      <Activity aria-hidden="true" />
      <h1>报告加载失败</h1>
      <p>{message}</p>
    </main>
  );
}

function avatarFor(type: Patient["type"]): string {
  switch (type) {
    case "skill":
      return "SK";
    case "hook":
      return "HK";
    case "subagent":
      return "AG";
    case "config":
      return "CF";
    case "folder":
      return "FD";
  }
}

function donutGradient(breakdown: SeverityBreakdown): string {
  const colors: Record<Severity, string> = {
    critical: "var(--severity-critical)",
    high: "var(--severity-high)",
    medium: "var(--severity-medium)",
    low: "var(--severity-low)",
    info: "var(--severity-info)"
  };
  let cursor = 0;
  const segments = severityRows(breakdown)
    .filter((row) => row.count > 0)
    .map((row) => {
      const start = cursor;
      const degrees = row.count / breakdown.total * 360;
      cursor += degrees;
      return `${colors[row.severity]} ${start}deg ${cursor}deg`;
    });
  return `conic-gradient(${segments.join(", ")})`;
}

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function downloadPng(report: SkillDoctorReport) {
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 630;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const projectedScore = averageProjectedScore(report.patients);
  ctx.fillStyle = "#f7f8fb";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#ffffff";
  roundRect(ctx, 56, 56, 1088, 518, 28);
  ctx.fill();
  ctx.strokeStyle = "#e6eaf0";
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = "#121722";
  ctx.font = "700 48px system-ui, sans-serif";
  ctx.fillText("Skill Doctor 诊疗台", 104, 132);
  ctx.font = "600 30px system-ui, sans-serif";
  ctx.fillText(`健康分：${report.summary.score}/100`, 104, 210);
  ctx.fillText(`预计恢复：${projectedScore}/100`, 104, 260);
  ctx.fillText(`门禁：${displayGate(report.summary.gate)}`, 104, 310);

  ctx.fillStyle = "#edf7fd";
  roundRect(ctx, 104, 370, 820, 44, 22);
  ctx.fill();
  ctx.fillStyle = "#13a8e5";
  roundRect(ctx, 104, 370, Math.round(820 * report.summary.score / 100), 44, 22);
  ctx.fill();

  ctx.fillStyle = "#68717d";
  ctx.font = "24px system-ui, sans-serif";
  ctx.fillText(`${report.patients.length} 个病人 / ${report.summary.blockers} 个阻断项 / ${report.summary.warnings} 个警告`, 104, 480);

  const url = canvas.toDataURL("image/png");
  const link = document.createElement("a");
  link.href = url;
  link.download = "skill-doctor-clinic.png";
  link.click();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, score));
}

function shortLabel(label: string): string {
  if (label.length <= 10) return label;
  return `${label.slice(0, 9)}…`;
}

function patientTransitionName(id: string): string {
  return `patient-${id.replace(/[^a-zA-Z0-9_-]/gu, "-")}`;
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function formatClock(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(date);
}
