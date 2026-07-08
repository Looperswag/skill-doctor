import { basename, dirname, join } from "node:path";
import type { Finding, PatientDraft, Severity } from "./types.js";
import { listFiles, pathExists, readText, toRelative } from "./fs-utils.js";

interface FileContent {
  absolute: string;
  relative: string;
  text: string;
}

interface FindingInput {
  rule_id: string;
  severity: Severity;
  category: string;
  file: string;
  evidence: string;
  message: string;
  suggestion: string;
  autofix?: Finding["autofix"];
  line?: number;
  column?: number;
}

export async function analyzePatient(patient: PatientDraft): Promise<Finding[]> {
  const files = await readPatientFiles(patient);
  const findings: FindingInput[] = [];

  if (patient.type === "skill") {
    await analyzeSkill(patient, files, findings);
  }

  if (patient.type === "subagent") {
    analyzeSubagent(files, findings);
  }

  if (patient.type === "hook" || patient.type === "config") {
    analyzeConfig(files, findings);
  }

  analyzeTextRisk(files, findings, patient);

  return findings.map((finding, index) => toFinding(patient, finding, index));
}

async function readPatientFiles(patient: PatientDraft): Promise<FileContent[]> {
  const candidateFiles = patient.path.endsWith(".md") || patient.path.endsWith(".json") || patient.path.endsWith(".toml")
    ? [patient.path]
    : await listFiles(patient.path);

  const files: FileContent[] = [];
  const root = patient.path.endsWith(".md") || patient.path.endsWith(".json") || patient.path.endsWith(".toml")
    ? dirname(patient.path)
    : patient.path;

  for (const file of candidateFiles) {
    try {
      files.push({
        absolute: file,
        relative: toRelative(root, file),
        text: await readText(file)
      });
    } catch {
      files.push({
        absolute: file,
        relative: toRelative(root, file),
        text: ""
      });
    }
  }

  return files;
}

async function analyzeSkill(patient: PatientDraft, files: FileContent[], findings: FindingInput[]) {
  const skillFile = files.find((file) => basename(file.absolute) === "SKILL.md");

  if (!skillFile) {
    findings.push({
      rule_id: "INV_MISSING_ENTRYPOINT",
      severity: "critical",
      category: "inventory",
      file: patient.path,
      evidence: "SKILL.md",
      message: "Skill 文件夹缺少 SKILL.md 入口文件。",
      suggestion: "添加包含 name 和 description frontmatter 的 SKILL.md 文件。",
      autofix: "manual_only"
    });
    return;
  }

  const frontmatter = parseFrontmatter(skillFile.text);
  if (!frontmatter || !frontmatter.name || !frontmatter.description) {
    findings.push({
      rule_id: "STRUCT_MISSING_METADATA",
      severity: "high",
      category: "structure",
      file: skillFile.relative,
      evidence: "--- name / description ---",
      message: "Skill frontmatter 必须包含 name 和 description。",
      suggestion: "在 SKILL.md 中添加简洁的 name 和聚焦触发条件的 description。",
      autofix: "review_required",
      line: 1
    });
  }

  for (const reference of extractResourceReferences(skillFile.text)) {
    const target = join(patient.path, reference);
    if (!(await pathExists(target))) {
      findings.push({
        rule_id: "REF_MISSING",
        severity: "high",
        category: "inventory",
        file: skillFile.relative,
        evidence: reference,
        message: "Skill 指令引用了不存在的内置资源。",
        suggestion: "创建被引用的文件，或将该路径改写为明确的示例路径。",
        autofix: "review_required",
        line: findLine(skillFile.text, reference)
      });
    }
  }
}

function analyzeSubagent(files: FileContent[], findings: FindingInput[]) {
  for (const file of files) {
    if (!file.relative.endsWith(".md")) continue;
    const frontmatter = parseFrontmatter(file.text);
    if (!frontmatter || !frontmatter.name || !frontmatter.description) {
      findings.push({
        rule_id: "STRUCT_MISSING_METADATA",
        severity: "medium",
        category: "structure",
        file: file.relative,
        evidence: "name / description",
        message: "Subagent 文件应声明 name 和 description。",
        suggestion: "添加包含 name 和 description 的 YAML frontmatter，方便运行器可靠选择。",
        autofix: "review_required",
        line: 1
      });
    }
  }
}

function analyzeConfig(files: FileContent[], findings: FindingInput[]) {
  for (const file of files) {
    if (file.relative.endsWith(".json")) {
      try {
        JSON.parse(file.text);
      } catch (error) {
        findings.push({
          rule_id: "LINT_INVALID_JSON",
          severity: "high",
          category: "lint",
          file: file.relative,
          evidence: error instanceof Error ? error.message : "invalid json",
          message: "配置 JSON 无法解析。",
          suggestion: "先修复 JSON 语法，再依赖该 hook 或 settings 文件。",
          autofix: "manual_only",
          line: 1
        });
      }
    }

    if (/hooks?\s*[:=]/iu.test(file.text) && !/fixtures?\//iu.test(file.text)) {
      findings.push({
        rule_id: "HOOK_MISSING_FIXTURE",
        severity: "medium",
        category: "hook_replay",
        file: file.relative,
        evidence: "hook config without fixture path",
        message: "Hook 配置缺少 replay fixture 引用。",
        suggestion: "为关键 hook 事件添加 replay fixture，确保行为可安全复现。",
        autofix: "manual_only"
      });
    }
  }
}

