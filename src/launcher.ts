import { readFile } from 'node:fs/promises'
import { delimiter, dirname, join } from 'node:path'

/** Runtime settings that isolate the launcher from upstream CLI layout changes. */
export interface LauncherConfig {
  /** Repository-relative built CLI entry passed to Node.js. */
  readonly cliEntry: string
  /** Arguments passed to the built CLI entry. */
  readonly webArgs: readonly string[]
  /** Repository-relative files whose absence forces an upstream rebuild. */
  readonly requiredBuildArtifacts: readonly string[]
  /** Maximum time to wait for the Web readiness URL. */
  readonly startTimeoutMs: number
  /** Graceful shutdown period before SIGKILL. */
  readonly shutdownTimeoutMs: number
}

const DEFAULT_CLI_ENTRY = join('apps', 'cli', 'lib', 'bin.js')
const DEFAULT_WEB_ARTIFACT = join('apps', 'web', 'dist', 'index.html')
const DEFAULT_WEB_HOST = '127.0.0.1'
const DEFAULT_WEB_PORT = 0

/** Shipped launcher settings; environment overrides are resolved at each boot attempt. */
export const DEFAULT_LAUNCHER_CONFIG: LauncherConfig = {
  cliEntry: DEFAULT_CLI_ENTRY,
  webArgs: ['web', '--host', DEFAULT_WEB_HOST, '--port', String(DEFAULT_WEB_PORT), '--no-open'],
  requiredBuildArtifacts: [DEFAULT_CLI_ENTRY, DEFAULT_WEB_ARTIFACT],
  startTimeoutMs: 90_000,
  shutdownTimeoutMs: 8_000,
}

/** Persisted launcher state that belongs outside the upstream checkout. */
export interface LauncherState {
  repositoryPath?: string
  lastBuiltCommit?: string | undefined
}

/** Inputs used to decide whether the upstream checkout needs rebuilding. */
export interface BuildSnapshot {
  head: string
  lastBuiltCommit: string | undefined
  artifactsPresent: boolean
}

/** Add resolved tool directories to the executable search path inherited by subprocesses. */
export function childEnvironment(
  environment: NodeJS.ProcessEnv,
  executablePaths: readonly string[],
): NodeJS.ProcessEnv {
  const pathKey = Object.keys(environment).find((key) => key.toLowerCase() === 'path') ?? 'PATH'
  const inherited = environment[pathKey]?.split(delimiter) ?? []
  const entries = executablePaths.map((executablePath) => dirname(executablePath))
  return {
    ...environment,
    [pathKey]: [...new Set([...entries, ...inherited].filter((entry) => entry !== ''))].join(delimiter),
  }
}

/** Return whether this checkout must be installed and rebuilt before launch. */
export function shouldBuild(snapshot: BuildSnapshot): boolean {
  return !snapshot.artifactsPresent || snapshot.lastBuiltCommit !== snapshot.head
}

/** Resolve launcher settings from documented environment overrides. */
export function resolveLauncherConfig(environment: NodeJS.ProcessEnv): LauncherConfig {
  const cliEntry = configuredString(environment, 'DSH_DESKTOP_CLI_ENTRY') ?? DEFAULT_CLI_ENTRY
  const configuredWebArgs = configuredStringArray(environment, 'DSH_DESKTOP_WEB_ARGS')
  const webHost = configuredString(environment, 'DSH_DESKTOP_WEB_HOST') ?? DEFAULT_WEB_HOST
  const webPort = configuredInteger(environment, 'DSH_DESKTOP_WEB_PORT', DEFAULT_WEB_PORT, 0, 65_535)
  return {
    cliEntry,
    webArgs: configuredWebArgs ?? ['web', '--host', webHost, '--port', String(webPort), '--no-open'],
    requiredBuildArtifacts: configuredStringArray(environment, 'DSH_DESKTOP_BUILD_ARTIFACTS')
      ?? [cliEntry, DEFAULT_WEB_ARTIFACT],
    startTimeoutMs: configuredInteger(
      environment,
      'DSH_DESKTOP_START_TIMEOUT_MS',
      DEFAULT_LAUNCHER_CONFIG.startTimeoutMs,
      1,
      Number.MAX_SAFE_INTEGER,
    ),
    shutdownTimeoutMs: configuredInteger(
      environment,
      'DSH_DESKTOP_SHUTDOWN_TIMEOUT_MS',
      DEFAULT_LAUNCHER_CONFIG.shutdownTimeoutMs,
      1,
      Number.MAX_SAFE_INTEGER,
    ),
  }
}

