# Runner Matrix

## Codex

- Skills: `$HOME/.agents/skills`, repo `.agents/skills`.
- Hooks/config: `$HOME/.codex`, repo `.codex`.
- Subagents: `$HOME/.codex/agents`, repo `.codex/agents`.
- Treat `$HOME/.codex/skills` as legacy or compatibility input.

## Claude Code

- Skills: `$HOME/.claude/skills`, repo `.claude/skills`.
- Hooks/settings: `settings.json` files under `.claude` scopes.
- Subagents: `$HOME/.claude/agents`, repo `.claude/agents`.

## Generic CLI

Use explicit paths and report unknown compatibility instead of assuming runner behavior.
