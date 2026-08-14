import { describe, expect, it } from 'vitest'
import { parseDshWebUrl, shouldBuild } from './launcher.js'

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
