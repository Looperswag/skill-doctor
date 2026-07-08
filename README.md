# skill-doctor

`skill-doctor` 是一套 Agent 能力包体检系统：扫描 Codex 和 Claude Code 的 skills、hooks、subagents 与配置，把每个能力文件夹拟人化成“病人”，在像素诊疗台里展示血条、病因、治疗建议和最终报告。

```bash
npx skill-doctor@latest clinic --home
```

这条命令会扫描本地 `.codex`、`.claude`、`.agents` 定制目录，生成报告，启动 localhost 诊疗台，并打开内置前端。用户不需要单独安装前端，也不需要手动 build。

> 把 skill 当运行时代码测，而不是当 Markdown 看。

## 它检查什么

- `SKILL.md` frontmatter 缺失、入口文件缺失
- `references/`、`scripts/`、`assets/` 引用断链
- hook 或脚本中的高风险模式，例如全局安装、`curl | bash`、裸 `printenv`、危险删除
- 上下文污染，例如“永远使用这个 skill”或要求覆盖系统/开发者指令
- Codex 与 Claude Code 路径漂移，例如遗留的 `.codex/skills`
- 报告质量：文件、行号、证据、严重级别、治疗建议和自动修复边界

## 快速开始

使用已发布 npm 包：

```bash
npx skill-doctor@latest clinic --home
npx skill-doctor@latest scan --home --format markdown
npx skill-doctor@latest install-skill --target both
```

从源码仓库运行：

```bash
npm install
npm run build
node packages/cli/dist/index.js clinic --fixture demo --no-open
```

内置 demo fixture 故意放了一个生病的 skill 和一个高风险 hook，方便你立刻看到诊疗效果。

## CLI

```bash
skill-doctor clinic --home --runner codex,claude
skill-doctor scan <path|--home> --format json|markdown|sarif
skill-doctor install-skill --target codex|claude|both
skill-doctor report reports/latest/report.json --format markdown
skill-doctor fix --dry-run
```

V1 的 `fix` 只支持 dry-run。项目默认不修改真实 home 目录或全局运行器配置。

## 像素诊疗台

诊疗台被打包进 npm 包。CLI 会从 `packages/cli/dist/clinic` 服务预构建 React 应用，并通过 `/api/report` 提供报告数据。

可视化模型：

- 病区：Codex 病区、Claude 病区、通用病区
- 病人：一个 skill、hook、subagent、config 或文件夹
- 总血条：当前健康分
- 恢复进度：治疗后的预期分数
- 治疗队列：按病人聚合的发现项和建议

## 报告格式

V1 输出 `skill-doctor.report.v1`：

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

报告会写出三类文件：

- `report.json`
- `summary.md`
- `findings.jsonl`

## 安装 skill

使用 CLI：

```bash
npx skill-doctor@latest install-skill --target both
```

默认安装位置：

- Codex：`$HOME/.agents/skills/skill-doctor`
- Claude Code：`$HOME/.claude/skills/skill-doctor`

手动安装：

```bash
mkdir -p ~/.agents/skills ~/.claude/skills
cp -R skill/skill-doctor ~/.agents/skills/skill-doctor
cp -R skill/skill-doctor ~/.claude/skills/skill-doctor
```

## 开发

```bash
npm install
npm test
npm run typecheck
npm run build
node packages/cli/dist/index.js scan --fixture demo --format markdown
node packages/cli/dist/index.js clinic --fixture demo --no-open
```

项目结构：

```text
packages/core      清单扫描、规则、评分、报告渲染
packages/cli       npm 包、CLI、内置 skill 模板、静态诊疗台服务
apps/clinic        React/Vite 像素诊疗台，构建后进入 packages/cli/dist/clinic
skill/skill-doctor 可直接复制给 Agent 使用的 skill
docs               设计长文和原始项目笔记
```

## 安全边界

`skill-doctor` 不推荐 `curl | bash` 安装。一个专门检查 `curl | bash` 风险的工具，不应该用 `curl | bash` 分发自己。

默认命令不会修改真实 home 目录。唯一会写入用户目录的是 `install-skill`，它只写入明确的 skill 目标目录，并在已有安装时先备份，不会静默覆盖。

## License

MIT
