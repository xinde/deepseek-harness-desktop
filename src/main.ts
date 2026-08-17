import { appendFile, mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { join, resolve } from 'node:path'
import type { Readable } from 'node:stream'
import { promisify } from 'node:util'
import { spawn, type ChildProcessByStdio } from 'node:child_process'
import { app, BrowserWindow, dialog, ipcMain, shell, type IpcMainInvokeEvent } from 'electron'
import {
  childEnvironment,
  parseDshWebUrl,
  REQUIRED_BUILD_ARTIFACTS,
  shouldBuild,
  type LauncherState,
  validateRepository,
} from './launcher.js'

const execFileAsync = promisify(execFile)
const OUTPUT_LIMIT = 256 * 1024
const START_TIMEOUT_MS = 90_000
const SHUTDOWN_TIMEOUT_MS = 8_000

interface LauncherStatus {
  phase: 'locating' | 'installing' | 'building' | 'starting' | 'ready' | 'error'
  message: string
  detail?: string
}

let window: BrowserWindow | undefined
let dshProcess: ChildProcessByStdio<null, Readable, Readable> | undefined
let currentStatus: LauncherStatus = { phase: 'locating', message: '正在定位本地仓库…' }
let bootInFlight = false
let quitting = false

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) app.quit()
else {
  app.on('second-instance', () => {
    window?.show()
    window?.focus()
  })
  void app.whenReady().then(async () => {
    registerIpc()
    await createWindow()
    await bootstrap()
  })
}

app.on('window-all-closed', () => app.quit())
app.on('before-quit', (event) => {
  if (quitting || dshProcess === undefined) return
  event.preventDefault()
  quitting = true
  void stopDsh().finally(() => app.quit())
})

async function createWindow(): Promise<void> {
  window = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 640,
    title: 'DeepSeek Harness',
    backgroundColor: '#10131a',
    show: false,
    webPreferences: {
      preload: join(app.getAppPath(), 'dist', 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) void shell.openExternal(url)
    return { action: 'deny' }
  })
  window.webContents.on('did-finish-load', () => sendStatus(currentStatus))
  window.once('ready-to-show', () => window?.show())
  await loadLauncherPage()
}

async function loadLauncherPage(): Promise<void> {
  await window?.loadFile(join(app.getAppPath(), 'src', 'index.html'))
}

function registerIpc(): void {
  ipcMain.handle('launcher:retry', async (event) => {
    assertLauncherPage(event)
    await bootstrap()
  })
  ipcMain.handle('launcher:choose-repository', async (event) => {
    assertLauncherPage(event)
    const selected = await dialog.showOpenDialog(window!, {
      title: '选择 deepseek-harness 仓库根目录',
      properties: ['openDirectory'],
    })
    const repositoryPath = selected.filePaths[0]
    if (selected.canceled || repositoryPath === undefined) return
    try {
      await validateRepository(repositoryPath)
      const state = await readState()
      await writeState({ ...state, repositoryPath, lastBuiltCommit: undefined })
      await bootstrap()
    } catch (error: unknown) {
      reportError(error)
    }
  })
  ipcMain.handle('launcher:open-log', async (event) => {
    assertLauncherPage(event)
    await ensureDataDir()
    await writeFile(logPath(), '', { flag: 'a' })
    await shell.showItemInFolder(logPath())
  })
}

function assertLauncherPage(event: IpcMainInvokeEvent): void {
  if (event.senderFrame === null || !event.senderFrame.url.startsWith('file://')) {
    throw new Error('launcher action is only available on the startup page')
  }
}

async function bootstrap(): Promise<void> {
  if (bootInFlight) return
  bootInFlight = true
  try {
    await stopDsh()
    if (window === undefined || window.isDestroyed()) await createWindow()
    else if (!window.webContents.getURL().startsWith('file://')) await loadLauncherPage()

    updateStatus({ phase: 'locating', message: '正在定位本地仓库…' })
    const repositoryPath = await resolveRepository()
    await validateRepository(repositoryPath)
    await appendLog(`using repository ${repositoryPath}`)

    const loginEnvironment = await resolveLoginEnvironment()
    const git = await resolveExecutable('git', 'DSH_GIT', loginEnvironment)
    const gitEnvironment = childEnvironment(loginEnvironment, [git])
    const head = await gitHead(git, repositoryPath, gitEnvironment)
    const state = await readState()
    const artifactsPresent = await allArtifactsPresent(repositoryPath)
    let node: string | undefined
    if (shouldBuild({ head, lastBuiltCommit: state.lastBuiltCommit, artifactsPresent })) {
      node = await resolveExecutable('node', 'DSH_NODE', loginEnvironment)
      const pnpm = await resolveExecutable('pnpm', 'DSH_PNPM', loginEnvironment)
      const buildEnvironment = childEnvironment(loginEnvironment, [git, node, pnpm])
      updateStatus({ phase: 'installing', message: '检测到新的 dsh 版本，正在同步依赖…', detail: shortCommit(head) })
      await runChecked(pnpm, ['install', '--frozen-lockfile'], repositoryPath, 'pnpm install', buildEnvironment)
      updateStatus({ phase: 'building', message: '正在构建 DeepSeek Harness…', detail: shortCommit(head) })
      await runChecked(pnpm, ['run', 'build'], repositoryPath, 'pnpm run build', buildEnvironment)
      await writeState({ ...state, repositoryPath, lastBuiltCommit: head })
    } else if (state.repositoryPath !== repositoryPath) {
      await writeState({ ...state, repositoryPath })
    }

    updateStatus({ phase: 'starting', message: '正在启动 DeepSeek Harness…', detail: shortCommit(head) })
    node ??= await resolveExecutable('node', 'DSH_NODE', loginEnvironment)
    const runtimeEnvironment = childEnvironment(loginEnvironment, [git, node])
    const url = await startDsh(node, repositoryPath, runtimeEnvironment)
    updateStatus({ phase: 'ready', message: 'DeepSeek Harness 已启动' })
    await window?.loadURL(url)
  } catch (error: unknown) {
    await stopDsh()
    reportError(error)
  } finally {
    bootInFlight = false
  }
}

