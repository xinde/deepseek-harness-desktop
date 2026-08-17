import { readFile } from 'node:fs/promises'
import { delimiter, dirname, join } from 'node:path'

/** Files that prove the checkout has both production launch surfaces. */
export const REQUIRED_BUILD_ARTIFACTS = [
  join('apps', 'cli', 'lib', 'bin.js'),
  join('apps', 'web', 'dist', 'index.html'),
] as const

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

/** Extract the loopback URL printed by `dsh web` once startup is complete. */
export function parseDshWebUrl(output: string): string | undefined {
  return /(?:^|\n)dsh web: (http:\/\/127\.0\.0\.1:\d+)(?:\s|$)/u.exec(output)?.[1]
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
