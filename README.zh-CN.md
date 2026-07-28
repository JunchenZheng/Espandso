# Expandso

[中文](README.zh-CN.md) | [English](README.md)

[下载 Expandso v0.5.0](https://github.com/JunchenZheng/Espandso/releases/tag/v0.5.0) | [用户手册](https://expandso.gitbook.io/expandso-user-guide)

Expandso 是一个友好、直观的 Espanso 桌面应用封装。它通过清爽的图形界面简化 snippet 管理，让你可以预览 YAML 配置、添加文本匹配、验证触发词，并一键重启 Espanso。

## 功能

- **添加 snippet**：直接在桌面应用中创建文本、文件、图片和表单 snippet。
- **删除 snippet**：从 YAML 配置中删除单个 snippet，或批量删除选中的匹配项。
- **可视化 YAML 编辑**：通过聚焦的可视化编辑器预览和编辑 Espanso YAML 文件。
- **从 Alfred 导入**：将 Alfred snippets 导入到选中的 Espanso 集合中。
- **冲突检测**：保存前检测重复或冲突的触发词。

## 命令行模式

**当前命令行模式仅支持 macOS，后续会支持 Windows 等更多平台。**

Expandso 可以在不打开桌面界面的情况下添加 snippets，因此适合配合 Alfred、Raycast 等第三方启动器使用。

```bash
expandso add --mode text --trigger ":hello" --content "Hello world" --description "Greeting"
expandso add --mode file --trigger ":notes" --content "$HOME/notes/snippet.txt"
expandso add --mode image --trigger ":logo" --content "$HOME/Pictures/logo.png"
```

不同模式会以不同方式解释 `--content`：

- `text`：写入 `replace` 的替换文本。
- `file`：由 Espanso 通过 shell `cat` 变量读取的文件路径。
- `image`：写入 `image_path` 的图片路径。

默认情况下，snippet 会写入 Espanso match 目录下的 `base.yml`。该目录优先通过 `espanso path` 解析，并带有平台默认兜底路径。Espanso 会从文件变更中重新加载 snippets，因此 CLI 不会默认运行 `espanso restart`，除非传入 `--restart`。可以使用 `--config` 选择其他 YAML 文件，或使用 `--match-dir` 指定 match 目录。

在 macOS 上，`./install_tauri_app.sh` 会把命令安装为 `~/.local/bin/expandso`，并链接到 `Expandso.app` 内部的可执行文件。请确保 `~/.local/bin` 已加入 shell 的 `PATH`。

## 开发

### 快速安装

构建 Tauri `.app` 包、安装到 `/Applications`、安装 CLI 链接、停止旧的 Expandso 进程，并启动新应用：

```bash
./install_tauri_app.sh
```

安装到自定义目录：

```bash
./install_tauri_app.sh "$HOME/Applications"
```

### 详细命令

检查 Node.js/npm 并安装项目依赖：

```bash
./scripts/setup_npm_env.sh
```

只检查本地 Node.js/npm 环境，不安装依赖：

```bash
./scripts/setup_npm_env.sh --check-only
```

只运行 Vite 前端：

```bash
npm run dev
```

以开发模式运行 Tauri 桌面应用：

```bash
npm run tauri dev
```

类型检查并把前端构建到 `dist-gui/`：

```bash
npm run build
```

构建 macOS `.app` 包：

```bash
npm run tauri build
```

运行聚焦的测试层：

```bash
npm run test:unit:ts
npm run test:component
npm run test:integration
npm run test:unit:rs
```

运行跨层单元检查或完整本地测试套件：

```bash
npm run check:unit
npm run check:all
```

macOS 构建需要 Rust/Cargo 和 Apple Command Line Tools，因为 Tauri 会生成原生 macOS 应用包。

## 文档

- [用户手册](https://expandso.gitbook.io/expandso-user-guide)
- [UI Design System](docs/DESIGN_SYSTEM.md)