async function resolveRepository(): Promise<string> {
  const state = await readState()
  const candidates = [
    process.env.DSH_REPOSITORY,
    state.repositoryPath,
    resolve(app.getAppPath(), '..', 'deepseek-harness'),
    resolve(process.cwd(), '..', 'deepseek-harness'),
    resolve(process.cwd(), 'deepseek-harness'),
  ].filter((candidate): candidate is string => candidate !== undefined)
  for (const candidate of [...new Set(candidates)]) {
    try {
      await validateRepository(candidate)
      return candidate
    } catch {
      // Candidate probing only swallows repository validation failures.
    }
  }
  const selected = await dialog.showOpenDialog(window!, {
    title: '选择 deepseek-harness 仓库根目录',
    message: '首次启动需要定位本地 deepseek-harness checkout。',
    properties: ['openDirectory'],
  })
  const repositoryPath = selected.filePaths[0]
  if (selected.canceled || repositoryPath === undefined) throw new Error('尚未选择 deepseek-harness 仓库。')
  await validateRepository(repositoryPath)
  await writeState({ ...state, repositoryPath })
  return repositoryPath
}

async function gitHead(git: string, repositoryPath: string, environment: NodeJS.ProcessEnv): Promise<string> {
  const { stdout } = await execFileAsync(git, ['rev-parse', 'HEAD'], {
    cwd: repositoryPath,
    encoding: 'utf8',
    env: environment,
  })
  const head = stdout.trim()
  if (!/^[0-9a-f]{40}$/u.test(head)) throw new Error(`无法识别 Git commit：${JSON.stringify(head)}`)
  return head
}

async function allArtifactsPresent(repositoryPath: string): Promise<boolean> {
  for (const artifact of REQUIRED_BUILD_ARTIFACTS) {
    try {
      await stat(join(repositoryPath, artifact))
    } catch {
      return false
    }
  }
  return true
}

async function resolveLoginEnvironment(): Promise<NodeJS.ProcessEnv> {
  const shellPath = process.env.SHELL ?? '/bin/zsh'
  try {
    const { stdout } = await execFileAsync(shellPath, ['-lc', 'printf "__DSH_PATH__=%s\\n" "$PATH"'], {
      encoding: 'utf8',
      timeout: 15_000,
    })
    const marker = '__DSH_PATH__='
    const line = stdout.trim().split('\n').findLast((candidate) => candidate.startsWith(marker))
    const loginPath = line?.slice(marker.length)
    if (loginPath !== undefined && loginPath !== '') return { ...process.env, PATH: loginPath }
  } catch (error: unknown) {
    await appendLog(`failed to read login PATH: ${error instanceof Error ? error.message : String(error)}`)
  }
  throw new Error('无法读取登录 Shell 的 PATH。请检查 Shell 启动配置后重试。')
}

async function resolveExecutable(
  name: 'git' | 'node' | 'pnpm',
  environmentName: string,
  environment: NodeJS.ProcessEnv,
): Promise<string> {
  const configured = environment[environmentName]
  if (configured !== undefined && configured.trim() !== '') return configured
  const shellPath = process.env.SHELL ?? '/bin/zsh'
  try {
    const { stdout } = await execFileAsync(shellPath, ['-lc', `command -v ${name}`], {
      encoding: 'utf8',
      env: environment,
      timeout: 15_000,
    })
    const resolved = stdout.trim().split('\n').at(-1)
    if (resolved !== undefined && resolved.startsWith('/')) return resolved
  } catch (error: unknown) {
    await appendLog(`failed to resolve ${name}: ${error instanceof Error ? error.message : String(error)}`)
  }
  throw new Error(`找不到 ${name}。请安装后重新打开应用，或通过 ${environmentName} 指定绝对路径。`)
}

