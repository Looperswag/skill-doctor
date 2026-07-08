import type { Finding, Patient, Runner, Severity, SkillDoctorReport } from "./types.js";

export type Tone = "excellent" | "good" | "warning" | "risky" | "critical";

export interface Ward {
  id: Runner;
  label: string;
  patients: Patient[];
  averageScore: number;
}

export interface RecoveryPoint {
  id: string;
  label: string;
  score: number;
  projectedScore: number;
}

export type SeverityBreakdown = Record<Severity, number> & { total: number };

const SEVERITIES: Severity[] = ["critical", "high", "medium", "low", "info"];

const WARD_LABELS: Record<Runner, string> = {
  codex: "Codex 病区",
  claude: "Claude 病区",
  generic: "通用病区"
};

const PATIENT_TYPE_LABELS: Record<Patient["type"], string> = {
  skill: "技能",
  hook: "Hook",
  subagent: "子代理",
  config: "配置",
  folder: "文件夹"
};

const RUNNER_LABELS: Record<Runner, string> = {
  codex: "Codex",
  claude: "Claude",
  generic: "通用"
};

const GATE_LABELS: Record<SkillDoctorReport["summary"]["gate"], string> = {
  publishable: "可发布",
  warning: "警告",
  blocked: "阻断",
  unknown: "未知"
};

const SEVERITY_LABELS: Record<Severity, string> = {
  critical: "严重",
  high: "高",
  medium: "中",
  low: "低",
  info: "信息"
};

