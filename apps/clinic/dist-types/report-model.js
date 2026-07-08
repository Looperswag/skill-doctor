const WARD_LABELS = {
    codex: "Codex Ward",
    claude: "Claude Ward",
    generic: "Generic Ward"
};
export function groupPatientsByWard(report) {
    const order = ["codex", "claude", "generic"];
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
export function scoreTone(score) {
    if (score >= 90)
        return "excellent";
    if (score >= 80)
        return "good";
    if (score >= 70)
        return "warning";
    if (score >= 50)
        return "risky";
    return "critical";
}
export function summarizeFindingCount(patient) {
    if (patient.issues.length === 0)
        return "No findings";
    const blockers = patient.issues.filter((issue) => issue.severity === "critical" || issue.severity === "high").length;
    return `${patient.issues.length} findings · ${blockers} blockers`;
}
//# sourceMappingURL=report-model.js.map