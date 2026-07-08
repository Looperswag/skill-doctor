# skill-doctor

`skill-doctor` 是一个跨 Coding Agent 的 skill 体检工具。

它用于检查一个 skill 是否能在 Codex、Claude Code 以及通用命令行 Agent 中稳定工作，并评估它是否可发现、可读取、可回放、低污染、可迁移、可诊断、可修复。

一句话：

> 把 skill 当运行时代码测，而不是当 Markdown 看。

---

## 解决什么问题

Agent 的能力越来越多来自外部能力包：

- `SKILL.md`
- `references/`
- `scripts/`
- `assets/`
- hooks
- 插件配置
- runner 配置

这些文件会影响 Agent 的真实行为。它们不是静态说明文档。

常见问题包括：

- skill 能被发现，但触发条件过宽或过窄；
- 文档引用了不存在的 `references/` 或 `assets/`；
- 脚本语法正确，但硬编码了某个本机路径；
- 从 Claude Code 迁移到 Codex 后，仍残留 `~/.claude/skills`；
- hook 回放会写真实 home 目录或访问真实网络；
- skill 要求 Agent 永久改变行为，污染后续上下文；
- 出错后只有失败，没有文件、行号、修复建议。

`skill-doctor` 的目标是把这些问题提前暴露出来。

---

## 核心能力

| 能力 | 说明 |
|---|---|
| 清单扫描 | 枚举 skill 根目录、入口文件、脚本、资源、hook、配置 |
| 结构检查 | 检查 `SKILL.md`、frontmatter、目录结构、引用路径 |
| 脚本检查 | 对 skill 自带脚本做语法和高风险模式检查 |
| Hook 回放 | 使用 fixture 在沙盒中模拟 prompt、工具调用、退出事件 |
| 污染检测 | 检查上下文、工作区、用户环境、后续行为污染 |
| 跨运行器检查 | 检查 Codex、Claude Code、通用 CLI 的兼容性 |
| 健康分 | 输出 0-100 分、置信度、门禁状态 |
| 修复建议 | 输出可执行修复建议，并区分是否适合自动修复 |

---

## 支持的运行器

`skill-doctor` 的目标不是绑定某一个 Agent，而是通过适配器支持多个运行器。

建议结构：

```text
runners/
  codex
  claude-code
  generic-cli
```

每个运行器适配器负责回答：

- 如何发现 skill；
- 如何解析 skill 元数据；
- 支持哪些 hook 事件；
- 如何回放 hook；
- 配置文件在哪里；
- 权限和沙盒边界是什么。

内部统一成标准事件：

| 标准事件 | 含义 |
|---|---|
| `on_prompt` | 用户提交 prompt |
| `before_tool` | 工具调用前 |
| `after_tool` | 工具调用后 |
| `on_error` | 工具或流程失败 |
| `on_exit` | 会话结束 |

示例映射：

| 标准事件 | Codex | Claude Code | 通用 CLI |
|---|---|---|---|
| `on_prompt` | `UserPromptSubmit` | `UserPromptSubmit` | stdin prompt |
| `before_tool` | `PreToolUse` | `PreToolUse` | pre-exec wrapper |
| `after_tool` | `PostToolUse` | `PostToolUse` | post-exec wrapper |
| `on_exit` | `Stop` | `Stop / SessionEnd` | process exit |

---

## 沙盒模型

`skill-doctor` 默认不应直接在真实用户环境中执行 skill 或 hook。

推荐沙盒结构：

```text
/tmp/skill-doctor-lab/run-<timestamp>/
  home/
    .codex/
    .claude/
  bin/
    curl
    npm
    pip
  run/
    hooks/
    skills/
  reports/
    summary.md
    results.jsonl
    pollution-check.json
```

沙盒原则：

- 真实 skill 目录只读；
- `HOME` 指向沙盒；
- `CODEX_HOME`、`CLAUDE_HOME` 指向沙盒；
- 网络调用默认 mock；
- 全局安装命令默认拦截；
- 安全 API 默认禁用或 mock；
- 测试前后对真实目录做 hash 对比；
- 所有产物写入临时目录。

---

## 技能健康分

