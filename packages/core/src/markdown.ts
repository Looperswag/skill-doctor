import type { SkillDoctorReport } from "./types.js";

export function renderMarkdownReport(report: SkillDoctorReport): string {
  const lines: string[] = [
    "# Skill Doctor Treatment Report",
    "",
    `Generated: ${report.generated_at}`,
    `Health Score: ${report.summary.score} / 100`,
    `Confidence: ${report.summary.confidence}`,
    `Gate: ${report.summary.gate}`,
    "",
    "## Patients",
    ""
  ];

  if (report.patients.length === 0) {
    lines.push("No agent customization patients were discovered.", "");
  }

  for (const patient of report.patients) {
    lines.push(`### ${patient.name}`);
    lines.push("");
    lines.push(`- Type: ${patient.type}`);
    lines.push(`- Runner: ${patient.runner}`);
    lines.push(`- Score: ${patient.score} / 100`);
    lines.push(`- Gate: ${patient.gate}`);
    lines.push(`- Projected score: ${patient.projected_score} / 100`);
    lines.push("");

    if (patient.issues.length === 0) {
      lines.push("No issues found.", "");
      continue;
    }

    lines.push("| Severity | Rule | Location | Treatment |");
    lines.push("|---|---|---|---|");
    for (const issue of patient.issues) {
      const location = issue.span ? `${issue.file}:${issue.span.line}` : issue.file;
      lines.push(`| ${issue.severity} | ${issue.rule_id} | ${location} | ${escapeCell(issue.suggestion)} |`);
    }
    lines.push("");
  }

  lines.push("## Findings JSONL Preview", "");
  for (const finding of report.findings.slice(0, 10)) {
    lines.push(`- ${finding.rule_id}: ${finding.message}`);
  }

  return `${lines.join("\n")}\n`;
}

function escapeCell(value: string): string {
  return value.replace(/\|/gu, "\\|");
}
