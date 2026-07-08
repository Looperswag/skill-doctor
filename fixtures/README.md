# Fixtures

可随 npm 包发布的 demo fixture 放在 `packages/cli/fixtures/demo-home`，这样 `npx skill-doctor@latest clinic --fixture demo` 可以直接使用。

本地运行：

```bash
node packages/cli/dist/index.js scan --fixture demo --format markdown
node packages/cli/dist/index.js clinic --fixture demo --no-open
```
