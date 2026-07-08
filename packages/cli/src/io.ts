import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { renderMarkdownReport, type SkillDoctorReport } from "@skill-doctor/core";

export type OutputFormat = "json" | "markdown" | "sarif";

export async function writeReportFiles(report: SkillDoctorReport, outDir: string): Promise<void> {
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(join(outDir, "summary.md"), renderMarkdownReport(report));
  await writeFile(
    join(outDir, "findings.jsonl"),
    report.findings.map((finding) => JSON.stringify(finding)).join("\n") + (report.findings.length > 0 ? "\n" : "")
  );
}

export async function readReport(path: string): Promise<SkillDoctorReport> {
  return JSON.parse(await readFile(path, "utf8")) as SkillDoctorReport;
}

export function formatReport(report: SkillDoctorReport, format: OutputFormat): string {
  if (format === "markdown") return renderMarkdownReport(report);
  if (format === "sarif") return JSON.stringify(toSarif(report), null, 2) + "\n";
  return JSON.stringify(report, null, 2) + "\n";
}

function toSarif(report: SkillDoctorReport) {
  return {
    version: "2.1.0",
    $schema: "https://json.schemastore.org/sarif-2.1.0.json",
    runs: [
      {
        tool: {
          driver: {
            name: "skill-doctor",
            informationUri: "https://github.com/Looperswag/skill-doctor",
            rules: [...new Set(report.findings.map((finding) => finding.rule_id))].map((ruleId) => ({
              id: ruleId,
              shortDescription: { text: ruleId }
            }))
          }
        },
        results: report.findings.map((finding) => ({
          ruleId: finding.rule_id,
          level: finding.severity === "critical" || finding.severity === "high" ? "error" : "warning",
          message: { text: finding.message },
          locations: [
            {
              physicalLocation: {
                artifactLocation: { uri: finding.file },
                region: finding.span ? { startLine: finding.span.line, startColumn: finding.span.column } : undefined
              }
            }
          ]
        }))
      }
    ]
  };
}
