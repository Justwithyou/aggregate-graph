name: DrawHub
about: 提交改动前请阅读，确保 CI 与文档同步。
title: "[<type>]: "
---

## 变更类型

<!-- 勾选所有适用的项 -->
- [ ] Bug fix（`fix:`）
- [ ] New feature（`feat:`）
- [ ] Breaking change（破坏 API / 数据结构 / 命令行）
- [ ] Documentation update（`docs:`）
- [ ] Refactor / 内部重构（`refactor:`）
- [ ] CI / 工具链（`chore:`）
- [ ] Performance（`perf:`）

## 关联 Issue

<!-- 示例：Closes #123 / Refs #456 -->

## 变更说明

<!-- 一两句话概括这次改动 -->

## 截图 / 录屏（涉及 UI 时必填）

<!-- 粘贴图片或 GIF；纯文档 / 内部改动可省略 -->

## 自检清单（提交前全部勾选）

- [ ] `npm run build` 通过（tsc 类型检查 + Vite 构建）
- [ ] 新增 / 更新对应测试（如适用）
- [ ] 同步更新 `README.md` / `docs/`（涉及接口、快捷键、端口、依赖、安装步骤时）
- [ ] 未引入新的 `console.warn` / lint 错误
- [ ] commit message 遵循 Conventional Commits（`feat:` / `fix:` / `docs:` / `refactor:` / `chore:` / `perf:`）

## 影响范围

<!-- 新增依赖、行为变更、迁移说明、数据格式变更 -->

## 测试说明

<!-- 如何手工验证改动符合预期；如有 Playwright 用例请贴路径 -->