技能健康分是 `skill-doctor` 的核心评分模型。

它衡量的不是 skill 文件是否存在，而是：

> skill 在目标运行器中能否以低污染、可回放、可诊断、可修复的方式稳定贡献能力。

输出由三部分组成：

```text
健康分：86 / 100
置信度：0.91
门禁：可发布
```

| 指标 | 作用 |
|---|---|
| 健康分 | 衡量整体健康度，便于排序和趋势跟踪 |
| 置信度 | 衡量诊断是否充分，避免未知项被当成通过 |
| 门禁 | 决定是否可发布、可运行、可自动修复 |

---

## 评分维度

内部建议使用七个维度，总分 100。

| 维度 | 权重 |
|---|---:|
| A. 清单完整性 | 15 |
| B. 结构与元数据 | 15 |
| C. Hook 可回放性 | 15 |
| D. Lint 合规性 | 15 |
| E. 污染控制 | 15 |
| F. 可修复性与诊断质量 | 10 |
| G. 跨运行器兼容性 | 15 |
| **总计** | **100** |

对外可以解释成六层：

| 层 | 关心的问题 |
|---|---|
| 可发现性 | Agent 能不能找到它 |
| 完整性 | 文件、资源、引用是否闭合 |
| 可执行性 | 脚本和 hook 能不能安全运行 |
| 安全性 | 是否存在污染、越权、secret、危险命令 |
| 可迁移性 | 是否能跨 Codex、Claude Code、通用 CLI |
| 可修复性 | 出问题后能不能定位和修复 |

---

## 适用性归一化

不是所有 skill 都有 hooks，也不是所有 skill 都有 scripts。

因此每个维度都需要声明是否适用：

```json
{
  "hook_replay": {
    "applicable": false,
    "reason": "该 skill 未声明 hooks"
  }
}
```

推荐计算方式：

```text
适用得分 = 所有适用维度得分之和
适用满分 = 所有适用维度满分之和
归一化分 = 适用得分 / 适用满分 * 100
最终分 = 门禁和扣分规则修正后的归一化分
```

这样可以公平评估：

- 纯文档 skill；
- 脚本型 skill；
- hook 型 skill；
- 插件型 skill；
- 跨运行器 skill。

---

## 健康等级

| 分数 | 等级 | 含义 |
|---:|---|---|
| 90-100 | 优秀 | 可直接发布或复用 |
| 80-89 | 良好 | 基本健康，只有少量改进项 |
| 70-79 | 警告 | 可以运行，但存在结构或污染风险 |
| 50-69 | 高风险 | 运行不稳定，建议先修复 |
| 0-49 | 严重 | 不建议运行，可能污染环境或失败不可诊断 |

---

## 门禁规则

分数不能稀释高危问题。

只要出现 blocker，最终分最高不超过 69。

只要出现 critical blocker，最终分最高不超过 49。

典型 blocker：

- 无法解析 skill 根目录；
- 无入口文件；
- hook replay 会修改真实环境；
- 存在硬编码 secret；
- 存在危险删除命令；
- 默认修改全局 shell、git、npm 配置；
- 要求覆盖系统或开发者指令。

典型 critical blocker：

```text
rm -rf "$USER_INPUT"
curl URL | bash
printenv 全量写日志
ignore all previous instructions
默认写入 ~/.zshrc
```

门禁状态：

| 门禁 | 含义 |
|---|---|
| `可发布` | 无 blocker，高危项为 0 |
| `警告` | 有 warning，但无关键安全风险 |
| `阻断` | 存在 blocker，不建议运行 |
| `未知` | 关键检查无法完成，不能默认通过 |

---

## 状态分类

每个检查项都应有状态。

| 状态 | 含义 |
|---|---|
| `通过` | 明确通过 |
| `警告` | 有问题，但不阻塞 |
| `失败` | 明确失败，需要修复 |
| `阻塞` | 无法继续检查 |
| `不适用` | 该 skill 不适用 |
| `未知` | 信息不足，不能判断 |

注意：`未知` 不等于 `通过`。

对安全、污染、hook replay 等关键项，`未知` 应该降低置信度。

---

## 自动修复边界

