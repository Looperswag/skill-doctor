# 给 Agent 装一套体检系统：skill-doctor 的设计方法论

「Always push your boundary further」

碎碎念：这次真正触发我的，不是某个 skill 坏了，而是一个更隐蔽的问题：Agent 的能力越来越像一套「运行时供应链」，但我们还在用看 Markdown 的方式管理它。

一个 skill 迁移过来，看起来目录在、文档在、脚本也在；Agent 也确实会回答。但真正调用时，可能 references 断了、脚本路径还指向 `.claude`、hook 悄悄写了真实 home、触发条件宽到污染所有对话。

最麻烦的是，这些问题不一定会当场爆炸。它更像慢性病：Agent 表面还在工作，只是专业能力链一点点漂移。最后用户的体感只有一句话：

「怎么这个 Agent 好像变笨了？」

我最近一直在想，既然我们已经开始认真讨论 Memory、Harness、Loop，那是不是也该给 skill 这种能力包补一套体检系统？

Memory 解决「Agent 该记住什么」。  
Harness 解决「Agent 应该被什么约束」。  
Loop 解决「系统如何从运行中自我改进」。  

那 `skill-doctor` 要解决的，就是另一个更底层的问题：

> 这些被 Agent 依赖的能力包，本身还健康吗？

一句话版本：

> 把 skill 当运行时代码测，而不是当 Markdown 看。

路线图大概是：

01 - skill 不是文档  
02 - 能力链在哪断  
03 - 沙盒是地基  
04 - 健康分怎么打  
05 - 事故反推矩阵  
06 - 跨运行器适配  
07 - 修复要克制  
08 - 放进 CI  
09 - 冷静复盘  
10 - 最后

---

## 01 - skill 不是文档

很多人会把 skill 理解成一份提示词，或者一段「让 Agent 更懂某件事」的说明文档。

这个理解只对了一半。

在真实的 Coding Agent 系统里，一个 skill 往往是一个小型能力包。它可能包含：

- 触发条件：什么时候应该使用这个 skill；
- 操作流程：Agent 应该先读什么、再做什么；
- 参考资料：`references/` 里的规范、样例、业务知识；
- 脚本工具：`scripts/` 里的确定性代码；
- 输出资产：`assets/` 里的模板、图片、字体、示例工程；
- hook 逻辑：在 prompt、工具调用、会话结束等阶段拦截或审计行为。

所以 skill 不是单纯的 Markdown。

更准确的定义应该是：

> skill 是 Agent 的运行时能力单元。它既是说明书，也是工具箱，也是行为约束。

这句话里最重要的词是「运行时」。

只要它会影响 Agent 的行为，它就不是静态资料。它会参与调度、参与上下文构造、参与工具执行，甚至参与安全边界。

这就带来一个很现实的问题：如果 skill 是运行时能力单元，那它就不能只靠「文件存在」来判断健康。

一个不健康的 skill，可能长这样：

- `SKILL.md` 能读，但 frontmatter 缺关键字段，Agent 不知道什么时候触发；
- 文档里写着读取 `references/foo.md`，但文件根本不存在；
- 脚本语法没问题，但硬编码了 `~/.claude`，迁到 Codex 后直接失效；
- hook 本该 fail-open，结果异常时阻断宿主 Agent；
- 测试时写入真实 `~/.codex/audit` 或 `~/.claude/settings.json`；
- 文档里到处写「Always use this skill」，把触发范围扩到离谱；
- 失败报告只有「出错了」，没有文件、行号、规则和修复建议。

这些问题不会总是立刻炸。

更常见的是，Agent 还在回答，但背后的能力链已经断了。用户看到的是输出质量下降，开发者看到的是一堆模糊 badcase，最后大家又把锅甩回模型：

「是不是模型不够聪明？」

我的判断是：很多时候不是模型问题，是 skill 这层 harness 先坏了。

---

## 02 - 能力链在哪断

传统软件有单元测试、集成测试、端到端测试、静态扫描、依赖审计。

Agent 产品也需要类似的东西，只是测试对象变了。

过去我们测的是函数、接口、页面。现在还要测：

