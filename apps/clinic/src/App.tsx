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
          <p className="eyebrow">Skill Doctor Clinic</p>
          <h1>Agent capability patients are under observation.</h1>
        </div>
        <div className={`score-terminal tone-${tone}`} aria-label={`Overall health score ${report.summary.score} of 100`}>
          <Stethoscope aria-hidden="true" size={22} />
          <span>{report.summary.score}</span>
          <small>/100</small>
        </div>
      </header>

      <section className="summary-band" aria-label="Clinic summary">
        <SummaryMeter label="Bloodline" value={report.summary.score} tone={tone} />
        <div className="summary-stat">
          <span>Gate</span>
          <strong>{report.summary.gate}</strong>
        </div>
        <div className="summary-stat">
          <span>Confidence</span>
          <strong>{Math.round(report.summary.confidence * 100)}%</strong>
        </div>
        <div className="summary-stat">
          <span>Blockers</span>
          <strong>{report.summary.blockers}</strong>
        </div>
      </section>

      <section className="toolbar" aria-label="Report exports">
        <ExportButton icon={<FileText size={16} />} label="Summary" onClick={() => downloadText("skill-doctor-summary.md", markdownSummary(report))} />
        <ExportButton icon={<FileJson size={16} />} label="JSON" onClick={() => downloadText("skill-doctor-report.json", JSON.stringify(report, null, 2))} />
        <ExportButton icon={<Download size={16} />} label="Findings" onClick={() => downloadText("skill-doctor-findings.jsonl", report.findings.map((finding) => JSON.stringify(finding)).join("\n"))} />
        <ExportButton icon={<ImageDown size={16} />} label="PNG" onClick={() => downloadPng(report)} />
      </section>

      {wards.length === 0 ? (
        <section className="empty-state" role="status">
          <Activity aria-hidden="true" />
          <h2>No patients discovered</h2>
          <p>Run the clinic against a home directory or fixture that contains skills, hooks, subagents, or runner config.</p>
        </section>
      ) : (
        <section className="clinic-grid">
          <div className="wards" aria-label="Wards">
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
                      <span className="patient-kind">{patient.type}</span>
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
      <aside className="patient-panel" aria-label="Patient details">
        <h2>No patient selected</h2>
      </aside>
    );
  }

  return (
    <aside className="patient-panel" aria-label={`${patient.name} treatment details`}>
      <div className="panel-head">
        <span className="patient-avatar large" aria-hidden="true">{avatarFor(patient.type)}</span>
        <div>
          <p className="eyebrow">{patient.runner} · {patient.type}</p>
          <h2>{patient.name}</h2>
          <p className="path-line">{patient.path}</p>
        </div>
      </div>
      <SummaryMeter label="Recovery" value={patient.score} projected={patient.projected_score} tone={scoreTone(patient.score)} />
      <div className="diagnosis-row">
        <span>{summarizeFindingCount(patient)}</span>
        <span>{patient.gate}</span>
      </div>

      <div className="treatment-list">
        <h3>Treatment Queue</h3>
        {patient.issues.length === 0 ? (
          <p className="quiet">No treatment needed.</p>
        ) : (
          patient.issues.map((issue) => (
            <article className={`finding tone-${scoreTone(100 - issue.deduction * 2)}`} key={issue.id}>
              <div>
                <strong>{issue.rule_id}</strong>
                <span>{issue.severity}</span>
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
      <h1>Preparing the clinic</h1>
      <p>Reading the treatment report...</p>
    </main>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <main className="center-state" role="alert">
      <Activity aria-hidden="true" />
      <h1>Report could not be loaded</h1>
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
    "# Skill Doctor Treatment Report",
    "",
    `Health Score: ${report.summary.score} / 100`,
    `Gate: ${report.summary.gate}`,
    `Confidence: ${report.summary.confidence}`,
    "",
    ...report.patients.map((patient) => `- ${patient.name}: ${patient.score}/100 (${patient.gate})`)
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
  ctx.fillText("Skill Doctor Clinic", 64, 100);
  ctx.font = "32px monospace";
  ctx.fillText(`Health Score: ${report.summary.score}/100`, 64, 170);
  ctx.fillText(`Gate: ${report.summary.gate}`, 64, 220);
  ctx.fillStyle = "#2b3a42";
  ctx.fillRect(64, 270, 800, 44);
  ctx.fillStyle = "#79c267";
  ctx.fillRect(64, 270, Math.round(800 * report.summary.score / 100), 44);
  ctx.fillStyle = "#f6f0df";
  ctx.font = "24px monospace";
  ctx.fillText(`${report.patients.length} patients · ${report.summary.blockers} blockers · ${report.summary.warnings} warnings`, 64, 370);
  const url = canvas.toDataURL("image/png");
  const link = document.createElement("a");
  link.href = url;
  link.download = "skill-doctor-clinic.png";
  link.click();
}
