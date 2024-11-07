# 下一步开发计划 (Next Step)

## 目标：以当前代码作为干净的 Initial commit 基线

### 1. 已完成

- [x] 清理本地依赖与构建产物：`node_modules/`、`dist-gui/`、`src-tauri/target/`、`src-tauri/gen/schemas/`。
- [x] 移除个人工具配置、IDE 配置、历史归档和临时辅助脚本。
- [x] 保留 `snippets/` 的忽略规则，避免把用户本地片段数据提交到仓库。
- [x] 收紧 `.gitignore`，避免误忽略 `src/lib/`。

### 2. 下一步任务

- [ ] 检查 staged diff，确认 Initial commit 的文件边界。
- [ ] 运行前端、Tauri 和 Python CLI 的基础验证。
- [ ] 创建新的 Initial commit。