`skill-doctor` 可以给出修复建议，但自动修复必须克制。

| 修复类型 | 自动修复策略 |
|---|---|
| 创建缺失目录 | 可自动修复 |
| 补 starter 文件 | 可自动修复 |
| 修明显路径迁移残留 | 可自动修复 |
| 修 Markdown 断链 | 可自动修复 |
| 调整 hook 安全策略 | 需要人工确认 |
| 删除文件 | 默认不自动 |
| 安装依赖 | 默认不自动 |
| 修改全局配置 | 禁止自动修复 |
| 涉及 secret | 禁止自动修复 |

每个修复建议应标注：

```text
safe_autofix
review_required
manual_only
do_not_autofix
```

---

## 推荐输出 JSON

```json
{
  "skill": {
    "name": "example-skill",
    "path": "./example-skill",
    "version": "0.1.0",
    "detected_runners": ["codex", "claude-code"]
  },
  "health": {
    "score": 86,
    "confidence": 0.91,
    "grade": "良好",
    "gate": "可发布",
    "raw_score": 88,
    "penalty": 2,
    "blocking": false
  },
  "dimensions": {
    "inventory": {
      "score": 13,
      "max": 15,
      "applicable": true,
      "status": "通过"
    },
    "hook_replay": {
      "score": 0,
      "max": 0,
      "applicable": false,
      "status": "不适用",
      "reason": "该 skill 未声明 hooks"
    }
  },
  "issues": [
    {
      "id": "ENV_GLOBAL_INSTALL",
      "severity": "高",
      "category": "环境污染",
      "file": "scripts/setup.sh",
      "line": 12,
      "message": "脚本执行全局 npm 安装。",
      "deduction": 6,
      "autofix": "manual_only",
      "suggestion": "改为项目本地依赖，或将安装步骤声明为需要用户确认的手动步骤。"
    }
  ],
  "repair_suggestions": [
    {
      "priority": "高",
      "title": "避免全局包安装",
      "files": ["scripts/setup.sh"],
      "safe_autofix": false
    }
  ]
}
```

---

## 推荐命令行输出

```text
skill-doctor 报告
────────────────

Skill: my-skill
Path: ./my-skill
检测到的运行器: codex, claude-code

健康分: 86 / 100
置信度: 0.91
等级: 良好
门禁: 可发布

分项:
  清单完整性          13 / 15
  结构与元数据        12 / 15
  Hook 可回放性       不适用
  Lint 合规性         11 / 15
  污染控制            14 / 15
  可修复性             8 / 10
  跨运行器兼容性      12 / 15

阻断问题:
  无

主要问题:
  [高] scripts/setup.sh:12
  检测到全局 npm 安装。

  [中] SKILL.md
  触发条件过宽。

修复建议:
  1. 将全局安装改为项目本地依赖。
  2. 收窄 skill 触发条件。
  3. 为关键 hook 增加 replay fixture。
```

---

## 建议项目结构

```text
skill-doctor/
  README.md
  src/
    core/
      inventory
      scoring
      lint
      sandbox
      repair
    runners/
      codex
      claude-code
      generic-cli
    rules/
      inventory
      metadata
      hooks
      scripts
      pollution
      compatibility
  fixtures/
    hooks/
    skills/
  reports/
  tests/
```

---

## 非目标

`skill-doctor` 不负责判断 skill 的业务效果。

它不会回答：

- 这个写作 skill 写得好不好；
- 这个设计 skill 审美强不强；
- 这个调研 skill 搜得是否全面；
- 这个 Agent 是否比另一个 Agent 更聪明。

它只回答：

> 这个 skill 的能力链路是否健康、低污染、可回放、可迁移、可修复。

业务效果需要额外的任务评测集和人工或模型评审。

---

## 当前设计原则

1. 真实目录只读，副作用进入沙盒。
2. 分数用于排序，门禁用于决策。
3. `未知` 不能默认算通过。
4. 不适用维度不扣分，采用归一化评分。
5. 自动修复要克制，默认不做破坏性修改。
6. 运行器差异通过 adapter 解决，不强行统一。
7. 把 skill 当运行时代码测，而不是当 Markdown 看。