export function groupPatientsByWard(report: SkillDoctorReport): Ward[] {
  const order: Runner[] = ["codex", "claude", "generic"];
  return order
    .map((runner) => {
      const patients = sortPatientsByUrgency(report.patients.filter((patient) => patient.runner === runner));
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

export function scoreTone(score: number): Tone {
  if (score >= 90) return "excellent";
  if (score >= 80) return "good";
  if (score >= 70) return "warning";
  if (score >= 50) return "risky";
  return "critical";
}

export function summarizeFindingCount(patient: Patient): string {
  if (patient.issues.length === 0) return "无发现项";
  const blockers = patient.issues.filter((issue) => issue.severity === "critical" || issue.severity === "high").length;
  return `${patient.issues.length} 个发现项 · ${blockers} 个阻断项`;
}

export function averageProjectedScore(patients: Patient[]): number {
  if (patients.length === 0) return 100;
  const total = patients.reduce((sum, patient) => sum + patient.projected_score, 0);
  return Math.round(total / patients.length);
}

export function sortPatientsByUrgency(patients: Patient[]): Patient[] {
  return [...patients].sort((left, right) => {
    const scoreDelta = left.score - right.score;
    if (scoreDelta !== 0) return scoreDelta;

    const issueDelta = right.issues.length - left.issues.length;
    if (issueDelta !== 0) return issueDelta;

    const projectedDelta = right.projected_score - left.projected_score;
    if (projectedDelta !== 0) return projectedDelta;

    return left.name.localeCompare(right.name, "zh-CN");
  });
}

export function buildRecoverySeries(patients: Patient[], limit = 12): RecoveryPoint[] {
  return sortPatientsByUrgency(patients).slice(0, limit).map((patient) => ({
    id: patient.id,
    label: patient.name,
    score: patient.score,
    projectedScore: patient.projected_score
  }));
}

export function severityBreakdown(findings: Finding[]): SeverityBreakdown {
  const counts = SEVERITIES.reduce(
    (accumulator, severity) => ({ ...accumulator, [severity]: 0 }),
    {} as Record<Severity, number>
  );

  for (const finding of findings) {
    counts[finding.severity] += 1;
  }

  return {
    ...counts,
    total: findings.length
  };
}

export function displayPatientType(type: Patient["type"]): string {
  return PATIENT_TYPE_LABELS[type];
}

export function displayRunner(runner: Runner): string {
  return RUNNER_LABELS[runner];
}

export function displayGate(gate: SkillDoctorReport["summary"]["gate"]): string {
  return GATE_LABELS[gate];
}

export function displaySeverity(severity: Severity): string {
  return SEVERITY_LABELS[severity];
}

export function severityRows(breakdown: SeverityBreakdown): Array<{ severity: Severity; label: string; count: number }> {
  return SEVERITIES.map((severity) => ({
    severity,
    label: displaySeverity(severity),
    count: breakdown[severity]
  }));
}

export function buildMarkdownSummary(report: SkillDoctorReport): string {
  const projectedScore = averageProjectedScore(report.patients);
  const projectedGain = Math.max(0, projectedScore - report.summary.score);
  const breakdown = severityBreakdown(report.findings);
  const wards = groupPatientsByWard(report);

  return [
    "# Skill Doctor 治疗报告",
    "",
    `生成时间：${report.generated_at}`,
    `Schema：${report.schema_version}`,
    "",
    "## 面板总览",
    "",
    `- 当前健康分：${report.summary.score} / 100`,
    `- 预计恢复分：${projectedScore} / 100（可提升 ${projectedGain} 分）`,
    `- 门禁：${displayGate(report.summary.gate)}`,
    `- 置信度：${Math.round(report.summary.confidence * 100)}%`,
    `- 病人总数：${report.patients.length}`,
    `- 阻断项：${report.summary.blockers}`,
    `- 警告项：${report.summary.warnings}`,
    `- 发现项分布：严重 ${breakdown.critical} / 高 ${breakdown.high} / 中 ${breakdown.medium} / 低 ${breakdown.low} / 信息 ${breakdown.info}`,
    "",
    "## 对象类型统计",
    "",
    ...Object.entries(report.summary.patient_counts).map(([type, count]) => `- ${displayPatientType(type as Patient["type"])}：${count}`),
    "",
    "## 病区评测",
    "",
    ...wards.flatMap((ward) => [
      `### ${ward.label}`,
      "",
      `- 平均健康分：${ward.averageScore} / 100`,
      `- 病人数：${ward.patients.length}`,
      "",
      "| 对象 | 类型 | 当前分 | 预计恢复 | 门禁 | 路径 |",
      "|---|---|---:|---:|---|---|",
      ...ward.patients.map((patient) => `| ${patient.name} | ${displayPatientType(patient.type)} | ${patient.score} | ${patient.projected_score} | ${displayGate(patient.gate)} | ${patient.path} |`),
      ""
    ]),
    "## 病人明细",
    "",
    ...report.patients.flatMap((patient) => patientMarkdown(patient)),
    "## 全部发现项",
    "",
    ...(report.findings.length === 0
      ? ["没有发现问题。"]
      : report.findings.flatMap((finding) => findingMarkdown(finding)))
  ].join("\n");
}

function patientMarkdown(patient: Patient): string[] {
  return [
    `### ${patient.name}`,
    "",
    `- 类型：${displayPatientType(patient.type)}`,
    `- 运行器：${displayRunner(patient.runner)}`,
    `- 范围：${patient.scope}`,
    `- 路径：${patient.path}`,
    `- 当前分：${patient.score} / 100`,
    `- 等级：${patient.grade}`,
    `- 门禁：${displayGate(patient.gate)}`,
    `- 置信度：${Math.round(patient.confidence * 100)}%`,
    `- 预计恢复分：${patient.projected_score} / 100`,
    `- 发现项：${patient.issues.length}`,
    "",
    "#### 具体评测结果",
    "",
    ...(patient.issues.length === 0
      ? ["没有发现问题。", ""]
      : patient.issues.flatMap((finding) => findingMarkdown(finding))),
    "#### 治疗建议",
    "",
    ...(patient.treatments.length === 0
      ? ["无需治疗。", ""]
      : patient.treatments.flatMap((treatment) => [
        `- ${treatment.title}`,
        `  - 优先级：${displaySeverity(treatment.priority)}`,
        `  - 建议：${treatment.suggestion}`,
        `  - 自动修复：${treatment.autofix}`,
        `  - 预计增益：${treatment.projected_gain}`,
        ""
      ]))
  ];
}

function findingMarkdown(finding: Finding): string[] {
  const location = finding.span ? `${finding.file}:${finding.span.line}` : finding.file;
  return [
    `- ${finding.rule_id}（${displaySeverity(finding.severity)}）`,
    `  - 分类：${finding.category}`,
    `  - 对象：${finding.patient_id}`,
    `  - 位置：${location}`,
    `  - 证据：${finding.evidence}`,
    `  - 问题：${finding.message}`,
    `  - 建议：${finding.suggestion}`,
    `  - 自动修复：${finding.autofix}`,
    `  - 扣分：${finding.deduction}`,
    ""
  ];
}
