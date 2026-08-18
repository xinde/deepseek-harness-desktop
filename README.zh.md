# DeepSeek Harness Desktop

中文 | [English](README.md)

本地 [`deepseek-harness`](https://github.com/deepseek-ai/deepseek-harness) 代码库的外部 Electron 启动器。本项目从不向上游 Git 仓库写入源码或配置。

## 前置要求

本启动器使用上游仓库已有的本地代码库，并在需要时自动完成依赖安装和构建。启动桌面应用前，先克隆仓库：

```sh
git clone https://github.com/deepseek-ai/deepseek-harness.git
```

环境要求：

- **Node.js**（符合上游 `package.json` 中的 engine 要求）
- **pnpm**（符合上游 `packageManager` 声明的版本）
- **Git**（用于读取代码库的提交信息）

准备好代码库和工具后即可安装并启动桌面应用。首次启动会要求选择代码库目录，在需要时自动安装依赖并构建 dsh，之后会记住该路径。

## 运行行为

启动时，应用会定位代码库，将其当前 Git 提交与上次成功构建的桌面版本对比，如有需要则执行 `pnpm install --frozen-lockfile` 和 `pnpm run build`。随后启动构建好的 `dsh web --port 0`，等待系统分配的 loopback 地址，并在应用窗口中加载该地址。关闭应用时优雅退出 dsh。

从 Finder 启动时，应用会读取登录 Shell 的可执行文件搜索路径，并将其传给 Git、Node.js、pnpm 和 dsh 子进程。即使 macOS GUI 应用最初只有精简的 `PATH`，也能找到通过 Homebrew、pnpm 或版本管理器安装的工具。

首次启动会弹出目录选择框，之后复用保存的路径。以下环境变量可覆盖自动查找：

- `DSH_REPOSITORY`：deepseek-harness 代码库的绝对路径。
- `DSH_NODE`：Node.js 的绝对路径。
- `DSH_PNPM`：pnpm 的绝对路径。
- `DSH_GIT`：Git 的绝对路径。

启动器状态和日志存放在 Electron 的应用数据目录中，位于代码库之外。dsh 继续自行管理 `$DSH_HOME`、设置、凭据、配置和会话。

## Windows 支持状态

目前尚不支持 Windows。启动器依赖 POSIX 登录 Shell 环境，并使用 `command -v` 查找工具；打包配置目前也只生成 macOS DMG。设置 `DSH_NODE`、`DSH_PNPM` 和 `DSH_GIT` 不能绕过登录 Shell 依赖。

Windows 版本仍需补齐原生工具发现、`.cmd` 进程处理、进程树关闭、Windows CI 验证，以及 NSIS 或便携版打包目标。

## 隐私与日志

本启动器完全本地运行，不联网上报任何数据。分享日志前有两点需要注意：

- 启动时，launcher 会把 `using repository <绝对路径>` 写入 Electron userData 目录下的 `launcher.log`（macOS 上比如 `~/Library/Application Support/deepseek-harness-desktop/`，Windows 上是 `%APPDATA%\deepseek-harness-desktop\`）。日志还会记录 `pnpm install`、`pnpm run build`、`dsh web` 的标准输出和标准错误。如果把这份日志贴到 issue 里，会暴露你的本地目录结构和用户名。
- 启动器启动子进程（`pnpm`、`node`）时会继承你的环境变量。如果 shell 里导出了 API key 或 token，这些环境变量会透传给 `dsh`。请不要把环境变量输出贴到公开 issue 中。

## macOS 打包

请根据 Mac 类型选择安装包：

| Mac | 安装包 |
| --- | --- |
| Apple Silicon（M1 及后续芯片） | `DeepSeek Harness-<version>-arm64.dmg` |
| Intel | `DeepSeek Harness-<version>-x64.dmg` |

```sh
pnpm package:mac        # Apple Silicon (arm64)
pnpm package:mac-intel  # Intel (x64)
```

DMG 会生成在 `release/` 目录下，文件名带架构后缀。在替换已安装版本前，先用 Command-Q 完全退出旧应用，再将新版拖入“应用程序”并选择“替换”。在跟本机架构不同的机器上首次构建会下载对应的 Electron 二进制。未签名的本地构建在别的机器上可能触发 Gatekeeper 警告；首次启动可在 Finder 中右键选择“打开”。公开分发需要 Apple Developer 证书和 notarization。

## 更新 dsh

正常更新上游代码库：

```sh
cd ../deepseek-harness
git pull
```

下次启动桌面应用时会检测到新提交并重新构建。启动器从不执行 `git pull`、不切换分支，也不修改上游已跟踪的文件。

## 开发

需要 Node.js、pnpm 和同级代码库：

```sh
pnpm install
pnpm test
pnpm run typecheck
pnpm dev
```

## 许可证

[MIT](LICENSE)
