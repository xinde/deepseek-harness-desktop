import { delimiter, dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  childEnvironment,
  DEFAULT_LAUNCHER_CONFIG,
  parseDshWebUrl,
  redactDshOutput,
  resolveLauncherConfig,
  shouldBuild,
} from './launcher.js'

describe('childEnvironment', () => {
  it('prepends resolved tool directories to a minimal GUI PATH', () => {
    const node = join('tools', 'node', 'bin', 'node')
    const pnpm = join('tools', 'pnpm', 'bin', 'pnpm')
    const environment = childEnvironment({ PATH: ['/usr/bin', '/bin'].join(delimiter) }, [node, pnpm])

    expect(environment.PATH?.split(delimiter)).toEqual([
      dirname(node),
      dirname(pnpm),
      '/usr/bin',
      '/bin',
    ])
  })

  it('deduplicates tools installed in the same directory', () => {
    const node = join('tools', 'bin', 'node')
    const pnpm = join('tools', 'bin', 'pnpm')

    expect(childEnvironment({ PATH: '/usr/bin' }, [node, pnpm]).PATH?.split(delimiter)).toEqual([
      dirname(node),
      '/usr/bin',
    ])
  })
})

describe('shouldBuild', () => {
  it('skips a complete build at the recorded commit', () => {
    expect(shouldBuild({ head: 'abc', lastBuiltCommit: 'abc', artifactsPresent: true })).toBe(false)
  })

  it('rebuilds after a pull or when artifacts are missing', () => {
    expect(shouldBuild({ head: 'def', lastBuiltCommit: 'abc', artifactsPresent: true })).toBe(true)
    expect(shouldBuild({ head: 'abc', lastBuiltCommit: 'abc', artifactsPresent: false })).toBe(true)
  })
})

describe('resolveLauncherConfig', () => {
  it('uses an ephemeral loopback port and the current built entry by default', () => {
    expect(resolveLauncherConfig({})).toEqual(DEFAULT_LAUNCHER_CONFIG)
  })

  it('allows common upstream launch changes to be overridden independently', () => {
    const config = resolveLauncherConfig({
      DSH_DESKTOP_CLI_ENTRY: 'build/cli.js',
      DSH_DESKTOP_WEB_HOST: 'localhost',
      DSH_DESKTOP_WEB_PORT: '4321',
      DSH_DESKTOP_START_TIMEOUT_MS: '120000',
      DSH_DESKTOP_SHUTDOWN_TIMEOUT_MS: '10000',
    })

    expect(config).toEqual({
      cliEntry: 'build/cli.js',
      webArgs: ['web', '--host', 'localhost', '--port', '4321', '--no-open'],
      requiredBuildArtifacts: ['build/cli.js', join('apps', 'web', 'dist', 'index.html')],
      startTimeoutMs: 120_000,
      shutdownTimeoutMs: 10_000,
    })
  })

  it('accepts JSON argument and artifact lists for larger upstream CLI changes', () => {
    const config = resolveLauncherConfig({
      DSH_DESKTOP_WEB_ARGS: '["--profile","web","--listen","0"]',
      DSH_DESKTOP_BUILD_ARTIFACTS: '["build/cli.js","public/index.html"]',
    })

    expect(config.webArgs).toEqual(['--profile', 'web', '--listen', '0'])
    expect(config.requiredBuildArtifacts).toEqual(['build/cli.js', 'public/index.html'])
  })

  it('rejects invalid numeric and JSON overrides', () => {
    expect(() => resolveLauncherConfig({ DSH_DESKTOP_WEB_PORT: '70000' })).toThrow('DSH_DESKTOP_WEB_PORT')
    expect(() => resolveLauncherConfig({ DSH_DESKTOP_WEB_ARGS: 'web --port 0' })).toThrow('JSON')
  })
})

describe('parseDshWebUrl', () => {
  it('extracts the OS-assigned loopback URL from startup output', () => {
    expect(parseDshWebUrl('booting\ndsh web: http://127.0.0.1:43127\n')).toBe('http://127.0.0.1:43127')
  })

  it('preserves the authenticated path and token printed by current dsh versions', () => {
    expect(parseDshWebUrl('dsh web: http://127.0.0.1:43127/?token=test-token\n'))
      .toBe('http://127.0.0.1:43127/?token=test-token')
  })

  it('accepts complete localhost and IPv6 loopback readiness lines', () => {
    expect(parseDshWebUrl('dsh web: http://localhost:43127/ready\n'))
      .toBe('http://localhost:43127/ready')
    expect(parseDshWebUrl('dsh web: http://[::1]:43127/ready\n'))
      .toBe('http://[::1]:43127/ready')
  })

  it('does not accept non-loopback or incomplete output', () => {
    expect(parseDshWebUrl('dsh web: http://0.0.0.0:3080\n')).toBeUndefined()
    expect(parseDshWebUrl('dsh web: http://127.0.0.1:')).toBeUndefined()
    expect(parseDshWebUrl('dsh web: http://127.0.0.1:43127/?token=partial')).toBeUndefined()
  })
})

describe('redactDshOutput', () => {
  it('removes browser tokens without hiding the diagnostic URL', () => {
    expect(redactDshOutput('dsh web: http://127.0.0.1:43127/?token=secret-value\n'))
      .toBe('dsh web: http://127.0.0.1:43127/?token=<redacted>\n')
  })
})