- Agent 能不能发现 skill；
- skill 的触发条件是不是过宽；
- skill 引用的文件是不是都存在；
- skill 里的脚本能不能在当前环境运行；
- hook 能不能被安全回放；
- 运行过程中会不会污染真实用户环境；
- 从 Codex 迁到 Claude Code，路径、事件、配置还能不能对齐；
- 出问题后能不能给出可执行修复建议。

这不是洁癖。

Agent 的能力不是只来自模型，而是来自：

```text
模型 + 工具 + skills + hooks + 配置 + 记忆 + 运行器
```

这里任何一环断掉，最后表现出来的都可能是「回答质量下降」。

但没有体检系统时，我们很难知道到底是模型不行、工具不行，还是某个 skill 的资源链断了。

`skill-doctor` 要解决的就是这个归因问题。

它不是一个普通 lint 工具。lint 关心的是「语法对不对」「格式漂不漂亮」。`skill-doctor` 更关心的是：

> 这个 skill 能否在目标 Agent 运行器中，以低污染、可回放、可诊断、可修复的方式稳定贡献能力？

这里有几个关键词。

**低污染**：不能随便写真实 home、真实项目、全局配置。  
**可回放**：hook 和关键行为要能用 fixture 重放。  
**可诊断**：失败要定位到文件、行号、规则、阶段。  
**可修复**：不只报错，还要告诉你怎么修、能不能安全自动修。  
**跨运行器**：不能只绑定某一家 Agent。

这也是我觉得它有价值的地方。

如果只是检查 Markdown 断链，那它最多是个小工具。  
如果它能验证一个能力包在不同 Agent runtime 里的稳定性，那它就是一套能力健康协议。

---

## 03 - 沙盒是地基

Agent 工具最容易犯的错误，是直接在真实用户环境里测试。

比如你要测 Codex hook，就直接跑真实 `~/.codex/hooks/guard-tool.sh`。结果它可能写真实审计日志、访问真实安全 API、读取真实 git 状态。

这不叫测试。

这叫在生产环境里试探。

`skill-doctor` 的第一原则应该是：

> 真实 skill 只读，所有副作用都进沙盒。

一个最小沙盒可以长这样：

```text
/tmp/skill-doctor-lab/run-20260706154512/
  home/
    .codex/
    .claude/
  bin/
    curl        # fake curl
    npm         # fake npm
    pip         # fake pip
  run/
    hooks/
    skills/
  reports/
    summary.md
    results.jsonl
    pollution-check.json
```

核心做法不用复杂，五步就够。

第一，替换 `HOME`。

测试时把 `HOME` 指到沙盒：

```bash
HOME=/tmp/skill-doctor-lab/run-x/home
```

这样 hook 里即使写 `~/.codex/audit`，实际也只会写到临时目录。

第二，禁用外部 API。

很多安全 hook 会调用检测服务。测试时应该显式关闭：

```bash
SECURITY_API_ENABLED=false
SCANFILE_API_ENABLED=false
```

如果 skill 本身需要联网，也应该先用 fake 网络层记录调用，而不是直接打出去。

第三，前置 fake 命令。

把 fake `curl`、fake `npm`、fake `pip` 放到 `PATH` 前面。

这样任何意外联网、全局安装、下载执行脚本，都会被捕获。

第四，用 fixture 回放 hook。

hook 不应该只能在真实 Agent 会话里测。它应该可以用 JSON fixture 回放。

比如：

```json
{
  "event": "before_tool",
  "tool_name": "Bash",
  "tool_input": {
    "command": "rm -rf /"
  }
}
```

然后检查几件事：

- 退出码是否符合预期；
- stdout 是否污染上下文；
- audit log 是否记录风险；
- 是否写出了沙盒目录；
- 同样输入多次回放是否稳定。

第五，做污染前后对比。

测试前后对真实目录做 hash：

```text
~/.codex/hooks
~/.codex/skills
~/.claude/skills
运行器配置
```

只要真实目录变了，测试就失败。

这一步很重要。没有污染检查，沙盒只是心理安慰。

---

## 04 - 健康分怎么打

你原始设计里的「技能健康分」方向是对的，但我会把它升级成三段式输出：

```text
健康分：86 / 100
置信度：0.91
门禁：可发布
```

