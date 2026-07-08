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
  ShieldAlert,
  Sparkles,
  Stethoscope,
  TrendingUp
} from "lucide-react";
import {
  averageProjectedScore,
  buildRecoverySeries,
  groupPatientsByWard,
  scoreTone,
  severityBreakdown,
  summarizeFindingCount
} from "./report-model.js";
import type { RecoveryPoint, SeverityBreakdown, Tone, Ward } from "./report-model.js";
import type { Patient, Severity, SkillDoctorReport } from "./types.js";

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
        if (!response.ok) throw new Error(`报告请求失败：${response.status}`);
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
          setLoadState({ state: "error", message: error instanceof Error ? error.message : "无法加载报告" });
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
  const projectedScore = useMemo(() => averageProjectedScore(report.patients), [report.patients]);
  const recoverySeries = useMemo(() => buildRecoverySeries(report.patients), [report.patients]);
  const severityMix = useMemo(() => severityBreakdown(report.findings), [report.findings]);
  const tone = scoreTone(report.summary.score);
  const projectedGain = Math.max(0, projectedScore - report.summary.score);

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
          <GatePill gate={report.summary.gate} />
          <div className={`score-chip tone-${tone}`} aria-label={`整体健康分 ${report.summary.score} 分，满分 100 分`}>
            <Stethoscope aria-hidden="true" size={18} />
            <strong>{report.summary.score}</strong>
            <span>/100</span>
          </div>
          <div className="export-cluster" aria-label="报告导出">
            <ExportButton icon={<FileText size={16} />} label="摘要" onClick={() => downloadText("skill-doctor-summary.md", markdownSummary(report))} />
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
              <RecoveryChart points={recoverySeries} />
              <SeverityDonut breakdown={severityMix} />
            </div>

            <PatientTable patients={report.patients} selectedPatient={selectedPatient} onSelectPatient={onSelectPatient} />
          </section>

          <PatientPanel patient={selectedPatient} />
        </section>
      )}
    </main>
  );
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

function RecoveryChart({ points }: { points: RecoveryPoint[] }) {
  if (points.length === 0) {
    return (
      <section className="chart-card panel-card" aria-label="恢复走势">
        <ChartHeading icon={<BarChart3 size={18} />} title="恢复走势" caption="暂无病人数据" />
        <div className="chart-empty">暂无可绘制的恢复曲线。</div>
      </section>
    );
  }

  return (
    <section className="chart-card panel-card" aria-label="恢复走势">
      <ChartHeading icon={<BarChart3 size={18} />} title="恢复走势" caption="当前分与预计恢复分对比" />
      <div className="recovery-chart" role="img" aria-label="病人当前健康分与预计恢复分阶梯图">
        <div className="chart-grid-lines" aria-hidden="true" />
        {points.map((point) => (
          <div className="recovery-column" key={point.id}>
            <div className="column-track">
              <span
                className="column-projected"
                style={{ height: `${clampScore(point.projectedScore)}%` }}
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
            className="severity-donut"
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
  selectedPatient,
  onSelectPatient
}: {
  patients: Patient[];
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
        {patients.map((patient) => (
          <button
            className={`patient-row tone-${scoreTone(patient.score)} ${selectedPatient?.id === patient.id ? "is-selected" : ""}`}
            key={patient.id}
            type="button"
            aria-pressed={selectedPatient?.id === patient.id}
            onClick={() => onSelectPatient(patient.id)}
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
        ))}
      </div>
    </section>
  );
}

function PatientPanel({ patient }: { patient: Patient | null }) {
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

      <div className="treatment-list">
        <h3>治疗队列</h3>
        {patient.issues.length === 0 ? (
          <p className="quiet">无需治疗。</p>
        ) : (
          patient.issues.map((issue) => (
            <article className={`finding severity-${issue.severity}`} key={issue.id}>
              <div className="finding-head">
                <strong>{issue.rule_id}</strong>
                <span>{displaySeverity(issue.severity)}</span>
              </div>
              <p>{issue.message}</p>
              <small>{issue.file}{issue.span ? `:${issue.span.line}` : ""} / {issue.evidence}</small>
              <p className="suggestion">{issue.suggestion}</p>
            </article>
          ))
        )}
      </div>
    </aside>
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

function displayRunner(runner: Patient["runner"]): string {
  switch (runner) {
    case "codex":
      return "Codex";
    case "claude":
      return "Claude";
    case "generic":
      return "通用";
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

function displaySeverity(severity: Severity): string {
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

function severityRows(breakdown: SeverityBreakdown): Array<{ severity: Severity; label: string; count: number }> {
  return [
    { severity: "critical", label: "严重", count: breakdown.critical },
    { severity: "high", label: "高", count: breakdown.high },
    { severity: "medium", label: "中", count: breakdown.medium },
    { severity: "low", label: "低", count: breakdown.low },
    { severity: "info", label: "信息", count: breakdown.info }
  ];
}

function donutGradient(breakdown: SeverityBreakdown): string {
  const colors: Record<Severity, string> = {
    critical: "var(--danger)",
    high: "var(--red)",
    medium: "var(--amber)",
    low: "var(--blue)",
    info: "var(--muted)"
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
