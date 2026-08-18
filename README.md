# DeepSeek Harness Desktop

English | [中文](README.zh.md)

An external Electron launcher for a local [`deepseek-harness`](https://github.com/deepseek-ai/deepseek-harness) checkout. This project never writes source or configuration into the upstream Git repository.

## Prerequisites

This launcher uses an existing checkout of the upstream repository and builds it automatically when required. Clone the repository before starting the desktop app:

```sh
git clone https://github.com/deepseek-ai/deepseek-harness.git
```

Requirements:

- **Node.js** matching the upstream `package.json` engine requirement
- **pnpm** matching the upstream `packageManager` declaration
- **Git** (used to read the checkout's commit)

Install and launch the desktop app after the checkout and tools are available. On first launch it asks for the checkout directory, installs dependencies and builds dsh when needed, then remembers that path for later launches.

## Behavior

On launch, the app locates the checkout, compares its current Git commit with the last successful desktop build, and runs `pnpm install --frozen-lockfile` plus `pnpm run build` when required. It then starts the built `dsh web --port 0`, waits for the OS-assigned loopback URL, and loads that URL in the application window. Closing the app terminates dsh gracefully.

When launched from Finder, the app reads the login Shell's executable search path and passes it to Git, Node.js, pnpm, and dsh subprocesses. This keeps Homebrew, pnpm, and version-manager installations available even though macOS GUI applications start with a minimal `PATH`.

The first launch prompts for the checkout directory. Later launches use the saved path. These environment variables override discovery:

- `DSH_REPOSITORY`: absolute path to the deepseek-harness checkout.
- `DSH_NODE`: absolute path to Node.js.
- `DSH_PNPM`: absolute path to pnpm.
- `DSH_GIT`: absolute path to Git.

Launcher state and logs live in Electron's application data directory, outside the checkout. dsh continues to own `$DSH_HOME`, settings, credentials, profiles, and sessions.

## Windows status

Windows is not currently supported. The launcher reads a POSIX login Shell environment and resolves tools with `command -v`, and the package configuration currently produces macOS DMGs only. Setting `DSH_NODE`, `DSH_PNPM`, and `DSH_GIT` does not bypass the login Shell requirement.

A Windows release needs native tool discovery, `.cmd` process handling, process-tree shutdown, Windows CI coverage, and an NSIS or portable package target.

## Privacy & logs

The launcher is local-only: it does not phone home or upload anything. Two things to know before sharing logs:

- On startup the launcher writes `using repository <absolute path>` to `launcher.log` in Electron's userData directory (e.g. `~/Library/Application Support/deepseek-harness-desktop/` on macOS, `%APPDATA%\deepseek-harness-desktop\` on Windows). The log also captures the stdout/stderr of `pnpm install`, `pnpm run build`, and `dsh web`. If you paste this log into an issue, it will reveal your local directory layout and username.
- The launcher inherits your environment when starting child processes (`pnpm`, `node`). If you export API keys or tokens in your shell, those environment variables are passed through to `dsh`. Do not paste environment output into a public issue.

## macOS package

Choose the DMG that matches the Mac:

| Mac | Package |
| --- | --- |
| Apple Silicon (M1 and later) | `DeepSeek Harness-<version>-arm64.dmg` |
| Intel | `DeepSeek Harness-<version>-x64.dmg` |

```sh
pnpm package:mac        # Apple Silicon (arm64)
pnpm package:mac-intel  # Intel (x64)
```

The DMG is written under `release/` and named with its architecture. Building for a different architecture than your machine downloads the matching Electron binary on first run. Before replacing an installed copy, quit the old app completely with Command-Q, then drag the new copy into Applications and choose Replace. An unsigned local build may trigger Gatekeeper warnings on another machine; use Finder's Open command for the first launch. Public distribution requires an Apple Developer certificate and notarization.

## Updating dsh

Update the upstream checkout normally:

```sh
cd ../deepseek-harness
git pull
```

The next desktop launch detects the new commit and rebuilds it. The launcher never runs `git pull`, switches branches, or edits tracked upstream files.

## Development

Requires Node.js, pnpm, and the sibling checkout:

```sh
pnpm install
pnpm test
pnpm run typecheck
pnpm dev
```

## License

[MIT](LICENSE)
