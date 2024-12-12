# 下一步开发计划 (Next Step)

## 当前阶段：YAML-first 静态文本片段编辑器 (已完成)

### 1. 已完成

- [x] 类型扩展：在 `src/logic/types.ts` 中支持 `trigger?` 与 `triggers?` 互斥模型。
- [x] 工具函数：新增 `src/logic/snippetUtils.ts` 处理 trigger 解析、normalize 与 UI 状态构建。
- [x] YAML 编辑器：在 `src/logic/yamlEditor.ts` 中追加新 match，并保留现有 YAML 内容。
- [x] 校验器升级：在 `src/logic/validate.ts` 中支持多触发器互斥、非空及去重排查。
- [x] UI 升级：在 `src/App.tsx` 中使用 YAML 扫描与预览作为唯一主流程，并在统计条右侧添加 Add Snippet。
- [x] 单元测试与构建：通过 `vitest run` 与 `vite build` 自动化测试。

### 2. 下一步任务

- [ ] 为现有 YAML match 增加编辑和删除能力。
- [ ] 在高级替换（P1/P2）功能中，进一步扩展 word / propagate_case / label / search_terms / regex 规则支持。
- [ ] 考虑扩展多 trigger chip/badge 可视化列表编辑组件。
