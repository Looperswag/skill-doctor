import { useEffect, useMemo, useState } from "react";
import { Activity, Download, FileJson, FileText, ImageDown, Stethoscope } from "lucide-react";
import { groupPatientsByWard, scoreTone, summarizeFindingCount } from "./report-model.js";
import type { Patient, SkillDoctorReport } from "./types.js";

type LoadState =
  | { state: "loading" }
  | { state: "error"; message: string }
  | { state: "ready"; report: SkillDoctorReport };

export function App() {
  const [loadState, setLoadState] = useState<LoadState>({ state: "loading" });
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/report")
      .then((response) => {
        if (!response.ok) throw new Error(`Report request failed with ${response.status}`);
        return response.json() as Promise<SkillDoctorReport>;
      })
      .then((report) => {
        if (!cancelled) {
          setLoadState({ state: "ready", report });
          setSelectedId(report.patients[0]?.id ?? null);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoadState({ state: "error", message: error instanceof Error ? error.message : "Unable to load report" });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loadState.state === "loading") return <LoadingState />;
  if (loadState.state === "error") return <ErrorState message={loadState.message} />;

  const selectedPatient = loadState.report.patients.find((patient) => patient.id === selectedId) ?? loadState.report.patients[0] ?? null;
  return (
    <Clinic report={loadState.report} selectedPatient={selectedPatient} onSelectPatient={setSelectedId} />
  );
}

function Clinic({
  report,
  selectedPatient,
  onSelectPatient
}: {
  report: SkillDoctorReport;
  selectedPatient: Patient | null;
  onSelectPatient: (id: string) => void;
}) {
  const wards = useMemo(() => groupPatientsByWard(report), [report]);
  const tone = scoreTone(report.summary.score);

  return (
    <main className="clinic-shell">
      <header className="clinic-header">
        <div>
          <p className="eyebrow">Skill Doctor 诊疗台</p>
          <h1>Agent 能力病人正在接受观察。</h1>
        </div>
        <div className={`score-terminal tone-${tone}`} aria-label={`整体健康分 ${report.summary.score} 分，满分 100 分`}>
          <Stethoscope aria-hidden="true" size={22} />
          <span>{report.summary.score}</span>
          <small>/100</small>
        </div>
      </header>

      <section className="summary-band" aria-label="Clinic summary">
        <SummaryMeter label="总血条" value={report.summary.score} tone={tone} />
        <div className="summary-stat">
          <span>门禁</span>
          <strong>{displayGate(report.summary.gate)}</strong>
        </div>
        <div className="summary-stat">
          <span>置信度</span>
          <strong>{Math.round(report.summary.confidence * 100)}%</strong>
        </div>
        <div className="summary-stat">
          <span>阻断项</span>
          <strong>{report.summary.blockers}</strong>
        </div>
      </section>

      <section className="toolbar" aria-label="报告导出">
        <ExportButton icon={<FileText size={16} />} label="摘要" onClick={() => downloadText("skill-doctor-summary.md", markdownSummary(report))} />
        <ExportButton icon={<FileJson size={16} />} label="JSON" onClick={() => downloadText("skill-doctor-report.json", JSON.stringify(report, null, 2))} />
        <ExportButton icon={<Download size={16} />} label="发现项" onClick={() => downloadText("skill-doctor-findings.jsonl", report.findings.map((finding) => JSON.stringify(finding)).join("\n"))} />
        <ExportButton icon={<ImageDown size={16} />} label="PNG" onClick={() => downloadPng(report)} />
      </section>

      {wards.length === 0 ? (
        <section className="empty-state" role="status">
          <Activity aria-hidden="true" />
          <h2>没有发现病人</h2>
          <p>请对包含 skills、hooks、subagents 或运行器配置的 home 目录或 fixture 运行诊疗台。</p>
        </section>
      ) : (
        <section className="clinic-grid" aria-label="诊疗台主体">
          <div className="wards" aria-label="病区">
            {wards.map((ward) => (
              <section className="ward" key={ward.id}>
                <div className="ward-heading">
                  <h2>{ward.label}</h2>
                  <span>{ward.averageScore}/100</span>
                </div>
                <div className="patient-grid">
                  {ward.patients.map((patient) => (
                    <button
                      className={`patient-tile tone-${scoreTone(patient.score)} ${selectedPatient?.id === patient.id ? "is-selected" : ""}`}
                      key={patient.id}
                      type="button"
                      onClick={() => onSelectPatient(patient.id)}
                    >
                      <span className="patient-avatar" aria-hidden="true">{avatarFor(patient.type)}</span>
                      <span className="patient-name">{patient.name}</span>
                      <span className="patient-kind">{displayPatientType(patient.type)}</span>
                      <HealthBar value={patient.score} projected={patient.projected_score} />
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>

          <PatientPanel patient={selectedPatient} />
        </section>
      )}
    </main>
  );
}

function PatientPanel({ patient }: { patient: Patient | null }) {
  if (!patient) {
    return (
      <aside className="patient-panel" aria-label="病人详情">
        <h2>尚未选择病人</h2>
      </aside>
    );
  }

  return (
    <aside className="patient-panel" aria-label={`${patient.name} 诊疗详情`}>
      <div className="panel-head">
        <span className="patient-avatar large" aria-hidden="true">{avatarFor(patient.type)}</span>
        <div>
          <p className="eyebrow">{patient.runner} · {displayPatientType(patient.type)}</p>
          <h2>{patient.name}</h2>
          <p className="path-line">{patient.path}</p>
        </div>
      </div>
      <SummaryMeter label="恢复进度" value={patient.score} projected={patient.projected_score} tone={scoreTone(patient.score)} />
      <div className="diagnosis-row">
        <span>{summarizeFindingCount(patient)}</span>
        <span>{displayGate(patient.gate)}</span>
      </div>

      <div className="treatment-list">
        <h3>治疗队列</h3>
        {patient.issues.length === 0 ? (
          <p className="quiet">无需治疗。</p>
        ) : (
          patient.issues.map((issue) => (
            <article className={`finding tone-${scoreTone(100 - issue.deduction * 2)}`} key={issue.id}>
              <div>
                <strong>{issue.rule_id}</strong>
                <span>{displaySeverity(issue.severity)}</span>
              </div>
              <p>{issue.message}</p>
              <small>{issue.file}{issue.span ? `:${issue.span.line}` : ""} · {issue.evidence}</small>
              <p className="suggestion">{issue.suggestion}</p>
            </article>
          ))
        )}
      </div>
    </aside>
  );
}

function SummaryMeter({ label, value, projected, tone }: { label: string; value: number; projected?: number; tone: string }) {
  return (
    <div className="meter-block">
      <div className="meter-label">
        <span>{label}</span>
        <strong>{value}/100</strong>
      </div>
      <div className="meter" aria-hidden="true">
        {projected !== undefined ? <span className="meter-projected" style={{ width: `${projected}%` }} /> : null}
        <span className={`meter-fill tone-${tone}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function HealthBar({ value, projected }: { value: number; projected: number }) {
  return (
    <span className="healthbar" aria-label={`Health ${value}, projected ${projected}`}>
      <span className="healthbar-projected" style={{ width: `${projected}%` }} />
      <span className="healthbar-fill" style={{ width: `${value}%` }} />
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

function displayPatientType(type: Patient["type"]): string {
  switch (type) {
    case "skill":
      return "技能";
    case "hook":
      return "Hook";
    case "subagent":
      return "子代理";
    case "config":
      return "配置";
    case "folder":
      return "文件夹";
  }
}

function displayGate(gate: SkillDoctorReport["summary"]["gate"]): string {
  switch (gate) {
    case "publishable":
      return "可发布";
    case "warning":
      return "警告";
    case "blocked":
      return "阻断";
    case "unknown":
      return "未知";
  }
}

function displaySeverity(severity: Patient["issues"][number]["severity"]): string {
  switch (severity) {
    case "critical":
      return "严重";
    case "high":
      return "高";
    case "medium":
      return "中";
    case "low":
      return "低";
    case "info":
      return "信息";
  }
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

function markdownSummary(report: SkillDoctorReport): string {
  return [
    "# Skill Doctor 治疗报告",
    "",
    `健康分：${report.summary.score} / 100`,
    `门禁：${displayGate(report.summary.gate)}`,
    `置信度：${report.summary.confidence}`,
    "",
    ...report.patients.map((patient) => `- ${patient.name}: ${patient.score}/100（${displayGate(patient.gate)}）`)
  ].join("\n");
}

function downloadPng(report: SkillDoctorReport) {
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 630;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.fillStyle = "#101820";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#f6f0df";
  ctx.font = "bold 48px monospace";
  ctx.fillText("Skill Doctor 诊疗台", 64, 100);
  ctx.font = "32px monospace";
  ctx.fillText(`健康分：${report.summary.score}/100`, 64, 170);
  ctx.fillText(`门禁：${displayGate(report.summary.gate)}`, 64, 220);
  ctx.fillStyle = "#2b3a42";
  ctx.fillRect(64, 270, 800, 44);
  ctx.fillStyle = "#79c267";
  ctx.fillRect(64, 270, Math.round(800 * report.summary.score / 100), 44);
  ctx.fillStyle = "#f6f0df";
  ctx.font = "24px monospace";
  ctx.fillText(`${report.patients.length} 个病人 · ${report.summary.blockers} 个阻断项 · ${report.summary.warnings} 个警告`, 64, 370);
  const url = canvas.toDataURL("image/png");
  const link = document.createElement("a");
  link.href = url;
  link.download = "skill-doctor-clinic.png";
  link.click();
}
