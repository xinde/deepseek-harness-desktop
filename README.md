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

On launch, the app locates the checkout, compares its current Git commit with the last successful desktop build, and runs `pnpm install --frozen-lockfile` plus `pnpm run build` when required. It then starts the built `dsh web --port 0`, waits for the OS-assigned loopback URL, and loads that URL in the application window. Closing the app terminates dsh gracefully.

The first launch prompts for the checkout directory. Later launches use the saved path. These environment variables override discovery:

- `DSH_REPOSITORY`: absolute path to the deepseek-harness checkout.
- `DSH_NODE`: absolute path to Node.js.
- `DSH_PNPM`: absolute path to pnpm.
- `DSH_GIT`: absolute path to Git.

Launcher state and logs live in Electron's application data directory, outside the checkout. dsh continues to own `$DSH_HOME`, settings, credentials, profiles, and sessions.

## Privacy & logs

The launcher is local-only: it does not phone home or upload anything. Two things to know before sharing logs:

- On startup the launcher writes `using repository <absolute path>` to `launcher.log` in Electron's userData directory (e.g. `~/Library/Application Support/DeepSeek Harness/`). The log also captures the stdout/stderr of `pnpm install`, `pnpm run build`, and `dsh web`. If you paste this log into an issue, it will reveal your local directory layout and username.
- The launcher inherits your environment when starting child processes (`pnpm`, `node`). If you export API keys or tokens in your shell, those environment variables are passed through to `dsh`. Do not paste environment output into a public issue.

## macOS package

```sh
pnpm package:mac
```

The DMG is written under `release/`. An unsigned local build may trigger Gatekeeper warnings on another machine; public distribution requires an Apple Developer certificate and notarization.

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