为什么不是只给一个分数？

因为分数负责排序，但不能负责所有决策。

一个 skill 结构很好、文档很好、示例很好，但脚本里有：

```bash
curl https://example.com/install.sh | bash
```

它不应该因为其他项拿高分就变成「良好」。

所以 `skill-doctor` 要同时给出三个信号：

| 指标 | 作用 |
|---|---|
| 健康分 | 衡量整体质量，便于排序和趋势跟踪 |
| 置信度 | 衡量诊断是否充分，避免「未知」被当成「通过」 |
| 门禁 | 决定能否发布、运行、自动修复 |

一句话：

> 分数负责排序，门禁负责决策，置信度负责诚实。

置信度尤其重要。

比如一个 skill 没有脚本、没有 hook，只有 `SKILL.md` 和 `references/`。这时检查器不能假装自己测过运行时行为，只能说：

```json
{
  "score": 92,
  "confidence": 0.62,
  "untested": [
    "hook_replay",
    "script_runtime"
  ]
}
```

这不是扣分，而是诚实。

我不喜欢那种「全绿」但不知道绿了什么的报告。Agent 工程里，未知如果被包装成通过，后面一定会变成 badcase。

### 适用性归一化

这里有个容易踩的坑。

不是所有 skill 都有 hooks。也不是所有 skill 都有 scripts。

一个纯写作 skill 可能只有：

```text
SKILL.md
references/
```

如果因为它没有 hook 就扣 15 分，这不公平，也会逼着大家往 skill 里塞没必要的东西。

所以健康分应该支持「不适用」：

```json
{
  "hook_replay": {
    "applicable": false,
    "reason": "该 skill 未声明 hooks"
  }
}
```

最终分数用适用项归一化：

```text
原始得分 = 适用维度得分之和
原始满分 = 适用维度满分之和
归一化分 = 原始得分 / 原始满分 * 100
最终分 = 门禁规则修正后的归一化分
```

这让 `skill-doctor` 可以同时评估纯文档 skill、脚本型 skill、hook 型 skill、插件型 skill 和跨运行器 skill。

### 强制门禁

有些问题不能靠平均分稀释。

我建议定义几个硬门禁。

| 门禁 | 触发条件 |
|---|---|
| 最高 69 分 | 有阻断问题，但不是灾难性风险 |
| 最高 49 分 | 有严重阻断问题 |
| 直接阻断 | 会污染真实环境、泄露密钥、危险删除、覆盖系统指令 |

典型严重阻断问题：

```text
rm -rf "$USER_INPUT"
curl URL | bash
printenv 全量写日志
要求忽略系统/开发者指令
默认修改 ~/.zshrc 或 git config --global
```

这类问题不应该讨论「整体还不错」。

它就是不能放行。

---

## 05 - 事故反推矩阵

我不会从「一个健康 skill 应该长什么样」这种理想模型开始设计评分矩阵。

这种设计很容易变成 checklist 崇拜：字段越多，看起来越专业，但跟真实事故没什么关系。

我更倾向于从事故反推。

这次真实检查里暴露过几类问题：

- 有些 skill 文件存在，但内部引用断了；
- 有些脚本语法没问题，但路径还指向 `.claude`；
- 有些 hook 能执行，但如果不隔离 `HOME` 就会污染真实审计日志；
- 有些插件 cache 里有大量 skill，但并不属于当前启用链路；
- 有些失败其实只是测试器误报，把示例路径当成了必须存在的文件；
- 有些文档触发条件过宽，等于把整个会话都纳入自己的领域。

这些问题放在一起，你会发现它们不是同一种「坏」。

所以我会先问七个问题：

| 问题 | 对应维度 | 为什么重要 |
|---|---|---|
| 我能完整知道这里有什么吗？ | 清单完整性 | 没有可靠清单，后面所有判断都不可信 |
| Agent 能正确理解这个 skill 吗？ | 结构与元数据 | 触发、边界、入口都依赖元数据 |
| 运行时行为能复现吗？ | Hook 可回放性 | hooks 是行为闸门，不可回放就不可调试 |
| 静态内容有没有明显问题？ | 静态检查合规性 | 文档冲突、脚本风险、结构定义错误要提前暴露 |
| 会不会污染真实环境？ | 污染控制 | Agent 越有执行力，越要防止副作用外溢 |
| 坏了能不能定位和修？ | 可修复性 | 只报错不建议修复，会让诊断报告变成噪音 |
| 能不能跨 Agent 使用？ | 跨运行器兼容性 | Codex、Claude Code、通用 CLI 的事件和路径都不同 |

