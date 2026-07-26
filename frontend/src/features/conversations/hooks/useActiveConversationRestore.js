import { useEffect } from 'react'
import { fetchConversation } from '../../../api/conversationsApi'
import { ACTIVE_CONVERSATION_STORAGE_KEY, clearActiveConversationId } from '../../../utils/storage'

/**
 * Restores the last active conversation after the visible history has loaded.
 *
 * The restore is skipped in archived, searched or filtered views so a saved
 * thread cannot unexpectedly replace the user's current navigation context.
 */
export default function useActiveConversationRestore({
  conversations,
  hasLoadedHistory,
  modelFilter,
  openConversation,
  restoreRef,
  search,
  showArchived,
}) {
  useEffect(() => {
    if (restoreRef.current || !hasLoadedHistory || showArchived || search.trim() || modelFilter) return

    async function restoreActiveConversation() {
      const savedId = localStorage.getItem(ACTIVE_CONVERSATION_STORAGE_KEY)
      restoreRef.current = true
      if (!savedId) return

      let conversation = conversations.find((item) => String(item.id) === savedId)
      if (!conversation) {
        try {
          conversation = await fetchConversation(savedId)
        } catch {
          clearActiveConversationId()
          return
        }
      }

      if (conversation.status === 'ARCHIVEE') {
        clearActiveConversationId()
        return
      }

      await openConversation(conversation)
    }

    void restoreActiveConversation()
  }, [conversations, hasLoadedHistory, modelFilter, openConversation, restoreRef, search, showArchived])
}
