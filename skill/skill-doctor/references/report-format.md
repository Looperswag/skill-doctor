# 报告格式

输出报告时包含：

- `schema_version: "skill-doctor.report.v1"`
- `patients[]`：正在诊断的 skill、hook、subagent 或 config。
- `findings[]`：每个问题一条结构化发现项。
- `summary`：聚合健康分、置信度、门禁状态、计数、阻断项和警告项。

每个发现项应包含 `rule_id`、严重级别、分类、文件、可选位置、证据、消息、建议、自动修复类别、扣分和病人 ID。
