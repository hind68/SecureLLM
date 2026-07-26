import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ACTIVE_CONVERSATION_STORAGE_KEY,
  LAST_MODEL_STORAGE_KEY,
  clearActiveConversationId,
  saveActiveConversationId,
  saveLastModel,
} from './storage'

beforeEach(() => {
  const values = new Map()
  vi.stubGlobal('localStorage', {
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, String(value)),
  })
  localStorage.clear()
})

describe('storage utils', () => {
  it('saves the last selected model', () => {
    saveLastModel('secure-gpt')
    expect(localStorage.getItem(LAST_MODEL_STORAGE_KEY)).toBe('secure-gpt')
  })

  it('saves and conditionally clears active conversation id', () => {
    saveActiveConversationId(42)
    clearActiveConversationId(7)
    expect(localStorage.getItem(ACTIVE_CONVERSATION_STORAGE_KEY)).toBe('42')

    clearActiveConversationId(42)
    expect(localStorage.getItem(ACTIVE_CONVERSATION_STORAGE_KEY)).toBeNull()
  })
})
