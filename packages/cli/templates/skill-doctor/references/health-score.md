# 技能健康分

每个病人按 0 到 100 分评估。核心维度包括：清单完整性、结构与元数据、hook 回放、静态 lint、污染控制、可修复性、运行器兼容性。

采用适用维度归一化。不要因为纯文档 skill 没有 hook 就扣分，但如果运行时行为无法验证，要降低置信度。

门禁规则：

- 出现高风险 blocker 时，最终分最高为 69。
- 出现 critical blocker 时，最终分最高为 49。
- `unknown` 不等于 `pass`。

典型 critical blocker 包括 `rm -rf "$USER_INPUT"`、`curl URL | bash`、打印全部环境变量、覆盖系统/开发者指令、默认写入全局 shell/profile。