function analyzeTextRisk(files: FileContent[], findings: FindingInput[], patient: PatientDraft) {
  const checks: Array<{
    rule_id: string;
    severity: Severity;
    category: string;
    pattern: RegExp;
    message: string;
    suggestion: string;
    autofix: Finding["autofix"];
  }> = [
    {
      rule_id: "POLLUTION_CONTEXT_OVERRIDE_RULES",
      severity: "critical",
      category: "pollution",
      pattern: /(ignore|override).{0,30}(previous|system|developer) instructions|覆盖系统|覆盖开发者/iu,
      message: "指令试图覆盖更高优先级的规则。",
      suggestion: "删除任何要求 Agent 忽略系统、开发者或安全规则的指令。",
      autofix: "do_not_autofix"
    },
    {
      rule_id: "POLLUTION_CONTEXT_ALWAYS_USE",
      severity: "medium",
      category: "pollution",
      pattern: /\b(always|must)\s+use\s+this\s+skill\b/iu,
      message: "触发描述过宽，可能污染无关任务。",
      suggestion: "用具体任务和上下文边界替换过宽的触发语言。",
      autofix: "review_required"
    },
    {
      rule_id: "POLLUTION_ENV_GLOBAL_INSTALL",
      severity: "high",
      category: "pollution",
      pattern: /\b(npm|pnpm|yarn)\s+install\s+-g\b|\bpip\s+install\s+--user\b/iu,
      message: "脚本执行了全局包安装。",
      suggestion: "改用项目本地依赖，或将该操作声明为需要用户确认的手动步骤。",
      autofix: "manual_only"
    },
    {
      rule_id: "SECURITY_CURL_PIPE_BASH",
      severity: "critical",
      category: "security",
      pattern: /\bcurl\b[^\n|]*\|\s*(bash|sh)\b/iu,
      message: "脚本下载远程代码后立即执行。",
      suggestion: "先下载、校验并审查安装内容，再执行。",
      autofix: "do_not_autofix"
    },
    {
      rule_id: "LINT_UNSAFE_SHELL",
      severity: "critical",
      category: "security",
      pattern: /\brm\s+-rf\s+["']?\$\{?\w+|\brm\s+-rf\s+\//iu,
      message: "检测到危险删除模式。",
      suggestion: "将删除范围限制在明确的临时目录内，并校验输入。",
      autofix: "do_not_autofix"
    },
    {
      rule_id: "SECURITY_PRINTENV_LOG",
      severity: "high",
      category: "security",
      pattern: /\bprintenv\b/iu,
      message: "脚本可能将环境变量中的 secret 打入日志。",
      suggestion: "只记录诊断所需的具名非敏感变量。",
      autofix: "manual_only"
    },
    {
      rule_id: "COMPAT_RUNNER_PATH_LEAK",
      severity: patient.scope === "legacy" ? "medium" : "low",
      category: "compatibility",
      pattern: /~\/\.claude|~\/\.codex|\/Users\/[A-Za-z0-9._-]+/u,
      message: "硬编码用户或运行器路径会降低可迁移性。",
      suggestion: "使用运行器提供的 home 变量，或明确记录 fallback 路径。",
      autofix: "review_required"
    }
  ];

  for (const file of files) {
    for (const check of checks) {
      const match = file.text.match(check.pattern);
      if (!match?.[0]) continue;
      findings.push({
        rule_id: check.rule_id,
        severity: check.severity,
        category: check.category,
        file: file.relative,
        evidence: match[0],
        message: check.message,
        suggestion: check.suggestion,
        autofix: check.autofix,
        line: findLine(file.text, match[0])
      });
    }
  }
}

function parseFrontmatter(text: string): Record<string, string> | null {
  if (!text.startsWith("---")) return null;
  const end = text.indexOf("\n---", 3);
  if (end === -1) return null;
  const block = text.slice(3, end).trim();
  const result: Record<string, string> = {};

  for (const line of block.split(/\r?\n/u)) {
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/u);
    if (!match) continue;
    result[match[1]!] = match[2]!.replace(/^["']|["']$/gu, "").trim();
  }

  return result;
}

function extractResourceReferences(text: string): string[] {
  const references = new Set<string>();
  const pattern = /\b((?:references|assets|scripts)\/[A-Za-z0-9._/-]+)/gu;
  for (const match of text.matchAll(pattern)) {
    if (match[1]) references.add(match[1]);
  }
  return [...references];
}

function findLine(text: string, needle: string): number {
  const index = text.indexOf(needle);
  if (index < 0) return 1;
  return text.slice(0, index).split(/\r?\n/u).length;
}

function toFinding(patient: PatientDraft, input: FindingInput, index: number): Finding {
  const finding: Finding = {
    id: `${patient.id}:${input.rule_id}:${index}`,
    rule_id: input.rule_id,
    severity: input.severity,
    category: input.category,
    file: input.file,
    evidence: input.evidence,
    message: input.message,
    suggestion: input.suggestion,
    autofix: input.autofix ?? "manual_only",
    deduction: deductionFor(input.severity),
    patient_id: patient.id
  };

  if (input.line !== undefined) {
    finding.span = {
      line: input.line,
      column: input.column ?? 1
    };
  }

  return finding;
}

function deductionFor(severity: Severity): number {
  switch (severity) {
    case "critical":
      return 40;
    case "high":
      return 15;
    case "medium":
      return 8;
    case "low":
      return 3;
    case "info":
      return 0;
  }
}
