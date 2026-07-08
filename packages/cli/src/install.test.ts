import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtemp } from "node:fs/promises";
import { describe, expect, test } from "vitest";
import { installSkill } from "./install.js";

describe("installSkill", () => {
  test("installs the bundled skill for Codex and Claude", async () => {
    const home = await mkdtemp(join(tmpdir(), "skill-doctor-install-"));

    const results = await installSkill({ homeDir: home, target: "both" });

    expect(results.map((result) => result.runner).sort()).toEqual(["claude", "codex"]);
    await expect(readFile(join(home, ".agents", "skills", "skill-doctor", "SKILL.md"), "utf8")).resolves.toContain("skill-doctor");
    await expect(readFile(join(home, ".claude", "skills", "skill-doctor", "SKILL.md"), "utf8")).resolves.toContain("skill-doctor");
  });

  test("backs up an existing target instead of silently overwriting it", async () => {
    const home = await mkdtemp(join(tmpdir(), "skill-doctor-install-"));
    const existing = join(home, ".agents", "skills", "skill-doctor");
    await mkdir(existing, { recursive: true });
    await writeFile(join(existing, "SKILL.md"), "old skill");

    const [result] = await installSkill({ homeDir: home, target: "codex" });

    expect(result?.backupPath).toBeTruthy();
    expect(await readFile(join(existing, "SKILL.md"), "utf8")).toContain("skill-doctor");
    expect(await readFile(join(result!.backupPath!, "SKILL.md"), "utf8")).toBe("old skill");
  });
});
