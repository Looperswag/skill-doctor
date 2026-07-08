# 安全修复边界

自动修复必须克制。

- `safe_autofix`：创建缺失的非破坏性目录或 starter 文件。
- `review_required`：收窄过宽触发条件、更新过期路径、修复 Markdown 链接。
- `manual_only`：依赖安装、hook 行为调整、安全策略调整。
- `do_not_autofix`：secret、破坏性删除、全局配置写入、覆盖系统/开发者指令。

没有用户明确确认时，不要修改全局 shell、git、npm 或运行器配置。