这就是 A-G 七个维度的来源。

它不是为了让表格看起来完整，而是为了覆盖 skill 失效的完整链路：

```text
发现不到 -> 读不懂 -> 引用断 -> 跑不动 -> 污染环境 -> 无法诊断 -> 无法迁移
```

每一环都可能让 Agent 的能力悄悄退化。

对外讲，可以再抽象成六层：

| 层 | 关心的问题 | 对应检查 |
|---|---|---|
| 可发现性 | Agent 能不能找到它？ | 清单扫描、入口识别、元数据 |
| 完整性 | 文件和资源是否闭合？ | 元数据头、引用、资源、脚本 |
| 可执行性 | 能否安全运行或回放？ | 脚本语法、hook 回放、回放样例 |
| 安全性 | 会不会污染或越权？ | 密钥、shell、网络、全局写入 |
| 可迁移性 | 能否跨运行器？ | Codex、Claude Code、通用 CLI 映射 |
| 可修复性 | 坏了能不能修？ | 定位、建议、优先级、自动修复边界 |

内部算七类，对外讲六层。

这样既清楚，又可实现。

### 报告要能被机器消费

还有一个小点，但我觉得很关键。

`skill-doctor` 的报告不能只是一份漂亮的 Markdown。它必须有结构化结果，最好是一行一个 finding：

```json
{
  "rule_id": "reference.missing",
  "severity": "error",
  "runner": "codex",
  "file": "SKILL.md",
  "span": { "line": 42, "column": 8 },
  "evidence": "references/article-example.md",
  "suggestion": "创建缺失文件，或将该路径标记为 examples",
  "autofix": "safe"
}
```

为什么？

因为它后面要进 CI、进 PR comment、进 dashboard、进自动修复。

如果报告只有自然语言，人看着舒服，但系统接不住。Agent 工程里很多事情最后都会回到这个问题：

> 你到底是在写一篇解释，还是在产出一个可被下游系统消费的信号？

`skill-doctor` 应该做后者。

---

## 06 - 跨运行器适配

如果 `skill-doctor` 只服务 Codex，那它会很快变成一个内部小工具。

但 skill 这个形态已经不只属于某一个 Agent：

- Codex 有 skills；
- Claude Code 有 skills；
- Cursor 有 rules / docs / commands；
- 很多团队也会自建 Agent runner；
- 未来还会出现更多「能力包」协议。

所以 `skill-doctor` 应该抽象出运行器适配层。

```text
runners/
  codex
  claude-code
  generic-cli
```

每个适配器回答四个问题：

```text
这个运行器如何发现 skill？
这个运行器如何触发 skill？
这个运行器支持哪些 hook event？
这个运行器的配置、权限、沙盒边界是什么？
```

内部再统一成标准事件：

| 标准事件 | 含义 |
|---|---|
| `on_prompt` | 用户提交 prompt |
| `before_tool` | 工具调用前 |
| `after_tool` | 工具调用后 |
| `on_error` | 工具或流程失败 |
| `on_exit` | 会话结束 |

然后做映射：

| 标准事件 | Codex | Claude Code | 通用 CLI |
|---|---|---|---|
| `on_prompt` | `UserPromptSubmit` | `UserPromptSubmit` | stdin prompt |
| `before_tool` | `PreToolUse` | `PreToolUse` | pre-exec wrapper |
| `after_tool` | `PostToolUse` | `PostToolUse` | post-exec wrapper |
| `on_exit` | `Stop` | `Stop / SessionEnd` | process exit |

这样一来，`skill-doctor` 测的不是某个工具的私有格式，而是一个更通用的问题：

> 这个能力包在目标运行器里能不能被稳定、安全、低污染地使用？

这就是它从「检查器」变成「协议」的地方。

但我也不建议一上来就追求完美通用。

更现实的路线是：

