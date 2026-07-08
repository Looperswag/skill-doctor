# Report Format

Emit:

- `schema_version: "skill-doctor.report.v1"`
- `patients[]`: each skill, hook, subagent, or config being diagnosed.
- `findings[]`: one structured finding per issue.
- `summary`: aggregate score, confidence, gate, counts, blockers, and warnings.

Every finding should include `rule_id`, severity, category, file, optional span, evidence, message, suggestion, autofix category, deduction, and patient id.