async function runChecked(
  command: string,
  args: string[],
  cwd: string,
  label: string,
  environment: NodeJS.ProcessEnv,
): Promise<void> {
  await appendLog(`run ${label}`)
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd, env: environment, stdio: ['ignore', 'pipe', 'pipe'] })
    let tail = ''
    const collect = (chunk: Buffer): void => {
      const text = chunk.toString('utf8')
      tail = `${tail}${text}`.slice(-OUTPUT_LIMIT)
      void appendLog(text.trimEnd())
    }
    child.stdout.on('data', collect)
    child.stderr.on('data', collect)
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (code === 0) resolvePromise()
      else reject(new Error(`${label} 失败（code=${String(code)}, signal=${String(signal)}）。\n${tail}`))
    })
  })
}

async function startDsh(node: string, repositoryPath: string, environment: NodeJS.ProcessEnv): Promise<string> {
  const child = spawn(node, [join(repositoryPath, 'apps', 'cli', 'lib', 'bin.js'), 'web', '--port', '0'], {
    cwd: repositoryPath,
    env: environment,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  dshProcess = child
  return await new Promise<string>((resolvePromise, reject) => {
    let output = ''
    let settled = false
    const timeout = setTimeout(() => finish(new Error(`dsh 在 ${String(START_TIMEOUT_MS / 1000)} 秒内没有完成启动。\n${output}`)), START_TIMEOUT_MS)
    const finish = (result: string | Error): void => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      if (result instanceof Error) reject(result)
      else resolvePromise(result)
    }
    const collect = (chunk: Buffer): void => {
      const text = chunk.toString('utf8')
      output = `${output}${text}`.slice(-OUTPUT_LIMIT)
      void appendLog(text.trimEnd())
      const url = parseDshWebUrl(output)
      if (url !== undefined) finish(url)
    }
    child.stdout.on('data', collect)
    child.stderr.on('data', collect)
    child.once('error', (error) => finish(error))
    child.once('exit', (code, signal) => {
      const wasCurrent = dshProcess === child
      if (wasCurrent) dshProcess = undefined
      finish(new Error(`dsh 启动前退出（code=${String(code)}, signal=${String(signal)}）。\n${output}`))
      if (settled && wasCurrent && !quitting) {
        void loadLauncherPage().then(() => reportError(new Error(`dsh 已退出（code=${String(code)}, signal=${String(signal)}）。`)))
      }
    })
  })
}

async function stopDsh(): Promise<void> {
  const child = dshProcess
  if (child === undefined) return
  dshProcess = undefined
  if (child.exitCode !== null || child.signalCode !== null) return
  child.kill('SIGTERM')
  await new Promise<void>((resolvePromise) => {
    const timeout = setTimeout(() => {
      child.kill('SIGKILL')
      resolvePromise()
    }, SHUTDOWN_TIMEOUT_MS)
    child.once('exit', () => {
      clearTimeout(timeout)
      resolvePromise()
    })
  })
}

function reportError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error)
  void appendLog(`ERROR ${message}`)
  updateStatus({ phase: 'error', message: '无法启动 DeepSeek Harness', detail: message })
}

function updateStatus(status: LauncherStatus): void {
  currentStatus = status
  sendStatus(status)
}

function sendStatus(status: LauncherStatus): void {
  if (window !== undefined && !window.isDestroyed()) window.webContents.send('launcher:status', status)
}

function shortCommit(head: string): string {
  return `版本 ${head.slice(0, 12)}`
}

function dataDir(): string {
  return app.getPath('userData')
}

function statePath(): string {
  return join(dataDir(), 'launcher-state.json')
}

function logPath(): string {
  return join(dataDir(), 'launcher.log')
}

async function ensureDataDir(): Promise<void> {
  await mkdir(dataDir(), { recursive: true })
}

async function readState(): Promise<LauncherState> {
  try {
    const value = JSON.parse(await readFile(statePath(), 'utf8')) as unknown
    if (!isRecord(value)) return {}
    const repositoryPath = typeof value.repositoryPath === 'string' ? value.repositoryPath : undefined
    const lastBuiltCommit = typeof value.lastBuiltCommit === 'string' ? value.lastBuiltCommit : undefined
    return {
      ...(repositoryPath !== undefined && { repositoryPath }),
      ...(lastBuiltCommit !== undefined && { lastBuiltCommit }),
    }
  } catch (error: unknown) {
    if ((isNodeError(error) && error.code === 'ENOENT') || error instanceof SyntaxError) return {}
    throw error
  }
}

async function writeState(state: LauncherState): Promise<void> {
  await ensureDataDir()
  const temporary = `${statePath()}.tmp`
  await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
  await rename(temporary, statePath())
}

async function appendLog(message: string): Promise<void> {
  try {
    await ensureDataDir()
    await appendFile(logPath(), `[${new Date().toISOString()}] ${message}\n`, 'utf8')
  } catch {
    // Logging is best-effort and must never prevent startup or shutdown.
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