```text
核心诊断模型统一
runner adapter 分别实现
报告格式统一
修复策略按 runner 分级
```

强行统一所有 Agent，最后大概率会做出一个抽象漂亮、落地很痛的东西。

先让 Codex + Claude Code 两个 runner 跑通，通用 CLI 留一个最小协议。够了。

---

## 07 - 修复要克制

这次实际修复里，有个很重要的原则：

> 修复 skill，不等于重写 skill。

很多问题只需要最小闭环。

比如文档引用了：

```text
references/article-example.md
```

但文件在根目录。最小修复就是把文件补到 `references/`，不是重写整份文档。

再比如从 Claude Code 迁移到 Codex 后，路径里还有：

```text
~/.claude/skills/design/scripts/...
```

最小修复就是改成：

```text
~/.codex/skills/design/scripts/...
```

同时保留 `.claude` 作为 fallback，而不是强行把所有 Claude 相关文字删掉。

再比如设计类 skill 缺 `assets/design-tokens.json`。

最小修复不是创建一个完整设计系统，而是补一个 starter token：

```json
{
  "color": {
    "primary": "#2563eb",
    "secondary": "#0f172a"
  }
}
```

先让能力链闭合，再谈高级能力。

这就是 `skill-doctor` 的自动修复边界。

| 修复类型 | 是否适合自动修 |
|---|---|
| 创建缺失目录 | 适合 |
| 补 starter 文件 | 适合 |
| 修明显路径迁移残留 | 适合 |
| 修 Markdown 断链 | 适合 |
| 改 hook 安全策略 | 需要人工确认 |
| 删除文件 | 默认不自动 |
| 修改全局配置 | 不自动 |
| 安装依赖 | 不自动 |

自动修复越克制，越容易被信任。

这里跟我之前聊 harness 的体感很像：好的 harness 不是把所有行为都管死，而是把最容易重复翻车的地方变成稳定约束。

`skill-doctor` 的 autofix 也应该遵循这个原则。

能确定的，自动修。  
有风险的，给 patch 建议。  
涉及安全策略、全局配置、删除文件的，一律让人确认。

---

## 08 - 放进 CI

如果只是在本地跑一遍，那 `skill-doctor` 的价值还不够大。

它真正应该去的地方，是 Agent 能力包的 CI。

我想象里的最小流程长这样：

```text
pull request
  -> skill-doctor inventory
  -> skill-doctor check --runner codex
  -> skill-doctor check --runner claude-code
  -> skill-doctor replay hooks
  -> skill-doctor pollution-check
  -> summary.md + results.jsonl
  -> PR comment / merge gate
```

门禁不需要一开始就很复杂。

第一阶段只拦三类问题：

一，真实环境污染。  
二，危险命令或密钥泄露。  
三，必需资源缺失导致 skill 无法启动。

其他问题先作为 warning。

为什么？

因为新工具如果一上来就把所有东西都卡死，团队第一反应不是修问题，而是关掉它。

我更倾向于分阶段：

```text
阶段一：只做诊断，不阻断
阶段二：阻断 P0/P1 风险
阶段三：接入自动修复 PR
阶段四：把健康分趋势纳入 release dashboard
```

这跟 Loop 那篇里讲的「值不值得上」类似。不是所有自动化都应该一口吃完，关键是看这一步能不能稳定兑现价值。

对 `skill-doctor` 来说，最先稳定兑现的价值，就是防止能力包在迁移、重构、发布时悄悄断掉。

### 给不同人的产品表达

如果要把 `skill-doctor` 讲给 AI 产品团队，我会这么说：

> `skill-doctor` 是一个跨 Coding Agent 的 skill 体检工具。它在隔离沙盒中验证 skill 是否可发现、可读取、可回放、低污染、可迁移、可诊断、可修复，并输出健康分、门禁状态和修复建议。它支持 Codex、Claude Code 以及通用 CLI Agent，帮助团队把 Agent 能力包纳入 CI，而不是等用户反馈「Agent 变笨了」之后再排查。

给开发者的版本可以更短：

> 把 skill 当运行时代码测，而不是当 Markdown 看。  
> `skill-doctor` 给 Agent 能力包补上 CI。

