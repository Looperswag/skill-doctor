import { mkdtemp, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Writable } from "node:stream";
import { describe, expect, test } from "vitest";
import { createProgram } from "./program.js";

function sink() {
  return new Writable({
    write(_chunk, _encoding, callback) {
      callback();
    }
  });
}

describe("createProgram", () => {
  test("scan --fixture demo writes machine and human reports", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "skill-doctor-cli-"));
    const program = createProgram({ stdout: sink() });

    await program.parseAsync(["scan", "--fixture", "demo", "--format", "markdown", "--out", outDir], { from: "user" });

    const summary = await readFile(join(outDir, "summary.md"), "utf8");
    const report = JSON.parse(await readFile(join(outDir, "report.json"), "utf8")) as { schema_version: string };
    await expect(stat(join(outDir, "findings.jsonl"))).resolves.toBeTruthy();
    expect(summary).toContain("Skill Doctor 治疗报告");
    expect(report.schema_version).toBe("skill-doctor.report.v1");
  });

  test("fix requires dry-run or explicit apply", async () => {
    const program = createProgram({ stdout: sink() });

    await expect(program.parseAsync(["fix", "--fixture", "demo"], { from: "user" })).rejects.toThrow("Refusing to modify files");
  });
});