/** Extract the complete loopback URL printed by `dsh web` once startup is ready. */
export function parseDshWebUrl(output: string): string | undefined {
  const lines = output.matchAll(/(?:^|\r?\n)dsh web:\s+(\S+)[^\r\n]*\r?\n/gu)
  for (const match of lines) {
    const candidate = match[1]
    if (candidate === undefined) continue
    let url: URL
    try {
      url = new URL(candidate)
    } catch {
      continue
    }
    if ((url.protocol !== 'http:' && url.protocol !== 'https:')
      || !isLoopbackHostname(url.hostname)
      || !hasExplicitPort(candidate)
      || url.username !== ''
      || url.password !== '') continue
    return candidate
  }
  return undefined
}

/** Remove process-scoped browser credentials before output reaches persistent logs or error UI. */
export function redactDshOutput(output: string): string {
  return output.replace(/([?&]token=)[^&#\s)]+/gu, '$1<redacted>')
}

/** Validate that a selected directory is the root deepseek-harness checkout. */
export async function validateRepository(repositoryPath: string): Promise<void> {
  let manifest: unknown
  try {
    manifest = JSON.parse(await readFile(join(repositoryPath, 'package.json'), 'utf8'))
  } catch (error: unknown) {
    throw new Error(`所选目录不是可读取的 deepseek-harness 仓库：${error instanceof Error ? error.message : String(error)}`)
  }
  if (!isRecord(manifest) || manifest.name !== '@deepseek-ai/dsh-root') {
    throw new Error('所选目录不是 deepseek-harness 仓库根目录（package.json 名称不匹配）。')
  }
  try {
    const cli = JSON.parse(await readFile(join(repositoryPath, 'apps', 'cli', 'package.json'), 'utf8')) as unknown
    if (!isRecord(cli) || cli.name !== '@deepseek-ai/dsh') throw new Error('CLI package name does not match')
  } catch (error: unknown) {
    throw new Error(`所选仓库缺少 dsh CLI：${error instanceof Error ? error.message : String(error)}`)
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function configuredString(environment: NodeJS.ProcessEnv, name: string): string | undefined {
  const value = environment[name]?.trim()
  return value === undefined || value === '' ? undefined : value
}

function configuredStringArray(environment: NodeJS.ProcessEnv, name: string): string[] | undefined {
  const encoded = configuredString(environment, name)
  if (encoded === undefined) return undefined
  let value: unknown
  try {
    value = JSON.parse(encoded)
  } catch (error: unknown) {
    throw new Error(`${name} 必须是 JSON 字符串数组：${error instanceof Error ? error.message : String(error)}`)
  }
  if (!Array.isArray(value) || value.length === 0
    || value.some((entry) => typeof entry !== 'string' || entry.trim() === '')) {
    throw new Error(`${name} 必须是非空 JSON 字符串数组。`)
  }
  return value as string[]
}

function configuredInteger(
  environment: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const encoded = configuredString(environment, name)
  if (encoded === undefined) return fallback
  const value = Number(encoded)
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} 必须是 ${String(minimum)} 到 ${String(maximum)} 之间的整数。`)
  }
  return value
}

function isLoopbackHostname(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '[::1]' || /^127(?:\.\d{1,3}){3}$/u.test(hostname)
}

function hasExplicitPort(value: string): boolean {
  const authority = /^https?:\/\/([^/?#]+)/u.exec(value)?.[1]
  return authority !== undefined && (authority.startsWith('[') ? /\]:\d+$/u : /:\d+$/u).test(authority)
}
