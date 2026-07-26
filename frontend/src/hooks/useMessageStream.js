import { useCallback, useEffect, useRef } from 'react'
import { streamConversationMessage } from '../api/conversationsApi'
import { friendlyGenerationError } from '../utils/errors'
import { extractSseData, parseJson } from '../utils/sse'

/**
 * Owns the streaming lifecycle for assistant generations.
 *
 * The hook keeps mutable refs for AbortController, token queues and the message cache because
 * SSE callbacks can outlive a render. Refs let each chunk update the latest cache without
 * closing over stale React state.
 */
export default function useMessageStream({
  activeConversationIdRef,
  loadConversations,
  modelDisplayName,
  setConversationUiStatus,
  setMessages,
  showError,
}) {
  const generationAbortRef = useRef(null)
  const messageCacheRef = useRef(new Map())
  const localIdCounterRef = useRef(0)
  const tokenQueuesRef = useRef(new Map())
  const tokenTimersRef = useRef(new Map())
  const flushQueuedTokensRef = useRef(null)

  const updateConversationMessages = useCallback((conversationId, updater) => {
    const currentMessages = messageCacheRef.current.get(conversationId) || []
    const nextMessages = updater(currentMessages)
    messageCacheRef.current.set(conversationId, nextMessages)
    if (activeConversationIdRef.current === conversationId) {
      setMessages(nextMessages)
    }
  }, [activeConversationIdRef, setMessages])

  const flushQueuedTokens = useCallback((assistantId, conversationId) => {
    const timer = tokenTimersRef.current.get(assistantId)
    if (timer) {
      window.clearTimeout(timer)
      tokenTimersRef.current.delete(assistantId)
    }
    const queued = tokenQueuesRef.current.get(assistantId) || ''
    if (!queued) return

    // Tokens are buffered into tiny chunks so the UI streams smoothly without rendering every byte.
    const chunk = queued.slice(0, 8)
    const rest = queued.slice(8)
    tokenQueuesRef.current.set(assistantId, rest)
    updateConversationMessages(conversationId, (current) =>
      current.map((item) =>
        item.id === assistantId ? { ...item, content: `${item.content}${chunk}` } : item,
      ),
    )
    if (rest) {
      tokenTimersRef.current.set(
        assistantId,
        window.setTimeout(() => flushQueuedTokensRef.current?.(assistantId, conversationId), 18),
      )
    } else {
      tokenQueuesRef.current.delete(assistantId)
    }
  }, [updateConversationMessages])
  useEffect(() => {
    flushQueuedTokensRef.current = flushQueuedTokens
  }, [flushQueuedTokens])

  const enqueueToken = useCallback((conversationId, assistantId, token) => {
    if (!token) return
    tokenQueuesRef.current.set(assistantId, `${tokenQueuesRef.current.get(assistantId) || ''}${token}`)
    if (!tokenTimersRef.current.has(assistantId)) {
      tokenTimersRef.current.set(
        assistantId,
        window.setTimeout(() => flushQueuedTokens(assistantId, conversationId), 18),
      )
    }
  }, [flushQueuedTokens])

  const notifyConversationReady = useCallback((conversationId) => {
    const nextStatus = String(activeConversationIdRef.current) === String(conversationId) ? 'idle' : 'completed_unread'
    setConversationUiStatus(conversationId, nextStatus)
  }, [activeConversationIdRef, setConversationUiStatus])

  const handleSseEvent = useCallback((rawEvent, conversationId, localUserId, localAssistantId) => {
    const lines = rawEvent.split('\n')
    const event = lines.find((line) => line.startsWith('event:'))?.slice(6).trim()
    const data = extractSseData(lines, event === 'token')
    const jsonData = event === 'token' ? data : data.trim()

    if (event === 'message') {
      const parsed = parseJson(jsonData)
      if (!parsed) return
      const targetId = parsed.role === 'USER' ? localUserId : localAssistantId
      updateConversationMessages(conversationId, (current) =>
        current.map((item) =>
          item.id === targetId
            ? { ...item, ...parsed, id: targetId, serverId: parsed.id }
            : item,
        ),
      )
    }

    if (event === 'token') {
      enqueueToken(conversationId, localAssistantId, data)
    }

    if (event === 'done') {
      const parsed = parseJson(jsonData)
      updateConversationMessages(conversationId, (current) =>
        current.map((item) =>
          item.id === localAssistantId
            ? { ...item, serverId: parsed?.messageId || item.serverId, status: 'TERMINE' }
            : item,
        ),
      )
    }

    if (event === 'error') {
      const message = friendlyGenerationError(jsonData)
      updateConversationMessages(conversationId, (current) =>
        current.map((item) =>
          item.id === localAssistantId ? { ...item, status: 'ECHEC', content: item.content || message } : item,
        ),
      )
      if (activeConversationIdRef.current === conversationId) showError(message)
    }
  }, [activeConversationIdRef, enqueueToken, showError, updateConversationMessages])

  const nextLocalId = useCallback((prefix) => {
    localIdCounterRef.current += 1
    return `${prefix}-${localIdCounterRef.current}`
  }, [])

  const streamMessage = useCallback(async (conversation, prompt) => {
    const modelName = modelDisplayName(conversation.modelAlias)
    // Optimistic local ids keep the UI stable while the backend persists and returns server ids.
    const localUserId = nextLocalId('local-user')
    const localAssistantId = nextLocalId('local-assistant')
    const abortController = new AbortController()
    generationAbortRef.current = abortController
    setConversationUiStatus(conversation.id, 'generating')

    updateConversationMessages(conversation.id, (current) => [
      ...current,
      { id: localUserId, role: 'USER', status: 'TERMINE', content: prompt },
      {
        id: localAssistantId,
        role: 'ASSISTANT',
        status: 'EN_COURS',
        content: '',
        modelAlias: conversation.modelAlias,
        modelDisplayName: modelName,
      },
    ])

    try {
      const response = await streamConversationMessage(conversation.id, prompt, abortController.signal)

      if (!response.ok || !response.body) throw new Error('Erreur pendant le streaming LiteLLM')

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const events = buffer.split('\n\n')
        buffer = events.pop() || ''
        events.forEach((rawEvent) => handleSseEvent(rawEvent, conversation.id, localUserId, localAssistantId))
      }

      if (buffer) {
        handleSseEvent(buffer, conversation.id, localUserId, localAssistantId)
      }
      await loadConversations()
      notifyConversationReady(conversation.id)
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        updateConversationMessages(conversation.id, (current) =>
          current.map((item) =>
            item.id === localAssistantId
              ? { ...item, status: 'ECHEC', content: item.content || 'Generation interrompue.' }
              : item,
          ),
        )
        setConversationUiStatus(conversation.id, 'idle')
        return
      }
      const message = friendlyGenerationError(error)
      updateConversationMessages(conversation.id, (current) =>
        current.map((item) =>
          item.id === localAssistantId ? { ...item, status: 'ECHEC', content: message } : item,
        ),
      )
      if (activeConversationIdRef.current === conversation.id) showError(message)
      notifyConversationReady(conversation.id)
    } finally {
      flushQueuedTokens(localAssistantId, conversation.id)
      if (generationAbortRef.current === abortController) {
        generationAbortRef.current = null
      }
    }
  }, [
    activeConversationIdRef,
    flushQueuedTokens,
    handleSseEvent,
    loadConversations,
    modelDisplayName,
    nextLocalId,
    notifyConversationReady,
    setConversationUiStatus,
    showError,
    updateConversationMessages,
  ])

  const stopGeneration = useCallback(() => {
    generationAbortRef.current?.abort()
  }, [])

  useEffect(() => () => {
    generationAbortRef.current?.abort()
    tokenTimersRef.current.forEach((timer) => window.clearTimeout(timer))
    tokenTimersRef.current.clear()
  }, [])

  return {
    messageCacheRef,
    streamMessage,
    stopGeneration,
  }
}
