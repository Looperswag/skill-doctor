# 运行器路径矩阵

## Codex

- Skills：`$HOME/.agents/skills`，以及仓库内 `.agents/skills`。
- Hooks/config：`$HOME/.codex`，以及仓库内 `.codex`。
- Subagents：`$HOME/.codex/agents`，以及仓库内 `.codex/agents`。
- `$HOME/.codex/skills` 视为遗留或兼容输入，不作为当前推荐主路径。

## Claude Code

- Skills：`$HOME/.claude/skills`，以及仓库内 `.claude/skills`。
- Hooks/settings：各作用域 `.claude` 下的 `settings.json`。
- Subagents：`$HOME/.claude/agents`，以及仓库内 `.claude/agents`。

## 通用 CLI

使用显式路径，不要假设运行器行为；无法判断时报告为未知兼容性。
