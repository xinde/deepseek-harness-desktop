# DeepSeek Harness Desktop

中文 | [English](README.md)

本地 [`deepseek-harness`](https://github.com/deepseek-ai/deepseek-harness) 代码库的外部 Electron 启动器。本项目从不向上游 Git 仓库写入源码或配置。

## 前置要求：先按源码方式运行 DeepSeek Harness

本启动器**不会**替你安装 DeepSeek Harness，它只负责从上游仓库的本地代码库启动 Web UI。安装本启动器之前，请先按照上游 [`deepseek-harness` README](https://github.com/deepseek-ai/deepseek-harness#run-from-source) 的 **Run from source** 步骤操作：

```sh
git clone https://github.com/deepseek-ai/deepseek-harness.git
cd deepseek-harness
pnpm install
pnpm run build
pnpm dsh web
```

环境要求：

- **Node.js**（上游项目需要较新的 LTS 版本）
- **pnpm**（上游项目的包管理器）
- **Git**（用于读取代码库的提交信息）

等上游代码库构建成功、能跑起 `dsh web` 之后，再安装并启动本桌面启动器。首次启动会要求选择代码库目录，之后会记住该路径。

## 运行行为

启动时，应用会定位代码库，将其当前 Git 提交与上次成功构建的桌面版本对比，如有需要则执行 `pnpm install --frozen-lockfile` 和 `pnpm run build`。随后启动构建好的 `dsh web --port 0`，等待系统分配的 loopback 地址，并在应用窗口中加载该地址。关闭应用时优雅退出 dsh。

首次启动会弹出目录选择框，之后复用保存的路径。以下环境变量可覆盖自动查找：

- `DSH_REPOSITORY`：deepseek-harness 代码库的绝对路径。
- `DSH_NODE`：Node.js 的绝对路径。
- `DSH_PNPM`：pnpm 的绝对路径。
- `DSH_GIT`：Git 的绝对路径。

启动器状态和日志存放在 Electron 的应用数据目录中，位于代码库之外。dsh 继续自行管理 `$DSH_HOME`、设置、凭据、配置和会话。

## Windows 平台说明

本启动器在 macOS 上开发，Windows 下能用，但需要先手动设置几项。

- **务必把 `DSH_NODE`、`DSH_PNPM`、`DSH_GIT` 设为绝对路径。** 启动器查找 `node`、`pnpm`、`git` 的方式是在 POSIX shell（`$SHELL`，缺省回退到 `/bin/zsh`）里执行 `command -v <名称>`。Windows 默认没有 POSIX shell，也没有 `command -v`，自动探测必然失败，启动会停在"找不到 …"的报错。请把每个变量指向真实的可执行文件，比如 `DSH_NODE=C:\Program Files\nodejs\node.exe`。
- **`DSH_PNPM` 要指向可执行文件，不能是 `.cmd` 垫片。** 子进程用 `child_process.spawn` 启动，在 Windows 上它无法直接运行 `.cmd`/`.bat` 包装脚本（会报 `ENOENT`）。npm 安装的 pnpm 实际是一个 `pnpm.cmd` 垫片，所以直接用 npm 装的 pnpm 可能跑不起来；建议改用自带原生可执行文件的 pnpm 版本，比如 `@pnpm/exe`。
- **`DSH_REPOSITORY` 是 Windows 路径**，比如 `C:\dev\deepseek-harness`。日志在 `%APPDATA%\deepseek-harness-desktop\launcher.log`（见「隐私与日志」）。
- **目前只配置了 macOS 打包。** `package.json` 里只有 `package:mac`，还没有 Windows 安装包目标。要出 Windows 安装包，需要在 `package.json` 里加 `nsis` 或 `portable` 目标，并在 Windows 上执行构建。

## 隐私与日志

本启动器完全本地运行，不联网上报任何数据。分享日志前有两点需要注意：

- 启动时，launcher 会把 `using repository <绝对路径>` 写入 Electron userData 目录下的 `launcher.log`（macOS 上比如 `~/Library/Application Support/deepseek-harness-desktop/`，Windows 上是 `%APPDATA%\deepseek-harness-desktop\`）。日志还会记录 `pnpm install`、`pnpm run build`、`dsh web` 的标准输出和标准错误。如果把这份日志贴到 issue 里，会暴露你的本地目录结构和用户名。
- 启动器启动子进程（`pnpm`、`node`）时会继承你的环境变量。如果 shell 里导出了 API key 或 token，这些环境变量会透传给 `dsh`。请不要把环境变量输出贴到公开 issue 中。

## macOS 打包

```sh
pnpm package:mac        # Apple Silicon (arm64)
pnpm package:mac-intel  # Intel (x64)
```

DMG 会生成在 `release/` 目录下，文件名带架构后缀：`DeepSeek Harness-<version>-arm64.dmg` 或 `DeepSeek Harness-<version>-x64.dmg`。在跟本机架构不同的机器上首次构建会下载对应的 Electron 二进制。未签名的本地构建在别的机器上可能触发 Gatekeeper 警告；公开分发需要 Apple Developer 证书和 notarization。

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
