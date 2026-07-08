# Skill Doctor

把 Codex、Claude Code 等智能体的 skills、hooks、subagents 和配置当成“能力包”来体检、评测、复诊和生成报告。

![Skill Doctor 诊疗台](docs/assets/clinic-dashboard.png)

`skill-doctor` 是一个面向 Agent 能力工程的本地诊疗台：扫描 `.codex`、`.claude`、`.agents`，把每个 skill、hook、subagent 或配置当成“病人”，用血条、病区、治疗队列和报告解释哪里坏、为什么坏、先修哪里。

## 先跑起来

### 1. 先看一个 demo

```bash
git clone https://github.com/Looperswag/skill-doctor.git
cd skill-doctor
npm install
npm run build
node packages/cli/dist/index.js clinic --fixture demo --no-open --port 5201
```

打开 `http://127.0.0.1:5201`，你会看到一个故意“生病”的 demo skill。修改 demo 文件后，诊疗台会实时复诊，分数、病人详情和治疗报告会自动刷新。

### 2. 扫描你的本机 Agent 配置

```bash
node packages/cli/dist/index.js clinic --home
```

这会扫描本机 Codex / Claude Code 目录，生成报告，启动诊疗台，并打开浏览器。

### 常用命令

```bash
# 只生成 Markdown 报告
node packages/cli/dist/index.js scan --home --format markdown

# 安装为 Codex / Claude 可发现的 skill
node packages/cli/dist/index.js install-skill --target both
```

<details>
<summary>不想 clone？也可以用 GitHub Release 一行运行</summary>

```bash
npx --yes --registry=https://registry.npmjs.org/ https://github.com/Looperswag/skill-doctor/releases/download/v0.1.0/looperswag-skill-doctor-0.1.0.tgz clinic --home
```

显式指定 `registry.npmjs.org` 是为了绕开部分公司或本机 npm 镜像的同步延迟。未来 npm 包发布后，也可以把 tarball 地址替换为 `@looperswag/skill-doctor@latest`。

</details>

## 它解决什么问题

Agent skills 很容易从“好用的小工具”变成“不可维护的黑箱”：

- `SKILL.md` frontmatter 缺失，运行器很难稳定发现。
- `references/`、`scripts/`、`assets/` 引用断链，复制到别人机器就坏。
- hook 或脚本里混入 `curl | bash`、全局安装、裸 `printenv`、危险删除。
- skill 描述过宽，例如“任何任务都必须使用我”，污染无关上下文。
- Codex、Claude Code、多目录布局同时存在，人工排查成本高。
- 评测结果散在终端里，没有证据、分数、优先级和复诊闭环。

`skill-doctor` 的目标是把这些隐性维护成本压到一条命令里：扫描、评分、定位证据、展示风险、给出治疗建议、导出报告，并在用户修复时实时更新。

## 和普通 skill 自查项目有什么不同

很多自查工具停在“检查 Markdown 是否规范”。`skill-doctor` 更像一个小型 Agent 能力包 QA 系统。

| 维度 | 普通自查 | Skill Doctor |
| --- | --- | --- |
| 检查对象 | 单个 skill 文件 | `.codex`、`.claude`、`.agents` 下的 skills、hooks、subagents、config |
| 反馈方式 | 终端错误列表 | 诊疗台、血条、病区、病人详情、治疗队列 |
| 证据粒度 | 大多只有规则名 | 文件、行号、证据、严重级别、扣分、建议 |
| 修复闭环 | 重新手动运行 | 文件变更后实时复诊，前端自动刷新 |
| 风险范围 | 结构 lint | 上下文污染、安全脚本、断链资源、运行器路径漂移 |
| 输出物 | 文本 | `report.json`、`summary.md`、`findings.jsonl`、PNG |
| 使用场景 | 开发者自用 | 本地体检、仓库发布前检查、CI 报告、用户可视化理解 |

## 设计思路

### 1. 每个能力文件夹都是一个“病人”

Skill Doctor 不只把文件当静态文本，而是先建立 inventory：

- Codex 病区：`.agents/skills`、`.codex/skills`、`.codex/agents`、hooks/config
- Claude 病区：`.claude/skills`、`.claude/agents`、settings/config
- 通用病区：用户显式传入的项目路径

每个病人都有分数、门禁状态、置信度、发现项、治疗建议和预计恢复分。

### 2. 评分不是为了吓人，而是为了排序

规则会把问题拆成 `critical`、`high`、`medium`、`low`、`info`，并计算：

- 当前健康分
- 预计恢复分
- 阻断项数量
- 警告项数量
- 发布门禁：可发布、警告、阻断、未知

这样用户不需要从几十条提示里猜优先级，先治阻断，再处理警告。

### 3. 可视化不是装饰，而是降低理解成本

诊疗台用“病区、病人、血条、治疗队列”的隐喻，把 Agent 能力包质量变成可扫读的界面：

- 左侧病区索引：快速知道 Codex/Claude 哪边更健康。
- 中央恢复走势：当前分和预计恢复分一眼可见。
- 右侧病人详情：路径、恢复进度、发现项、治疗建议集中展示。
- 顶部实时状态：修复文件时显示复诊状态，完成后自动更新。

这让非作者也能快速理解一个 skill 仓库“哪里坏、为什么坏、先修哪里”。

### 4. 默认安全，不静默修改用户环境

V1 默认只读扫描。`fix` 只支持 dry-run。唯一会写用户目录的命令是 `install-skill`，并且会在旧版本存在时备份，不会静默覆盖。

