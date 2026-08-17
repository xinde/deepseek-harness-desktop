import { delimiter, dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { childEnvironment, parseDshWebUrl, shouldBuild } from './launcher.js'

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

describe('parseDshWebUrl', () => {
  it('extracts the OS-assigned loopback URL from startup output', () => {
    expect(parseDshWebUrl('booting\ndsh web: http://127.0.0.1:43127\n')).toBe('http://127.0.0.1:43127')
  })

  it('does not accept non-loopback or incomplete output', () => {
    expect(parseDshWebUrl('dsh web: http://0.0.0.0:3080\n')).toBeUndefined()
    expect(parseDshWebUrl('dsh web: http://127.0.0.1:')).toBeUndefined()
  })
})
