import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import useAutoScroll from './useAutoScroll'
import useMessageStream from './useMessageStream'
import { logDevelopmentError } from '../../../utils/errors'
import { focusTextareaOnNextFrame, shouldFocusComposer } from '../utils/composerFocus'

export const MAX_ATTACHMENTS = 5
export const ACCEPTED_ATTACHMENT_EXTENSIONS = [
  '.pdf', '.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff', '.tif',
  '.docx', '.pptx', '.csv', '.xlsx', '.zip',
  '.txt', '.md', '.log', '.py', '.pyw', '.c', '.h', '.cpp', '.hpp', '.cc', '.cs', '.java',
  '.js', '.jsx', '.ts', '.tsx', '.go', '.rb', '.php', '.rs', '.swift', '.kt', '.kts',
  '.scala', '.sh', '.bash', '.ps1', '.sql', '.r', '.ini', '.cfg', '.conf', '.toml',
  '.yml', '.yaml', '.json', '.xml', '.html', '.htm', '.css',
]

/**
 * Groups the chat surface state that is independent from conversation CRUD.
 *
 * The streaming hook remains here because it owns the token buffer and the
 * AbortController used by the stop button. `activeConversationIdRef` is passed
 * from the conversation orchestration layer so stream completion can still
 * distinguish the active thread from a background completion.
 */
export default function useChatUi({
  activeConversationIdRef,
  activeModelAlias,
  isGenerating,
  loadConversations,
  modelDisplayName,
  setConversationUiStatus,
  showError,
}) {
  const [messages, setMessages] = useState([])
  const [draft, setDraft] = useState('')
  const [copiedKey, setCopiedKey] = useState('')
  const [attachments, setAttachments] = useState([])
  const [isComposerMaxed, setIsComposerMaxed] = useState(false)
  const [isComposerTransitioning, setIsComposerTransitioning] = useState(false)

  const textareaRef = useRef(null)
  const composerRef = useRef(null)
  const composerBeforeRectRef = useRef(null)
  const composerTimerRef = useRef(null)
  const shouldRestoreComposerFocusRef = useRef(false)

  const hasActiveMessages = messages.length > 0
  const canSend = Boolean(activeModelAlias && (draft.trim() || attachments.length > 0) && !isGenerating)
  const {
    bottomRef,
    goToBottom,
    isLastBlockVisible,
    messagesRef,
    onMessagesScroll,
    setIsLastBlockVisible,
    shouldAutoScrollRef,
  } = useAutoScroll(messages)

  const {
    messageCacheRef,
    stopGeneration,
    streamSecureAttachment,
    streamMessage,
  } = useMessageStream({
    activeConversationIdRef,
    loadConversations,
    modelDisplayName,
    onStreamSettled: () => {
      if (!shouldRestoreComposerFocusRef.current) return
      if (!shouldFocusComposer({
        activeElement: document.activeElement,
        composer: composerRef.current,
        textarea: textareaRef.current,
      })) {
        return
      }
      focusTextareaOnNextFrame(textareaRef.current)
    },
    setConversationUiStatus,
    setMessages,
    showError,
  })

  const resizeTextarea = useCallback(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.style.height = 'auto'
    const nextHeight = Math.min(textarea.scrollHeight, 150)
    textarea.style.height = `${nextHeight}px`
    setIsComposerMaxed(textarea.scrollHeight > 150)
  }, [])

  useLayoutEffect(() => {
    const element = composerRef.current
    const before = composerBeforeRectRef.current
    if (!element || !before) return

    const after = element.getBoundingClientRect()
    const deltaX = before.left - after.left
    const deltaY = before.top - after.top
    composerBeforeRectRef.current = null

    if (Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1) return

    setIsComposerTransitioning(true)
    element.animate(
      [
        { transform: `translate(${deltaX}px, ${deltaY}px)` },
        { transform: 'translate(0, 0)' },
      ],
      {
        duration: 340,
        easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
    )

    if (composerTimerRef.current) {
      window.clearTimeout(composerTimerRef.current)
    }
    composerTimerRef.current = window.setTimeout(() => setIsComposerTransitioning(false), 360)
  }, [hasActiveMessages])

  useEffect(() => {
    resizeTextarea()
  }, [draft, resizeTextarea])

  useEffect(() => () => {
    if (composerTimerRef.current) {
      window.clearTimeout(composerTimerRef.current)
    }
  }, [])

  useEffect(() => {
    function handlePointerDown(event) {
      if (!shouldRestoreComposerFocusRef.current) return
      if (composerRef.current?.contains(event.target)) return
      shouldRestoreComposerFocusRef.current = false
    }

    document.addEventListener('pointerdown', handlePointerDown, true)
    return () => document.removeEventListener('pointerdown', handlePointerDown, true)
  }, [])

  const rememberComposerFocusIntent = useCallback(() => {
    shouldRestoreComposerFocusRef.current = shouldFocusComposer({
      activeElement: document.activeElement,
      composer: composerRef.current,
      textarea: textareaRef.current,
    })
  }, [])

  const restoreComposerFocusSoon = useCallback(() => {
    if (!shouldRestoreComposerFocusRef.current) return
    focusTextareaOnNextFrame(textareaRef.current)
  }, [])

  const handleKeyDown = useCallback((event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      if (isGenerating) return
      event.currentTarget.form?.requestSubmit()
    }
  }, [isGenerating])

  const addAttachments = useCallback((fileList) => {
    const incoming = Array.from(fileList || [])
    const accepted = []
    for (const file of incoming) {
      const extension = `.${file.name.split('.').pop() || ''}`.toLowerCase()
      if (!ACCEPTED_ATTACHMENT_EXTENSIONS.includes(extension)) {
        showError(`Fichier non supporte : ${file.name}`)
        continue
      }
      accepted.push(file)
    }
    setAttachments((current) => {
      const remaining = Math.max(0, MAX_ATTACHMENTS - current.length)
      if (accepted.length > remaining) {
        showError(`Vous pouvez joindre au maximum ${MAX_ATTACHMENTS} fichiers.`)
      }
      return [...current, ...accepted.slice(0, remaining)]
    })
  }, [showError])

  const removeAttachment = useCallback((index) => {
    setAttachments((current) => current.filter((_, itemIndex) => itemIndex !== index))
  }, [])

  const clearAttachments = useCallback(() => setAttachments([]), [])

  const onCopy = useCallback(async (text) => {
    if (!text) return false
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch (error) {
      logDevelopmentError('clipboard failed', error)
      showError('Impossible de copier le contenu.')
      return false
    }
  }, [showError])

  return {
    bottomRef,
    canSend,
    attachments,
    addAttachments,
    clearAttachments,
    composerBeforeRectRef,
    composerRef,
    copiedKey,
    draft,
    goToBottom,
    handleKeyDown,
    hasActiveMessages,
    isComposerMaxed,
    isComposerTransitioning,
    isLastBlockVisible,
    messageCacheRef,
    messages,
    messagesRef,
    onCopy,
    onMessagesScroll,
    setCopiedKey,
    setDraft,
    setAttachments,
    setIsLastBlockVisible,
    setMessages,
    shouldAutoScrollRef,
    rememberComposerFocusIntent,
    restoreComposerFocusSoon,
    stopGeneration,
    streamSecureAttachment,
    streamMessage,
    removeAttachment,
    textareaRef,
  }
}