### 5. LLM 适合作为“会诊助手”，不适合作为默认执行器

纯规则可以稳定发现结构、安全和引用问题，但无法可靠理解所有 skill、hook、subagent 的真实意图。Skill Doctor 因此把 LLM 放在人工确认之后：

- 诊疗台会把 `review_required`、`manual_only`、`do_not_autofix` 等发现项汇总进“人工确认队列”。
- 用户可以一次性批量确认，不需要逐条点击。
- 确认弹窗可以复制结构化 LLM 修复上下文，用来生成补丁草案、解释阻断原因、列出缺失文件。
- LLM 输出不直接改写文件；用户确认后再修复，最终是否可发布仍以真实复诊报告为准。

这样既能利用 LLM 处理语义和跨文件推理，也不会让模型绕过安全门禁或伪造“已修复”状态。

## 本地运用

```bash
npx --registry=https://registry.npmjs.org/ https://github.com/Looperswag/skill-doctor/releases/download/v0.1.0/looperswag-skill-doctor-0.1.0.tgz clinic --home
```

这条命令会：

1. 扫描当前用户 home 下的 Codex / Claude Code 能力目录。
2. 生成 `report.json`、`summary.md`、`findings.jsonl`。
3. 启动本地 Web 诊疗台。
4. 默认监听被扫描目录，文件变更后自动复诊。

关闭实时监听：

```bash
npx --registry=https://registry.npmjs.org/ https://github.com/Looperswag/skill-doctor/releases/download/v0.1.0/looperswag-skill-doctor-0.1.0.tgz clinic --home --no-watch
```

只生成报告：

```bash
npx --registry=https://registry.npmjs.org/ https://github.com/Looperswag/skill-doctor/releases/download/v0.1.0/looperswag-skill-doctor-0.1.0.tgz scan --home --format markdown
npx --registry=https://registry.npmjs.org/ https://github.com/Looperswag/skill-doctor/releases/download/v0.1.0/looperswag-skill-doctor-0.1.0.tgz scan ./my-skill --format json --out reports/latest
```

安装成 Agent skill：

```bash
npx --registry=https://registry.npmjs.org/ https://github.com/Looperswag/skill-doctor/releases/download/v0.1.0/looperswag-skill-doctor-0.1.0.tgz install-skill --target both
```

默认安装位置：

- Codex：`$HOME/.agents/skills/skill-doctor`
- Claude Code：`$HOME/.claude/skills/skill-doctor`

## CLI

```bash
skill-doctor clinic --home --runner codex,claude
skill-doctor clinic --fixture demo --no-open --port 5201
skill-doctor scan <path|--home> --format json|markdown|sarif
skill-doctor install-skill --target codex|claude|both
skill-doctor report reports/latest/report.json --format markdown
skill-doctor fix --dry-run
```

## 当前检查项

- `SKILL.md` 入口文件缺失。
- frontmatter 缺少 `name` 或 `description`。
- `references/`、`scripts/`、`assets/` 引用断链。
- Subagent 元数据缺失。
- JSON 配置无法解析。
- hook 配置缺少 replay fixture 线索。
- 过宽触发描述，例如 `always use this skill`。
- 试图覆盖 system/developer 指令的上下文污染。
- `npm install -g`、`pip install --user` 等全局安装。
- `curl | bash` 远程脚本直连执行。
- `printenv` 泄露环境变量风险。
- 危险删除模式。
- 硬编码 `.claude`、`.codex`、`/Users/...` 等路径。

## 报告格式

V1 使用 `skill-doctor.report.v1`：

```json
{
  "schema_version": "skill-doctor.report.v1",
  "generated_at": "2026-07-08T08:48:34.292Z",
  "summary": {
    "score": 49,
    "confidence": 0.89,
    "gate": "blocked",
    "patient_counts": {
      "skill": 2,
      "hook": 0,
      "subagent": 1,
      "config": 0,
      "folder": 0
    },
    "blockers": 5,
    "warnings": 1
  },
  "patients": [],
  "findings": []
}
```

报告会写出：

- `report.json`：完整机器可读报告。
- `summary.md`：适合发给团队或放进 PR 的治疗报告。
- `findings.jsonl`：适合后续分析和 CI 聚合。

## 项目结构

```text
packages/core      清单扫描、规则、评分、Markdown 报告
packages/cli       npm CLI、本地 server、实时复诊、skill 模板、demo fixture
apps/clinic        React/Vite 诊疗台，构建后打包进 CLI
skill/skill-doctor 可复制给 Codex / Claude Code 使用的 skill
docs               设计长文、原始项目笔记、README 资产
fixtures           坏 skill、坏 hook、跨 runner 样例
```

## 开发

```bash
npm install
npm test
npm run typecheck
npm run build
node packages/cli/dist/index.js scan --fixture demo --format markdown
node packages/cli/dist/index.js clinic --fixture demo --no-open --port 5201
```

## 安全边界

`skill-doctor` 不推荐 `curl | bash` 安装。一个专门检查 `curl | bash` 风险的工具，不应该用 `curl | bash` 分发自己。

默认命令不会修改真实 home 目录、仓库文件或全局运行器配置。需要写入用户目录的场景必须显式调用 `install-skill`。

## 适合谁

- 正在维护 Codex / Claude Code skills 的个人开发者。
- 想把私有 skill 仓库开放给别人复制使用的创作者。
- 需要在团队内建立 Agent 能力包质量门禁的人。
- 希望让非作者也能看懂 skill 质量和修复优先级的人。

## License

MIT
