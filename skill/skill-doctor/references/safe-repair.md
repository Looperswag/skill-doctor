# Safe Repair

Autofix cautiously.

- `safe_autofix`: create missing non-destructive folders or starter files.
- `review_required`: narrow broad trigger wording, update stale paths, repair Markdown links.
- `manual_only`: dependency installation, hook behavior changes, security policy changes.
- `do_not_autofix`: secrets, destructive deletes, global config writes, instruction override attempts.

Never modify global shell, git, npm, or runner configuration without explicit user confirmation.
