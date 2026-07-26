import { useCallback, useRef, useState } from 'react'

/**
 * Tracks UI-only conversation statuses used by the sidebar.
 *
 * These values are not backend state. The ref preserves them across history
 * reloads so inactive conversations can remain marked as completed/unread.
 */
export default function useConversationStatus({ setConversations }) {
  const [conversationUiStatus, setConversationUiStatusState] = useState({})
  const conversationUiStatusRef = useRef({})

  const setConversationUiStatus = useCallback((conversationId, status) => {
    if (!conversationId) return
    const key = String(conversationId)
    conversationUiStatusRef.current = {
      ...conversationUiStatusRef.current,
      [key]: status,
    }
    setConversationUiStatusState(conversationUiStatusRef.current)
    setConversations((current) =>
      current.map((item) =>
        String(item.id) === key ? { ...item, uiStatus: status } : item,
      ),
    )
  }, [setConversations])

  const markConversationRead = useCallback((conversationId) => {
    setConversationUiStatus(conversationId, 'idle')
  }, [setConversationUiStatus])

  const generatingConversationId = Object.entries(conversationUiStatus).find(([, status]) => status === 'generating')?.[0] || null

  return {
    conversationUiStatus,
    conversationUiStatusRef,
    generatingConversationId,
    isGenerating: Boolean(generatingConversationId),
    markConversationRead,
    setConversationUiStatus,
  }
}
