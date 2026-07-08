# skill-doctor

Agent customization is runtime infrastructure. `skill-doctor` treats it that way.

`skill-doctor` scans Codex and Claude Code skills, hooks, subagents, and config, turns each folder into a pixel-clinic patient, shows a health bar for every capability chain, and exports a treatment report that humans and CI can both read.

```bash
npx skill-doctor@latest clinic --home
```

That command scans local `.codex`, `.claude`, and `.agents` customization, writes report artifacts, starts a localhost clinic, and opens the bundled dashboard. No separate frontend install. No manual build.

> Put a stethoscope on your agent runtime, not just a spell-checker on Markdown.

## What It Checks

- Broken `SKILL.md` frontmatter and missing entrypoints
- Missing `references/`, `scripts/`, and `assets/` paths
- Unsafe hook or script patterns such as global installs, `curl | bash`, broad `printenv`, or dangerous deletes
- Context pollution such as “always use this skill” or overriding system/developer instructions
- Codex/Claude path drift, including legacy `.codex/skills` copies
- Report quality: file, line, evidence, severity, treatment, autofix boundary

## Quick Start

Published package:

```bash
npx skill-doctor@latest clinic --home
npx skill-doctor@latest scan --home --format markdown
npx skill-doctor@latest install-skill --target both
```

From a clone:

```bash
npm install
npm run build
node packages/cli/dist/index.js clinic --fixture demo --no-open
```

The demo fixture intentionally contains a sick skill and risky hook so the clinic has something to treat.

## CLI

```bash
skill-doctor clinic --home --runner codex,claude
skill-doctor scan <path|--home> --format json|markdown|sarif
skill-doctor install-skill --target codex|claude|both
skill-doctor report reports/latest/report.json --format markdown
skill-doctor fix --dry-run
```

`fix` is dry-run only in V1. The project deliberately avoids default mutation of real home directories or global runner configuration.

## Pixel Clinic

The clinic is bundled inside the npm package. The CLI serves the prebuilt React app from `packages/cli/dist/clinic` and exposes the report at `/api/report`.

Visual model:

- Ward: runner family such as Codex Ward or Claude Ward
- Patient: one skill, hook, subagent, config, or folder
- Bloodline: current health score
- Recovery: projected score after treatments
- Treatment queue: findings grouped by patient

## Report Schema

V1 emits `skill-doctor.report.v1`:

```json
{
  "schema_version": "skill-doctor.report.v1",
  "summary": {
    "score": 86,
    "confidence": 0.91,
    "gate": "publishable",
    "patient_counts": { "skill": 2, "hook": 1, "subagent": 1, "config": 1, "folder": 0 },
    "blockers": 0,
    "warnings": 3
  },
  "patients": [],
  "findings": []
}
```

Reports are written as:

- `report.json`
- `summary.md`
- `findings.jsonl`

## Install the Skill

Use the CLI:

```bash
npx skill-doctor@latest install-skill --target both
```

Default destinations:

- Codex: `$HOME/.agents/skills/skill-doctor`
- Claude Code: `$HOME/.claude/skills/skill-doctor`

Manual install:

```bash
mkdir -p ~/.agents/skills ~/.claude/skills
cp -R skill/skill-doctor ~/.agents/skills/skill-doctor
cp -R skill/skill-doctor ~/.claude/skills/skill-doctor
```

## Development

```bash
npm install
npm test
npm run typecheck
npm run build
node packages/cli/dist/index.js scan --fixture demo --format markdown
node packages/cli/dist/index.js clinic --fixture demo --no-open
```

Project layout:

```text
packages/core      inventory, rules, scoring, report rendering
packages/cli       npm package, CLI, bundled skill template, static clinic server
apps/clinic        React/Vite pixel clinic, built into packages/cli/dist/clinic
skill/skill-doctor copyable agent skill
docs               design essay and project notes
```

## Safety Stance

`skill-doctor` does not recommend `curl | bash` installation. That would be a strange way to ship a tool whose job is to catch `curl | bash`.

Default commands do not modify real home folders except `install-skill`, which only writes the explicit skill target and backs up an existing install instead of silently overwriting it.

## License

MIT
