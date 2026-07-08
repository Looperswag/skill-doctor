import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { Activity, Download, FileJson, FileText, ImageDown, Stethoscope } from "lucide-react";
import { groupPatientsByWard, scoreTone, summarizeFindingCount } from "./report-model.js";
export function App() {
    const [loadState, setLoadState] = useState({ state: "loading" });
    const [selectedId, setSelectedId] = useState(null);
    useEffect(() => {
        let cancelled = false;
        fetch("/api/report")
            .then((response) => {
            if (!response.ok)
                throw new Error(`Report request failed with ${response.status}`);
            return response.json();
        })
            .then((report) => {
            if (!cancelled) {
                setLoadState({ state: "ready", report });
                setSelectedId(report.patients[0]?.id ?? null);
            }
        })
            .catch((error) => {
            if (!cancelled) {
                setLoadState({ state: "error", message: error instanceof Error ? error.message : "Unable to load report" });
            }
        });
        return () => {
            cancelled = true;
        };
    }, []);
    if (loadState.state === "loading")
        return _jsx(LoadingState, {});
    if (loadState.state === "error")
        return _jsx(ErrorState, { message: loadState.message });
    const selectedPatient = loadState.report.patients.find((patient) => patient.id === selectedId) ?? loadState.report.patients[0] ?? null;
    return (_jsx(Clinic, { report: loadState.report, selectedPatient: selectedPatient, onSelectPatient: setSelectedId }));
}
function Clinic({ report, selectedPatient, onSelectPatient }) {
    const wards = useMemo(() => groupPatientsByWard(report), [report]);
    const tone = scoreTone(report.summary.score);
    return (_jsxs("main", { className: "clinic-shell", children: [_jsxs("header", { className: "clinic-header", children: [_jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "Skill Doctor Clinic" }), _jsx("h1", { children: "Agent capability patients are under observation." })] }), _jsxs("div", { className: `score-terminal tone-${tone}`, "aria-label": `Overall health score ${report.summary.score} of 100`, children: [_jsx(Stethoscope, { "aria-hidden": "true", size: 22 }), _jsx("span", { children: report.summary.score }), _jsx("small", { children: "/100" })] })] }), _jsxs("section", { className: "summary-band", "aria-label": "Clinic summary", children: [_jsx(SummaryMeter, { label: "Bloodline", value: report.summary.score, tone: tone }), _jsxs("div", { className: "summary-stat", children: [_jsx("span", { children: "Gate" }), _jsx("strong", { children: report.summary.gate })] }), _jsxs("div", { className: "summary-stat", children: [_jsx("span", { children: "Confidence" }), _jsxs("strong", { children: [Math.round(report.summary.confidence * 100), "%"] })] }), _jsxs("div", { className: "summary-stat", children: [_jsx("span", { children: "Blockers" }), _jsx("strong", { children: report.summary.blockers })] })] }), _jsxs("section", { className: "toolbar", "aria-label": "Report exports", children: [_jsx(ExportButton, { icon: _jsx(FileText, { size: 16 }), label: "Summary", onClick: () => downloadText("skill-doctor-summary.md", markdownSummary(report)) }), _jsx(ExportButton, { icon: _jsx(FileJson, { size: 16 }), label: "JSON", onClick: () => downloadText("skill-doctor-report.json", JSON.stringify(report, null, 2)) }), _jsx(ExportButton, { icon: _jsx(Download, { size: 16 }), label: "Findings", onClick: () => downloadText("skill-doctor-findings.jsonl", report.findings.map((finding) => JSON.stringify(finding)).join("\n")) }), _jsx(ExportButton, { icon: _jsx(ImageDown, { size: 16 }), label: "PNG", onClick: () => downloadPng(report) })] }), wards.length === 0 ? (_jsxs("section", { className: "empty-state", role: "status", children: [_jsx(Activity, { "aria-hidden": "true" }), _jsx("h2", { children: "No patients discovered" }), _jsx("p", { children: "Run the clinic against a home directory or fixture that contains skills, hooks, subagents, or runner config." })] })) : (_jsxs("section", { className: "clinic-grid", children: [_jsx("div", { className: "wards", "aria-label": "Wards", children: wards.map((ward) => (_jsxs("section", { className: "ward", children: [_jsxs("div", { className: "ward-heading", children: [_jsx("h2", { children: ward.label }), _jsxs("span", { children: [ward.averageScore, "/100"] })] }), _jsx("div", { className: "patient-grid", children: ward.patients.map((patient) => (_jsxs("button", { className: `patient-tile tone-${scoreTone(patient.score)} ${selectedPatient?.id === patient.id ? "is-selected" : ""}`, type: "button", onClick: () => onSelectPatient(patient.id), children: [_jsx("span", { className: "patient-avatar", "aria-hidden": "true", children: avatarFor(patient.type) }), _jsx("span", { className: "patient-name", children: patient.name }), _jsx("span", { className: "patient-kind", children: patient.type }), _jsx(HealthBar, { value: patient.score, projected: patient.projected_score })] }, patient.id))) })] }, ward.id))) }), _jsx(PatientPanel, { patient: selectedPatient })] }))] }));
}
function PatientPanel({ patient }) {
    if (!patient) {
        return (_jsx("aside", { className: "patient-panel", "aria-label": "Patient details", children: _jsx("h2", { children: "No patient selected" }) }));
    }
    return (_jsxs("aside", { className: "patient-panel", "aria-label": `${patient.name} treatment details`, children: [_jsxs("div", { className: "panel-head", children: [_jsx("span", { className: "patient-avatar large", "aria-hidden": "true", children: avatarFor(patient.type) }), _jsxs("div", { children: [_jsxs("p", { className: "eyebrow", children: [patient.runner, " \u00B7 ", patient.type] }), _jsx("h2", { children: patient.name }), _jsx("p", { className: "path-line", children: patient.path })] })] }), _jsx(SummaryMeter, { label: "Recovery", value: patient.score, projected: patient.projected_score, tone: scoreTone(patient.score) }), _jsxs("div", { className: "diagnosis-row", children: [_jsx("span", { children: summarizeFindingCount(patient) }), _jsx("span", { children: patient.gate })] }), _jsxs("div", { className: "treatment-list", children: [_jsx("h3", { children: "Treatment Queue" }), patient.issues.length === 0 ? (_jsx("p", { className: "quiet", children: "No treatment needed." })) : (patient.issues.map((issue) => (_jsxs("article", { className: `finding tone-${scoreTone(100 - issue.deduction * 2)}`, children: [_jsxs("div", { children: [_jsx("strong", { children: issue.rule_id }), _jsx("span", { children: issue.severity })] }), _jsx("p", { children: issue.message }), _jsxs("small", { children: [issue.file, issue.span ? `:${issue.span.line}` : "", " \u00B7 ", issue.evidence] }), _jsx("p", { className: "suggestion", children: issue.suggestion })] }, issue.id))))] })] }));
}
function SummaryMeter({ label, value, projected, tone }) {
    return (_jsxs("div", { className: "meter-block", children: [_jsxs("div", { className: "meter-label", children: [_jsx("span", { children: label }), _jsxs("strong", { children: [value, "/100"] })] }), _jsxs("div", { className: "meter", "aria-hidden": "true", children: [projected !== undefined ? _jsx("span", { className: "meter-projected", style: { width: `${projected}%` } }) : null, _jsx("span", { className: `meter-fill tone-${tone}`, style: { width: `${value}%` } })] })] }));
}
function HealthBar({ value, projected }) {
    return (_jsxs("span", { className: "healthbar", "aria-label": `Health ${value}, projected ${projected}`, children: [_jsx("span", { className: "healthbar-projected", style: { width: `${projected}%` } }), _jsx("span", { className: "healthbar-fill", style: { width: `${value}%` } })] }));
}
function ExportButton({ icon, label, onClick }) {
    return (_jsxs("button", { className: "export-button", type: "button", onClick: onClick, children: [icon, _jsx("span", { children: label })] }));
}
function LoadingState() {
    return (_jsxs("main", { className: "center-state", "aria-busy": "true", children: [_jsx(Stethoscope, { "aria-hidden": "true" }), _jsx("h1", { children: "Preparing the clinic" }), _jsx("p", { children: "Reading the treatment report..." })] }));
}
function ErrorState({ message }) {
    return (_jsxs("main", { className: "center-state", role: "alert", children: [_jsx(Activity, { "aria-hidden": "true" }), _jsx("h1", { children: "Report could not be loaded" }), _jsx("p", { children: message })] }));
}
function avatarFor(type) {
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
function downloadText(filename, text) {
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
}
function markdownSummary(report) {
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
function downloadPng(report) {
    const canvas = document.createElement("canvas");
    canvas.width = 1200;
    canvas.height = 630;
    const ctx = canvas.getContext("2d");
    if (!ctx)
        return;
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
//# sourceMappingURL=App.js.map