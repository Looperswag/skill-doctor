import type { SkillDoctorReport } from "./types.js";

export function renderMarkdownReport(report: SkillDoctorReport): string {
  const lines: string[] = [
    "# Skill Doctor 治疗报告",
    "",
    `生成时间：${report.generated_at}`,
    `健康分：${report.summary.score} / 100`,
    `置信度：${report.summary.confidence}`,
    `门禁：${displayGate(report.summary.gate)}`,
    "",
    "## 病人清单",
    ""
  ];

  if (report.patients.length === 0) {
    lines.push("没有发现 Agent 定制病人。", "");
  }

  for (const patient of report.patients) {
    lines.push(`### ${patient.name}`);
    lines.push("");
    lines.push(`- 类型：${displayPatientType(patient.type)}`);
    lines.push(`- 运行器：${patient.runner}`);
    lines.push(`- 当前分数：${patient.score} / 100`);
    lines.push(`- 门禁：${displayGate(patient.gate)}`);
    lines.push(`- 预计恢复分：${patient.projected_score} / 100`);
    lines.push("");

    if (patient.issues.length === 0) {
      lines.push("没有发现问题。", "");
      continue;
    }

    lines.push("| 严重级别 | 规则 | 位置 | 治疗建议 |");
    lines.push("|---|---|---|---|");
    for (const issue of patient.issues) {
      const location = issue.span ? `${issue.file}:${issue.span.line}` : issue.file;
      lines.push(`| ${displaySeverity(issue.severity)} | ${issue.rule_id} | ${location} | ${escapeCell(issue.suggestion)} |`);
    }
    lines.push("");
  }

  lines.push("## 发现项预览", "");
  for (const finding of report.findings.slice(0, 10)) {
    lines.push(`- ${finding.rule_id}: ${finding.message}`);
  }

  return `${lines.join("\n")}\n`;
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

function displayPatientType(type: SkillDoctorReport["patients"][number]["type"]): string {
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

function displaySeverity(severity: SkillDoctorReport["findings"][number]["severity"]): string {
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

function escapeCell(value: string): string {
  return value.replace(/\|/gu, "\\|");
}