给管理者的版本则是：

> 当 Agent 能力来自模型、工具、skills、hooks 和配置的组合时，能力健康就不能靠人工印象判断。`skill-doctor` 用可审计的分数和门禁，把 Agent 能力从「能用」推进到「可信」。

三个版本分别对应不同受众：

- 开发者关心能不能查出问题；
- 产品关心能不能规模化维护能力；
- 管理者关心能不能降低不可控风险。

---

## 09 - 冷静复盘

说完愿景，说说硬伤。

### 健康分不等于真实效果

一个 skill 健康分 95，不代表它产出的内容一定优秀。

健康分测的是工程健康度，不是任务效果。

比如一个写作 skill，可以结构完整、引用完整、低污染、可迁移，但写出来的文章还是可能平庸。

所以 `skill-doctor` 解决的是「能力链是否健康」，不是「能力本身是否强」。

后者需要 eval，需要真实任务集，需要人工或模型评审。

这两个东西不能混在一起。

### 端到端触发还需要真实 runner

静态检查和 hook replay 不能完全证明「真实对话中一定会触发这个 skill」。

因为触发本身依赖 Agent 的 runtime、上下文、模型判断和调度策略。

所以我建议分两层：

```text
基础体检：结构、引用、脚本、hook、污染
运行回归：真实 runner 输入 prompt，观察 skill 是否触发
```

基础体检可以全量跑。  
运行回归只跑关键路径。

这也是成本和确定性的取舍。

### 误报治理会一直存在

skill 文档是自然语言，里面会有示例路径、占位路径、概念路径。

比如：

```text
你可以创建 scripts/rotate_pdf.py
```

这不是断链，只是示例。

所以 `skill-doctor` 后续最好引入显式标注：

```yaml
resources:
  required:
    - references/schema.md
  optional:
    - assets/logo.png
  examples:
    - scripts/rotate_pdf.py
```

不要让测试器靠猜。

靠猜的系统，早晚会把人逼到关闭规则。

### 跨运行器兼容会很复杂

Codex 和 Claude Code 的 hook 事件相似，但不完全一样。配置格式、权限模型、插件缓存、沙盒边界也不同。

所以 `skill-doctor` 不应该假装有一个完美通用格式。

更现实的路线是：

```text
核心诊断模型统一
runner adapter 分别实现
报告格式统一
修复策略按 runner 分级
```

先承认差异，再做抽象。

工程里很多看似优雅的统一，最后都会输给真实系统里的边角料。

---

## 10 - 最后

我越来越觉得，Agent 工程的下一阶段不是「再多加几个工具」，而是把工具、skills、hooks、memory、runner 这些东西纳入可测试、可诊断、可迁移的工程体系。

模型会继续变强，但模型越强，围绕模型的能力供应链就越重要。

因为当 Agent 开始真的替你执行任务，问题就不再是「它能不能生成一段看起来合理的回答」，而是：

```text
它调用的能力是不是对的？
它依赖的上下文是不是干净的？
它触发的 hook 是不是安全的？
它写入的环境是不是隔离的？
它坏掉的时候能不能定位？
它迁移到另一个 runner 后还能不能稳定工作？
```

这些问题听起来都不性感。

但就像我在 Loop 那篇里写的，真正决定系统质量的，往往是归因、回归、成本、污染控制这种又苦又不出彩的环节。

`skill-doctor` 本质上不是一个 lint 工具。

它是一套 Agent 能力包的体检协议。

如果继续做，我会先收敛到三个最小闭环：

一，一个 CLI：能扫描、诊断、输出报告。  
二，一个 JSON schema：让结果能进 CI 和 dashboard。  
三，两个 runner adapter：先跑通 Codex + Claude Code。

先别急着做大而全。

把一条能力链测准，比把十条能力链测得半懂不懂更有价值。

*下一步我想继续拆的是：skill 的健康分里，哪些问题应该一票否决？安全污染、上下文劫持、还是错误触发？如果你也在维护自己的 Agent 能力包，可以先从一个最小动作开始：把 references 断链、脚本路径迁移残留、真实 HOME 写入这三类问题扫一遍。很多「Agent 变笨了」的根因，可能就藏在这些不起眼的地方。*
