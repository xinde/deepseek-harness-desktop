# DeepSeek Harness Desktop

English | [中文](README.zh.md)

An external Electron launcher for a local [`deepseek-harness`](https://github.com/deepseek-ai/deepseek-harness) checkout. This project never writes source or configuration into the upstream Git repository.

## Prerequisites: run DeepSeek Harness from source first

This launcher does **not** install DeepSeek Harness for you — it launches the Web UI from a local checkout of the upstream repository. Before installing this launcher, follow the **Run from source** instructions in the upstream [`deepseek-harness` README](https://github.com/deepseek-ai/deepseek-harness#run-from-source):

```sh
git clone https://github.com/deepseek-ai/deepseek-harness.git
cd deepseek-harness
pnpm install
pnpm run build
pnpm dsh web
```

Requirements:

- **Node.js** (the upstream project requires a recent LTS version)
- **pnpm** (the upstream project's package manager)
- **Git** (used to read the checkout's commit)

Once the upstream checkout builds and runs `dsh web` successfully, install and launch this desktop launcher. On first launch it asks for the checkout directory; later launches reuse the saved path.

## Behavior

On launch, the app locates the checkout, compares its current Git commit with the last successful desktop build, and runs `pnpm install --frozen-lockfile` plus `pnpm run build` when required. It then starts the built `dsh web --host 127.0.0.1 --port 0 --no-open`, waits for the complete loopback readiness URL (including any authentication path or query), and loads that URL in the application window. Port `0` asks the operating system for an available port, so changes to the upstream default port do not affect the launcher. Closing the app terminates dsh gracefully.

When launched from Finder, the app reads the login Shell's executable search path and passes it to Git, Node.js, pnpm, and dsh subprocesses. This keeps Homebrew, pnpm, and version-manager installations available even though macOS GUI applications start with a minimal `PATH`.

The first launch prompts for the checkout directory. Later launches use the saved path. These environment variables override discovery:

- `DSH_REPOSITORY`: absolute path to the deepseek-harness checkout.
- `DSH_NODE`: absolute path to Node.js.
- `DSH_PNPM`: absolute path to pnpm.
- `DSH_GIT`: absolute path to Git.

The upstream launch contract is centralized and can be overridden without editing launcher code:

- `DSH_DESKTOP_CLI_ENTRY`: repository-relative built CLI entry (default `apps/cli/lib/bin.js`).
- `DSH_DESKTOP_WEB_HOST`: bind host used by the default argument list (default `127.0.0.1`).
- `DSH_DESKTOP_WEB_PORT`: port used by the default argument list (default `0`; valid range `0`–`65535`).
- `DSH_DESKTOP_WEB_ARGS`: non-empty JSON string array replacing the complete Web argument list. When set, it takes precedence over `DSH_DESKTOP_WEB_HOST` and `DSH_DESKTOP_WEB_PORT`; for example `["--profile","web","--port","0","--no-open"]`.
- `DSH_DESKTOP_BUILD_ARTIFACTS`: non-empty JSON string array of repository-relative files used to decide whether a rebuild is required.
- `DSH_DESKTOP_START_TIMEOUT_MS` and `DSH_DESKTOP_SHUTDOWN_TIMEOUT_MS`: positive integer timeout overrides in milliseconds.

Launcher state and logs live in Electron's application data directory, outside the checkout. dsh continues to own `$DSH_HOME`, settings, credentials, profiles, and sessions.

## Windows notes

The launcher is developed on macOS; on Windows it works, but you must set a few things by hand first.

- **Set `DSH_NODE`, `DSH_PNPM`, and `DSH_GIT` to absolute paths.** The launcher finds `node`, `pnpm`, and `git` by running `command -v <name>` in a POSIX shell (`$SHELL`, falling back to `/bin/zsh`). Windows has no POSIX shell and no `command -v` by default, so automatic detection always fails and startup stops with a "找不到 …" error. Point each variable at the real binary, e.g. `DSH_NODE=C:\Program Files\nodejs\node.exe`.
- **Point `DSH_PNPM` at an executable, not a `.cmd` shim.** Child processes are started with `child_process.spawn`, which on Windows cannot run `.cmd`/`.bat` wrappers directly (they fail with `ENOENT`). npm installs pnpm as a `pnpm.cmd` wrapper, so a plain npm-installed pnpm may not work; prefer a pnpm build that ships a native executable, such as `@pnpm/exe`.
- **`DSH_REPOSITORY` is a Windows path**, for example `C:\dev\deepseek-harness`. The log is at `%APPDATA%\deepseek-harness-desktop\launcher.log` (see Privacy & logs).
- **Only the macOS package target is configured.** `package.json` ships `package:mac` only and there is no Windows installer target yet. To build a Windows installer, add an `nsis` or `portable` target to `package.json` and run the build on Windows.

## Privacy & logs

The launcher is local-only: it does not phone home or upload anything. Two things to know before sharing logs:

- On startup the launcher writes `using repository <absolute path>` to `launcher.log` in Electron's userData directory (e.g. `~/Library/Application Support/deepseek-harness-desktop/` on macOS, `%APPDATA%\deepseek-harness-desktop\` on Windows). The log also captures the stdout/stderr of `pnpm install`, `pnpm run build`, and `dsh web`. Browser authentication token values in URLs are replaced with `<redacted>`, but sharing the log still reveals your local directory layout and username.
- The launcher inherits your environment when starting child processes (`pnpm`, `node`). If you export API keys or tokens in your shell, those environment variables are passed through to `dsh`. Do not paste environment output into a public issue.

## macOS package

```sh
pnpm package:mac        # Apple Silicon (arm64)
pnpm package:mac-intel  # Intel (x64)
pnpm package:mac-all    # Both architectures
```

The DMG is written under `release/` and named with its architecture: `DeepSeek Harness-<version>-arm64.dmg` or `DeepSeek Harness-<version>-x64.dmg`. Building for a different architecture than your machine downloads the matching Electron binary on first run. An unsigned local build may trigger Gatekeeper warnings on another machine; public distribution requires an Apple Developer certificate and notarization.

## Automated GitHub prereleases

Every push to `main` runs tests and type-checking, builds arm64 and x64 DMGs, creates `SHA256SUMS.txt`, and publishes them to a GitHub prerelease tagged `desktop-v<version>-<commit>`. The same files are retained as a workflow artifact for 30 days. The packages are unsigned; macOS may show a Gatekeeper warning.

To use another release branch, change `on.push.branches` in `.github/workflows/release.yml`. The workflow can also be run manually from the GitHub Actions page.

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
