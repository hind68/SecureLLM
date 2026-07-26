import { describe, expect, it } from 'vitest'
import { extractSseData, parseJson } from './sse'

describe('sse utils', () => {
  it('parses JSON data when valid', () => {
    expect(parseJson('{"type":"done"}')).toEqual({ type: 'done' })
    expect(parseJson('not json')).toBeNull()
  })

  it('extracts data lines and ignores non-data fields', () => {
    expect(extractSseData(['event: token', 'data: hello', 'id: 1'])).toBe('hello')
  })

  it('preserves token whitespace when requested', () => {
    expect(extractSseData(['data:  leading'], true)).toBe('  leading')
  })
})
