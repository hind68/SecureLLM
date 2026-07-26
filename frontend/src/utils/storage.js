export const SIDEBAR_STORAGE_KEY = 'secure-llm-sidebar-open'
export const LAST_MODEL_STORAGE_KEY = 'secure-llm-last-model'
export const ACTIVE_CONVERSATION_STORAGE_KEY = 'secure-llm-active-conversation-id'

export function saveLastModel(alias) {
  if (!alias) return
  localStorage.setItem(LAST_MODEL_STORAGE_KEY, alias)
}

export function saveActiveConversationId(id) {
  if (!id) return
  localStorage.setItem(ACTIVE_CONVERSATION_STORAGE_KEY, String(id))
}

export function clearActiveConversationId(id) {
  const current = localStorage.getItem(ACTIVE_CONVERSATION_STORAGE_KEY)
  if (!id || current === String(id)) {
    localStorage.removeItem(ACTIVE_CONVERSATION_STORAGE_KEY)
  }
}
