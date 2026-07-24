import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { PrismLight as SyntaxHighlighter } from 'react-syntax-highlighter'
import bash from 'react-syntax-highlighter/dist/esm/languages/prism/bash'
import c from 'react-syntax-highlighter/dist/esm/languages/prism/c'
import cpp from 'react-syntax-highlighter/dist/esm/languages/prism/cpp'
import css from 'react-syntax-highlighter/dist/esm/languages/prism/css'
import csharp from 'react-syntax-highlighter/dist/esm/languages/prism/csharp'
import docker from 'react-syntax-highlighter/dist/esm/languages/prism/docker'
import go from 'react-syntax-highlighter/dist/esm/languages/prism/go'
import java from 'react-syntax-highlighter/dist/esm/languages/prism/java'
import javascript from 'react-syntax-highlighter/dist/esm/languages/prism/javascript'
import json from 'react-syntax-highlighter/dist/esm/languages/prism/json'
import jsx from 'react-syntax-highlighter/dist/esm/languages/prism/jsx'
import kotlin from 'react-syntax-highlighter/dist/esm/languages/prism/kotlin'
import markdown from 'react-syntax-highlighter/dist/esm/languages/prism/markdown'
import markup from 'react-syntax-highlighter/dist/esm/languages/prism/markup'
import php from 'react-syntax-highlighter/dist/esm/languages/prism/php'
import powershell from 'react-syntax-highlighter/dist/esm/languages/prism/powershell'
import python from 'react-syntax-highlighter/dist/esm/languages/prism/python'
import rust from 'react-syntax-highlighter/dist/esm/languages/prism/rust'
import sql from 'react-syntax-highlighter/dist/esm/languages/prism/sql'
import tsx from 'react-syntax-highlighter/dist/esm/languages/prism/tsx'
import typescript from 'react-syntax-highlighter/dist/esm/languages/prism/typescript'
import yaml from 'react-syntax-highlighter/dist/esm/languages/prism/yaml'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import rehypeSanitize from 'rehype-sanitize'
import remarkGfm from 'remark-gfm'
import './App.css'

const API_BASE_URL = 'http://localhost:8080/api'
const SIDEBAR_STORAGE_KEY = 'secure-llm-sidebar-open'
const LAST_MODEL_STORAGE_KEY = 'secure-llm-last-model'
const ACTIVE_CONVERSATION_STORAGE_KEY = 'secure-llm-active-conversation-id'

SyntaxHighlighter.registerLanguage('bash', bash)
SyntaxHighlighter.registerLanguage('c', c)
SyntaxHighlighter.registerLanguage('cpp', cpp)
SyntaxHighlighter.registerLanguage('css', css)
SyntaxHighlighter.registerLanguage('csharp', csharp)
SyntaxHighlighter.registerLanguage('docker', docker)
SyntaxHighlighter.registerLanguage('go', go)
SyntaxHighlighter.registerLanguage('java', java)
SyntaxHighlighter.registerLanguage('javascript', javascript)
SyntaxHighlighter.registerLanguage('js', javascript)
SyntaxHighlighter.registerLanguage('json', json)
SyntaxHighlighter.registerLanguage('jsx', jsx)
SyntaxHighlighter.registerLanguage('kotlin', kotlin)
SyntaxHighlighter.registerLanguage('markdown', markdown)
SyntaxHighlighter.registerLanguage('md', markdown)
SyntaxHighlighter.registerLanguage('markup', markup)
SyntaxHighlighter.registerLanguage('php', php)
SyntaxHighlighter.registerLanguage('powershell', powershell)
SyntaxHighlighter.registerLanguage('ps1', powershell)
SyntaxHighlighter.registerLanguage('python', python)
SyntaxHighlighter.registerLanguage('rust', rust)
SyntaxHighlighter.registerLanguage('sql', sql)
SyntaxHighlighter.registerLanguage('tsx', tsx)
SyntaxHighlighter.registerLanguage('typescript', typescript)
SyntaxHighlighter.registerLanguage('yaml', yaml)
SyntaxHighlighter.registerLanguage('yml', yaml)

function App() {
  const [models, setModels] = useState([])
  const [selectedModel, setSelectedModel] = useState(() => localStorage.getItem(LAST_MODEL_STORAGE_KEY) || '')
  const [modelFilter, setModelFilter] = useState('')
  const [search, setSearch] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false)
  const [conversations, setConversations] = useState([])
  const [activeConversation, setActiveConversation] = useState(null)
  const [messages, setMessages] = useState([])
  const [draft, setDraft] = useState('')
  const [historyError, setHistoryError] = useState('')
  const [chatError, setChatError] = useState('')
  const [chatNotice, setChatNotice] = useState('')
  const [copiedKey, setCopiedKey] = useState('')
  const [hasLoadedHistory, setHasLoadedHistory] = useState(false)
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)
  const [isLoadingModels, setIsLoadingModels] = useState(true)
  const [generatingConversationId, setGeneratingConversationId] = useState(null)
  const [unreadConversationIds, setUnreadConversationIds] = useState(() => new Set())
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => localStorage.getItem(SIDEBAR_STORAGE_KEY) !== 'false')
  const [activeView, setActiveView] = useState('chat')
  const [collapsedPanel, setCollapsedPanel] = useState(null)
  const [openMenuId, setOpenMenuId] = useState(null)
  const [isHeaderMenuOpen, setIsHeaderMenuOpen] = useState(false)
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false)
  const [isModelMenuOpen, setIsModelMenuOpen] = useState(false)
  const [modelDecision, setModelDecision] = useState(null)
  const [pendingDeleteConversation, setPendingDeleteConversation] = useState(null)
  const [isLastBlockVisible, setIsLastBlockVisible] = useState(true)
  const [isComposerMaxed, setIsComposerMaxed] = useState(false)
  const [isComposerTransitioning, setIsComposerTransitioning] = useState(false)

  const messagesRef = useRef(null)
  const bottomRef = useRef(null)
  const textareaRef = useRef(null)
  const searchInputRef = useRef(null)
  const composerRef = useRef(null)
  const composerBeforeRectRef = useRef(null)
  const composerTimerRef = useRef(null)
  const localIdCounterRef = useRef(0)
  const shouldAutoScrollRef = useRef(true)
  const scrollFrameRef = useRef(null)
  const activeConversationRestoreRef = useRef(false)
  const activeConversationIdRef = useRef(null)
  const generationAbortRef = useRef(null)
  const messageCacheRef = useRef(new Map())
  const tokenQueuesRef = useRef(new Map())
  const tokenTimersRef = useRef(new Map())

  const activeModelAlias = activeConversation?.modelAlias || selectedModel
  const activeModel = models.find((model) => model.alias === activeModelAlias)
  const isGenerating = Boolean(generatingConversationId)
  const canSend = Boolean(activeModelAlias && draft.trim() && !isGenerating)
  const hasActiveMessages = messages.length > 0
  const isModelsView = activeView === 'models'

  const resizeTextarea = useCallback(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.style.height = 'auto'
    const nextHeight = Math.min(textarea.scrollHeight, 150)
    textarea.style.height = `${nextHeight}px`
    setIsComposerMaxed(textarea.scrollHeight > 150)
  }, [])

  const scrollMessagesToBottom = useCallback((behavior = 'auto') => {
    const element = messagesRef.current
    if (!element) return

    if (scrollFrameRef.current) {
      cancelAnimationFrame(scrollFrameRef.current)
    }

    scrollFrameRef.current = requestAnimationFrame(() => {
      if (behavior === 'smooth') {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
      } else {
        element.scrollTop = element.scrollHeight
      }
      scrollFrameRef.current = null
    })
  }, [])

  const closeTransientMenus = useCallback(() => {
    setOpenMenuId(null)
    setIsHeaderMenuOpen(false)
    setIsAccountMenuOpen(false)
    setIsModelMenuOpen(false)
    setCollapsedPanel(null)
  }, [])

  const closeSidebarPanels = useCallback(() => {
    closeTransientMenus()
    setActiveView('chat')
  }, [closeTransientMenus])

  const closeSidePanelOnMobile = useCallback(() => {
    if (window.innerWidth < 820) {
      closeSidebarPanels()
      setIsSidebarOpen(false)
    }
  }, [closeSidebarPanels])

  const showError = useCallback((message) => {
    setChatNotice('')
    setChatError(message)
  }, [])

  const showNotice = useCallback((message) => {
    setChatError('')
    setChatNotice(message)
  }, [])

  const markConversationRead = useCallback((conversationId) => {
    setUnreadConversationIds((current) => {
      if (!current.has(conversationId)) return current
      const next = new Set(current)
      next.delete(conversationId)
      return next
    })
  }, [])

  const loadModels = useCallback(async () => {
    setIsLoadingModels(true)
    try {
      const response = await fetch(`${API_BASE_URL}/models/details`)
      if (!response.ok) throw new Error('model-details')
      const data = await response.json()
      const normalized = Array.isArray(data)
        ? data.map((item) => ({ alias: item.alias, displayName: cleanModelName(item.displayName || item.alias, item.alias) }))
        : []
      setModels(normalized)
      setSelectedModel((current) => selectAvailableModel(normalized, current))
      setChatError('')
    } catch {
      try {
        const fallbackResponse = await fetch(`${API_BASE_URL}/models`)
        if (!fallbackResponse.ok) throw new Error('models')
        const aliases = await fallbackResponse.json()
        const normalized = Array.isArray(aliases)
          ? aliases.map((alias) => ({ alias, displayName: cleanModelName(alias, alias) }))
          : []
        setModels(normalized)
        setSelectedModel((current) => selectAvailableModel(normalized, current))
        setChatError('')
      } catch {
        showError('Impossible de charger les modeles.')
      }
    } finally {
      setIsLoadingModels(false)
    }
  }, [showError])

  const loadConversations = useCallback(async () => {
    setIsLoadingHistory(true)
    try {
      const params = new URLSearchParams({ page: '0', size: '30' })
      if (modelFilter) params.set('modelAlias', modelFilter)
      if (search.trim()) params.set('search', search.trim())
      if (showArchived) params.set('archived', 'true')
      const response = await fetch(`${API_BASE_URL}/conversations?${params}`)
      if (!response.ok) throw new Error(`history ${response.status}`)
      const data = await response.json()
      const content = Array.isArray(data) ? data : Array.isArray(data.content) ? data.content : []
      setConversations(content)
      setHistoryError('')
      return content
    } catch {
      setHistoryError('Impossible de charger l historique.')
      return []
    } finally {
      setHasLoadedHistory(true)
      setIsLoadingHistory(false)
    }
  }, [modelFilter, search, showArchived])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadModels()
  }, [loadModels])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadConversations()
  }, [loadConversations])

  useEffect(() => {
    localStorage.setItem(SIDEBAR_STORAGE_KEY, String(isSidebarOpen))
  }, [isSidebarOpen])

  useEffect(() => {
    if (!selectedModel || !models.some((model) => model.alias === selectedModel)) return
    saveLastModel(selectedModel)
  }, [models, selectedModel])

  useEffect(() => {
    function closeMenus(event) {
      if (!event.target.closest('[data-menu-root]')) {
        closeTransientMenus()
      }
    }

    function closeOnEscape(event) {
      if (event.key === 'Escape') {
        closeTransientMenus()
        setModelDecision(null)
        setIsSearchModalOpen(false)
        setActiveView('chat')
        setChatError('')
        setChatNotice('')
      }
    }

    document.addEventListener('mousedown', closeMenus)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('mousedown', closeMenus)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [closeSidebarPanels, closeTransientMenus])

  useEffect(() => {
    if (!chatError && !chatNotice) return undefined
    const timeout = window.setTimeout(() => {
      setChatError('')
      setChatNotice('')
    }, 5000)
    return () => window.clearTimeout(timeout)
  }, [chatError, chatNotice])

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
    if (shouldAutoScrollRef.current) {
      scrollMessagesToBottom('auto')
    }
  }, [messages, scrollMessagesToBottom])

  useEffect(() => {
    resizeTextarea()
  }, [draft, resizeTextarea])

  useEffect(() => {
    if (!isSearchModalOpen) return
    const timeout = window.setTimeout(() => searchInputRef.current?.focus(), 180)
    return () => window.clearTimeout(timeout)
  }, [isSearchModalOpen])

  useEffect(() => {
    activeConversationIdRef.current = activeConversation?.id || null
  }, [activeConversation?.id])

  useEffect(() => () => {
    if (scrollFrameRef.current) {
      cancelAnimationFrame(scrollFrameRef.current)
    }
    if (composerTimerRef.current) {
      window.clearTimeout(composerTimerRef.current)
    }
    generationAbortRef.current?.abort()
    tokenTimersRef.current.forEach((timer) => window.clearTimeout(timer))
    tokenTimersRef.current.clear()
  }, [showError])

  const openConversation = useCallback(async (conversation) => {
    try {
      setChatError('')
      closeTransientMenus()
      setActiveConversation(conversation)
      markConversationRead(conversation.id)
      setSelectedModel(conversation.modelAlias)
      saveLastModel(conversation.modelAlias)
      saveActiveConversationId(conversation.id)
      setActiveView('chat')
      setIsLastBlockVisible(true)
      shouldAutoScrollRef.current = true
      const cachedMessages = messageCacheRef.current.get(conversation.id)
      if (cachedMessages) {
        setMessages(cachedMessages)
        closeSidePanelOnMobile()
        return
      }
      const response = await fetch(`${API_BASE_URL}/conversations/${conversation.id}/messages`)
      if (!response.ok) throw new Error('messages')
      const nextMessages = await response.json()
      messageCacheRef.current.set(conversation.id, nextMessages)
      setMessages(nextMessages)
      closeSidePanelOnMobile()
    } catch {
      showError('Impossible de reprendre cette conversation.')
    }
  }, [closeSidePanelOnMobile, closeTransientMenus, markConversationRead, showError])

  useEffect(() => {
    if (activeConversationRestoreRef.current || !hasLoadedHistory || showArchived || search.trim() || modelFilter) return

    async function restoreActiveConversation() {
      const savedId = localStorage.getItem(ACTIVE_CONVERSATION_STORAGE_KEY)
      activeConversationRestoreRef.current = true
      if (!savedId) return

      let conversation = conversations.find((item) => String(item.id) === savedId)
      if (!conversation) {
        try {
          const response = await fetch(`${API_BASE_URL}/conversations/${savedId}`)
          if (!response.ok) {
            clearActiveConversationId()
            return
          }
          conversation = await response.json()
        } catch {
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
  }, [conversations, hasLoadedHistory, modelFilter, openConversation, search, showArchived])

  function newConversation(modelAlias = selectedModel) {
    setActiveConversation(null)
    setMessages([])
    setDraft('')
    setChatError('')
    clearActiveConversationId()
    closeTransientMenus()
    setSelectedModel(modelAlias)
    saveLastModel(modelAlias)
    setIsLastBlockVisible(true)
    shouldAutoScrollRef.current = true
    closeSidePanelOnMobile()
  }

  async function createConversation(modelAlias, title) {
    const response = await fetch(`${API_BASE_URL}/conversations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ modelAlias, title }),
    })
    if (!response.ok) throw new Error('create conversation')
    const conversation = await response.json()
    setActiveConversation(conversation)
    markConversationRead(conversation.id)
    setSelectedModel(conversation.modelAlias)
    saveLastModel(conversation.modelAlias)
    saveActiveConversationId(conversation.id)
    setConversations((current) => [conversation, ...current.filter((item) => item.id !== conversation.id)])
    return conversation
  }

  async function ensureConversation(prompt) {
    if (activeConversation) return activeConversation
    return createConversation(selectedModel, titleFrom(prompt))
  }

  async function sendMessage(event) {
    event.preventDefault()
    if (isGenerating) {
      stopGeneration()
      return
    }
    const prompt = draft.trim()
    if (!prompt) {
      showError('Le message ne peut pas etre vide.')
      return
    }

    setChatError('')
    if (!hasActiveMessages && composerRef.current) {
      composerBeforeRectRef.current = composerRef.current.getBoundingClientRect()
    }
    setDraft('')
    setIsLastBlockVisible(true)
    shouldAutoScrollRef.current = true

    try {
      const conversation = await ensureConversation(prompt)
      void streamMessage(conversation, prompt)
    } catch (error) {
      showError(friendlyGenerationError(error))
    }
  }

  async function streamMessage(conversation, prompt) {
    const modelName = modelDisplayName(conversation.modelAlias)
    const localUserId = nextLocalId('local-user')
    const localAssistantId = nextLocalId('local-assistant')
    const abortController = new AbortController()
    generationAbortRef.current = abortController
    setGeneratingConversationId(conversation.id)

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
      const response = await fetch(`${API_BASE_URL}/conversations/${conversation.id}/messages/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: prompt }),
        signal: abortController.signal,
      })

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
      setGeneratingConversationId(null)
    }
  }

  function handleSseEvent(rawEvent, conversationId, localUserId, localAssistantId) {
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
  }

  function updateConversationMessages(conversationId, updater) {
    const currentMessages = messageCacheRef.current.get(conversationId) || []
    const nextMessages = updater(currentMessages)
    messageCacheRef.current.set(conversationId, nextMessages)
    if (activeConversationIdRef.current === conversationId) {
      setMessages(nextMessages)
    }
  }

  function enqueueToken(conversationId, assistantId, token) {
    if (!token) return
    tokenQueuesRef.current.set(assistantId, `${tokenQueuesRef.current.get(assistantId) || ''}${token}`)
    if (!tokenTimersRef.current.has(assistantId)) {
      tokenTimersRef.current.set(
        assistantId,
        window.setTimeout(() => flushQueuedTokens(assistantId, conversationId), 18),
      )
    }
  }

  function flushQueuedTokens(assistantId, conversationId) {
    const timer = tokenTimersRef.current.get(assistantId)
    if (timer) {
      window.clearTimeout(timer)
      tokenTimersRef.current.delete(assistantId)
    }
    const queued = tokenQueuesRef.current.get(assistantId) || ''
    if (!queued) return
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
        window.setTimeout(() => flushQueuedTokens(assistantId, conversationId), 18),
      )
    } else {
      tokenQueuesRef.current.delete(assistantId)
    }
  }

  function notifyConversationReady(conversationId) {
    if (activeConversationIdRef.current === conversationId) return
    setUnreadConversationIds((current) => {
      const next = new Set(current)
      next.add(conversationId)
      return next
    })
  }

  function stopGeneration() {
    generationAbortRef.current?.abort()
  }

  async function renameConversation(conversation = activeConversation) {
    if (!conversation || isGenerating) return
    const title = window.prompt('Nouveau titre', conversation.title)
    if (!title?.trim()) return

    try {
      const response = await fetch(`${API_BASE_URL}/conversations/${conversation.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim() }),
      })
      if (!response.ok) throw new Error('rename')
      const updated = await response.json()
      setActiveConversation((current) => (current?.id === updated.id ? updated : current))
      setConversations((current) => current.map((item) => (item.id === updated.id ? updated : item)))
      closeMenus()
    } catch {
      showError('Impossible de renommer la conversation.')
    }
  }

  async function archiveConversation(conversation = activeConversation) {
    if (!conversation || isGenerating) return
    try {
      const response = await fetch(`${API_BASE_URL}/conversations/${conversation.id}`, { method: 'DELETE' })
      if (!response.ok) throw new Error('archive')
      setConversations((current) => current.filter((item) => item.id !== conversation.id))
      if (activeConversation?.id === conversation.id) {
        setActiveConversation(null)
        setMessages([])
      }
      clearActiveConversationId(conversation.id)
      closeMenus()
      await loadConversations()
    } catch {
      showError('Impossible d archiver la conversation.')
    }
  }

  async function restoreConversation(conversation) {
    if (!conversation || isGenerating) return
    try {
      const response = await fetch(`${API_BASE_URL}/conversations/${conversation.id}/restore`, { method: 'PATCH' })
      if (!response.ok) throw new Error(await requestStatusMessage(response, 'Impossible de desarchiver la conversation.'))
      const updated = await response.json()
      setConversations((current) => current.filter((item) => item.id !== updated.id))
      if (activeConversation?.id === updated.id) {
        setActiveConversation(updated)
        setSelectedModel(updated.modelAlias)
        saveLastModel(updated.modelAlias)
        saveActiveConversationId(updated.id)
      }
      closeMenus()
      showNotice('Conversation desarchivee.')
      await loadConversations()
    } catch (error) {
      showError(requestErrorMessage(error, 'Impossible de desarchiver la conversation.'))
    }
  }

  async function deleteConversation(conversation = activeConversation) {
    if (!conversation || isGenerating) return
    if (!conversation.id) {
      showError('Impossible de supprimer cette conversation: identifiant manquant.')
      logDevelopmentError('delete conversation missing id', conversation)
      return
    }
    setPendingDeleteConversation(conversation)
    closeMenus()
  }

  async function confirmDeleteConversation() {
    const conversation = pendingDeleteConversation
    if (!conversation || isGenerating) return
    const deleteUrl = `${API_BASE_URL}/conversations/${conversation.id}/permanent`
    try {
      const response = await fetch(deleteUrl, { method: 'DELETE' })
      if (!response.ok) {
        const message = await deletionErrorMessage(response)
        logDevelopmentError('delete conversation failed', {
          id: conversation.id,
          method: 'DELETE',
          status: response.status,
          url: deleteUrl,
          message,
        })
        throw new Error(message)
      }
      setConversations((current) => current.filter((item) => item.id !== conversation.id))
      if (activeConversation?.id === conversation.id) {
        setActiveConversation(null)
        setMessages([])
      }
      clearActiveConversationId(conversation.id)
      closeMenus()
      setPendingDeleteConversation(null)
      showNotice('Conversation supprimee.')
      await loadConversations()
    } catch (error) {
      showError(requestErrorMessage(error, 'Impossible de supprimer la conversation.'))
    }
  }

  async function selectModel(alias) {
    setIsModelMenuOpen(false)
    if (isGenerating) return
    if (!activeConversation) {
      setSelectedModel(alias)
      saveLastModel(alias)
      return
    }
    if (activeConversation.modelAlias === alias) return
    setModelDecision({ alias })
  }

  async function continueWithModel(alias) {
    if (!activeConversation) return
    try {
      const response = await fetch(`${API_BASE_URL}/conversations/${activeConversation.id}/model`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelAlias: alias }),
      })
      if (!response.ok) throw new Error(await requestStatusMessage(response, 'Impossible de changer le modele.'))
      const updated = await response.json()
      setActiveConversation(updated)
      setSelectedModel(updated.modelAlias)
      saveLastModel(updated.modelAlias)
      saveActiveConversationId(updated.id)
      setConversations((current) => current.map((item) => (item.id === updated.id ? updated : item)))
      setModelDecision(null)
    } catch (error) {
      showError(requestErrorMessage(error, 'Impossible de changer le modele.'))
    }
  }

  async function openNewConversationWithModel(alias) {
    try {
      newConversation(alias)
      await createConversation(alias, 'Nouvelle conversation')
      setModelDecision(null)
    } catch {
      showError('Impossible de creer une nouvelle conversation.')
    }
  }

  function onMessagesScroll() {
    const element = messagesRef.current
    if (!element) return
    const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight
    const isNearBottom = distanceFromBottom < 90
    shouldAutoScrollRef.current = isNearBottom
    setIsLastBlockVisible(isNearBottom)
  }

  function goToBottom() {
    setIsLastBlockVisible(true)
    shouldAutoScrollRef.current = true
    scrollMessagesToBottom('smooth')
  }

  function handleKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      event.currentTarget.form?.requestSubmit()
    }
  }

  function closeMenus() {
    closeTransientMenus()
  }

  function toggleSidebar() {
    closeSidebarPanels()
    setIsSidebarOpen((current) => !current)
  }

  function toggleCollapsedPanel(panel) {
    setOpenMenuId(null)
    setIsHeaderMenuOpen(false)
    setIsModelMenuOpen(false)
    setIsAccountMenuOpen(false)
    setCollapsedPanel((current) => (current === panel ? null : panel))
  }

  function modelDisplayName(alias) {
    return models.find((model) => model.alias === alias)?.displayName || cleanModelName(alias, alias) || 'Modele'
  }

  function nextLocalId(prefix) {
    localIdCounterRef.current += 1
    return `${prefix}-${localIdCounterRef.current}`
  }

  return (
    <div className={`app-shell ${isSidebarOpen ? 'sidebar-open' : 'sidebar-closed'}`}>
      {isSidebarOpen && <button className="mobile-overlay" type="button" aria-label="Fermer" onClick={toggleSidebar} />}

      <aside className="sidebar" aria-label="Navigation Synapse" data-menu-root>
        <div className="sidebar-header">
          <button
            className="sidebar-brand"
            type="button"
            aria-label={isSidebarOpen ? 'Synapse' : 'Ouvrir la sidebar'}
            onClick={() => {
              if (!isSidebarOpen) {
                closeSidebarPanels()
                setIsSidebarOpen(true)
              }
            }}
          >
            <span className="sidebar-logo" aria-hidden="true">
              <img className="sidebar-logo-default" src="/assets/synapse-logo.png" alt="" />
              <img className="sidebar-logo-hover" src="/assets/synapse-hover.png" alt="" />
            </span>
            <span>Synapse</span>
          </button>
          <button
            className="sidebar-toggle"
            type="button"
            title={isSidebarOpen ? 'Reduire la sidebar' : 'Ouvrir la sidebar'}
            aria-label={isSidebarOpen ? 'Reduire la sidebar' : 'Ouvrir la sidebar'}
            aria-expanded={isSidebarOpen}
            onClick={toggleSidebar}
          >
            <img src="/assets/sidebar.png" alt="" />
          </button>
        </div>

        <nav className="sidebar-navigation" aria-label="Actions principales">
          <div className="sidebar-primary-nav">
            <button type="button" title="Nouvelle conversation" aria-label="Nouvelle conversation" onClick={() => { closeSidebarPanels(); newConversation() }}>
              <span className="sidebar-icon" aria-hidden="true">
                <img src="/assets/new-tab.png" alt="" />
              </span>
              <span>Nouvelle conversation</span>
            </button>
            <button
              className={isSearchModalOpen ? 'active' : ''}
              type="button"
              title="Rechercher"
              aria-label="Rechercher"
              onClick={() => {
                setIsSearchModalOpen(true)
                if (isSidebarOpen) {
                  setIsAccountMenuOpen(false)
                  setActiveView('chat')
                  setCollapsedPanel(null)
                } else {
                  setCollapsedPanel(null)
                }
              }}
            >
              <span className="sidebar-icon" aria-hidden="true">
                <img src="/assets/search.png" alt="" />
              </span>
              <span>Rechercher</span>
            </button>
            <button
              className={isModelsView ? 'active' : ''}
              type="button"
              title="Explorer les modeles"
              aria-label="Explorer les modeles"
              onClick={() => {
                closeTransientMenus()
                setIsAccountMenuOpen(false)
                setActiveView((current) => (current === 'models' ? 'chat' : 'models'))
              }}
            >
              <span className="sidebar-icon" aria-hidden="true">
                <img src="/assets/compass.png" alt="" />
              </span>
              <span>Explorer les modeles</span>
            </button>
          </div>
          <button
            className={`recent-nav-button ${collapsedPanel === 'history' ? 'active' : ''}`}
            type="button"
            title="Discussions recentes"
            aria-label="Discussions recentes"
            onClick={() => {
              setShowArchived(false)
              if (isSidebarOpen) {
                setIsAccountMenuOpen(false)
                setActiveView('chat')
                setCollapsedPanel(null)
                setModelFilter('')
                setSearch('')
                setOpenMenuId(null)
              } else {
                toggleCollapsedPanel('history')
              }
            }}
          >
            <span className="sidebar-icon" aria-hidden="true">
              <img src="/assets/message.png" alt="" />
            </span>
            <span>Discussions recentes</span>
          </button>
        </nav>

        <section className="recent-section">
          <div className="history-heading">
            <span>Recents</span>
            {isSidebarOpen && (
              <button
                type="button"
                aria-label="Filtres"
                onClick={() => {
                  setIsSearchModalOpen(true)
                }}
              >
                <img src="/assets/filter.png" alt="" />
              </button>
            )}
          </div>

          <ArchiveTabs showArchived={showArchived} setShowArchived={setShowArchived} />

          <HistoryList
            activeConversation={activeConversation}
            conversations={conversations}
            historyError={historyError}
            isLoadingHistory={isLoadingHistory}
            loadConversations={loadConversations}
            openConversation={openConversation}
            openMenuId={openMenuId}
            setIsAccountMenuOpen={setIsAccountMenuOpen}
            setOpenMenuId={setOpenMenuId}
            archiveConversation={archiveConversation}
            deleteConversation={deleteConversation}
            renameConversation={renameConversation}
            restoreConversation={restoreConversation}
            showArchived={showArchived}
            generatingConversationId={generatingConversationId}
            unreadConversationIds={unreadConversationIds}
          />
        </section>

        <div className="sidebar-user" data-menu-root>
          <button
            type="button"
            title="Compte"
            aria-label="Compte"
            onClick={() => {
              setOpenMenuId(null)
              setIsHeaderMenuOpen(false)
              setIsModelMenuOpen(false)
              setCollapsedPanel(null)
              setIsAccountMenuOpen((current) => !current)
            }}
          >
            <span className="user-avatar-wrapper">
              <span className="user-avatar">HA</span>
            </span>
            <span className="user-copy">
              <strong>Hind Alami</strong>
            </span>
          </button>
          {isSidebarOpen && isAccountMenuOpen && (
            <div className="account-popover account-popover-open" role="menu">
              <button type="button" role="menuitem" onClick={() => { setShowArchived(true); setIsSidebarOpen(true); setIsAccountMenuOpen(false) }}>
                Conversations archivees
              </button>
              <button type="button" role="menuitem">
                Se deconnecter
              </button>
            </div>
          )}
        </div>
      </aside>

      {!isSidebarOpen && isAccountMenuOpen && (
        <div className="account-popover account-popover-collapsed" role="menu" data-menu-root>
          <button type="button" role="menuitem" onClick={() => { setShowArchived(true); setIsSidebarOpen(true); setIsAccountMenuOpen(false) }}>
            Conversations archivees
          </button>
          <button type="button" role="menuitem">
            Se deconnecter
          </button>
        </div>
      )}

      {!isSidebarOpen && collapsedPanel && (
        <div className="collapsed-panel" data-menu-root>
          <div className="collapsed-panel-header">
            <strong>{collapsedPanel === 'history' ? 'Discussions recentes' : 'Rechercher'}</strong>
          </div>

          {(collapsedPanel === 'search' || collapsedPanel === 'history') && (
            <ArchiveTabs showArchived={showArchived} setShowArchived={setShowArchived} />
          )}
          <HistoryList
            activeConversation={activeConversation}
            conversations={conversations}
            historyError={historyError}
            isLoadingHistory={isLoadingHistory}
            loadConversations={loadConversations}
            openConversation={async (conversation) => {
              await openConversation(conversation)
              setCollapsedPanel(null)
            }}
            openMenuId={openMenuId}
            setIsAccountMenuOpen={setIsAccountMenuOpen}
            setOpenMenuId={setOpenMenuId}
            archiveConversation={archiveConversation}
            deleteConversation={deleteConversation}
            renameConversation={renameConversation}
            restoreConversation={restoreConversation}
            showArchived={showArchived}
            generatingConversationId={generatingConversationId}
            unreadConversationIds={unreadConversationIds}
          />
        </div>
      )}

      {isSearchModalOpen && (
        <SearchModal
          inputRef={searchInputRef}
          conversations={conversations}
          isLoadingHistory={isLoadingHistory}
          modelFilter={modelFilter}
          models={models}
          onClose={() => setIsSearchModalOpen(false)}
          openConversation={openConversation}
          search={search}
          setModelFilter={setModelFilter}
          setSearch={setSearch}
          setShowArchived={setShowArchived}
          showArchived={showArchived}
        />
      )}

      <main className={`chat-main ${hasActiveMessages ? 'conversation-mode' : 'welcome-mode'}`}>
        <header className="chat-header">
          <div className="header-controls">
            <div className="model-switcher" data-menu-root>
              <button
                className="model-button"
                type="button"
                onClick={() => {
                  setIsAccountMenuOpen(false)
                  setIsModelMenuOpen((current) => !current)
                }}
                disabled={isGenerating || isLoadingModels}
              >
                <span>{activeModel?.displayName || 'Modele'}</span>
                <span className="model-arrow" aria-hidden="true"></span>
              </button>
              {isModelMenuOpen && (
                <div className="model-menu" role="menu">
                  {models.map((model) => (
                    <button key={model.alias} type="button" role="menuitem" onClick={() => selectModel(model.alias)}>
                      <strong>{model.displayName}</strong>
                      <span>{modelProviderName(model.alias)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {activeConversation && (
              <ConversationMenu
                id="header-conversation-menu"
                isOpen={isHeaderMenuOpen}
                archiveLabel={activeConversation.status === 'ARCHIVEE' ? 'Desarchiver' : 'Archiver'}
                onArchive={() => (activeConversation.status === 'ARCHIVEE' ? restoreConversation(activeConversation) : archiveConversation(activeConversation))}
                onDelete={() => deleteConversation(activeConversation)}
                onOpen={() => {
                  setIsAccountMenuOpen(false)
                  setIsHeaderMenuOpen((current) => !current)
                }}
                onRename={() => renameConversation(activeConversation)}
              />
            )}
          </div>
        </header>

        {isModelsView && (
          <div className="modal-overlay model-gallery-overlay" role="presentation" onMouseDown={() => setActiveView('chat')}>
            <section
              className="model-gallery"
              aria-labelledby="model-gallery-title"
              data-menu-root
              onMouseDown={(event) => event.stopPropagation()}
            >
              <div className="model-gallery-header">
                <div>
                  <span>Catalogue</span>
                  <h2 id="model-gallery-title">Explorer les modeles</h2>
                </div>
                <button className="close-button" type="button" aria-label="Fermer l explorateur" onClick={() => setActiveView('chat')}>
                  <span className="close-icon" aria-hidden="true"></span>
                </button>
              </div>

              <div className="model-card-grid">
                {models.map((model) => {
                  const meta = modelCardMeta(model.alias)
                  return (
                    <article className="model-card" key={model.alias}>
                      <div className={`model-card-visual ${meta.tone}`} aria-hidden="true">
                        <ModelLogo alias={model.alias} className="model-card-logo" fallback={meta.initials} />
                      </div>
                      <div className="model-card-copy">
                        <div className="model-card-topline">
                          <span>{modelProviderName(model.alias)}</span>
                        </div>
                        <h3>{model.displayName}</h3>
                        <p>{meta.description}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          selectModel(model.alias)
                          setActiveView('chat')
                        }}
                        disabled={isGenerating}
                      >
                        Utiliser ce modele
                      </button>
                    </article>
                  )
                })}
              </div>
            </section>
          </div>
        )}

        <section
          className="messages"
          ref={messagesRef}
          onScroll={onMessagesScroll}
          aria-live="polite"
        >
          {(!hasActiveMessages || isComposerTransitioning) && (
            <div className={`welcome-stack ${hasActiveMessages ? 'leaving' : ''}`}>
              <div className="empty-state">
                <h2>Comment puis-je vous aider ?</h2>
              </div>
            </div>
          )}

          {messages.map((item) => (
            <MessageBubble
              copiedKey={copiedKey}
              fallbackModelName={activeModel?.displayName || modelDisplayName(activeModelAlias)}
              key={item.id}
              message={item}
              onCopy={async (text) => {
                const success = await copyToClipboard(text)
                if (!success) showError('Impossible de copier le contenu.')
                return success
              }}
              setCopiedKey={setCopiedKey}
            />
          ))}
          <div ref={bottomRef} className="bottom-anchor" />
        </section>

        {!isLastBlockVisible && hasActiveMessages && (
          <button className="go-bottom-button" type="button" onClick={goToBottom}>
            <DownArrowIcon />
          </button>
        )}

        <form
          ref={composerRef}
          className={`composer ${hasActiveMessages ? 'composer-bottom' : 'composer-welcome composer-center'} ${isComposerMaxed ? 'composer-maxed' : ''} ${isGenerating ? 'is-generating' : ''}`}
          onSubmit={sendMessage}
        >
          <textarea
            ref={textareaRef}
            disabled={isGenerating}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Poser une question"
            rows={1}
            value={draft}
          />
          <button
            className={isGenerating ? 'stop-button' : ''}
            type={isGenerating ? 'button' : 'submit'}
            aria-label={isGenerating ? 'Interrompre la generation' : 'Envoyer'}
            disabled={!isGenerating && !canSend}
            onClick={isGenerating ? stopGeneration : undefined}
          >
            {isGenerating ? <StopIcon /> : <span className="send-arrow" aria-hidden="true"></span>}
          </button>
        </form>

        {(chatError || chatNotice) && (
          <div className={`inline-error ${chatNotice ? 'success' : ''}`} role={chatError ? 'alert' : 'status'}>
            <span>{chatError || chatNotice}</span>
            <button
              type="button"
              aria-label="Fermer la notification"
              onClick={() => {
                setChatError('')
                setChatNotice('')
              }}
            >
              <span className="close-icon" aria-hidden="true"></span>
            </button>
          </div>
        )}
      </main>

      {modelDecision && (
        <div className="decision-backdrop" role="presentation">
          <div className="decision-box" role="dialog" aria-modal="true" aria-labelledby="model-decision-title">
            <h2 id="model-decision-title">Changer de modele ?</h2>
            <p>Cette conversation utilise actuellement {modelDisplayName(activeConversation?.modelAlias)}. Que souhaitez-vous faire avec {modelDisplayName(modelDecision.alias)} ?</p>
            <div className="decision-actions">
              <button type="button" onClick={() => openNewConversationWithModel(modelDecision.alias)}>
                Ouvrir une nouvelle conversation
              </button>
              <button type="button" onClick={() => continueWithModel(modelDecision.alias)}>
                Continuer cette conversation
              </button>
              <button type="button" className="secondary" onClick={() => setModelDecision(null)}>
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingDeleteConversation && (
        <ConfirmModal
          title="Supprimer la conversation ?"
          message={`La conversation "${displayConversationTitle(pendingDeleteConversation.title)}" sera supprimee definitivement.`}
          confirmLabel="Confirmer"
          cancelLabel="Annuler"
          onCancel={() => setPendingDeleteConversation(null)}
          onConfirm={confirmDeleteConversation}
        />
      )}
    </div>
  )
}

function ConversationMenu({ id, isOpen, onOpen, onRename, onArchive, onDelete, archiveLabel = 'Archiver' }) {
  const [placement, setPlacement] = useState('bottom')

  function handleOpen(event) {
    const rect = event.currentTarget.getBoundingClientRect()
    const estimatedMenuHeight = 126
    setPlacement(window.innerHeight - rect.bottom < estimatedMenuHeight ? 'top' : 'bottom')
    onOpen()
  }

  return (
    <div className={`conversation-menu menu-${placement}`} data-menu-root>
      <button
        className="icon-button"
        type="button"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={`${id}-menu`}
        onClick={handleOpen}
      >
        <DotsIcon />
      </button>
      {isOpen && (
        <div className="menu-popover" id={`${id}-menu`} role="menu">
          <button type="button" role="menuitem" onClick={onRename}>Renommer</button>
          <button type="button" role="menuitem" onClick={onArchive}>{archiveLabel}</button>
          <button type="button" role="menuitem" className="danger" onClick={onDelete}>Supprimer</button>
        </div>
      )}
    </div>
  )
}

function HistoryList({
  activeConversation,
  conversations,
  historyError,
  isLoadingHistory,
  loadConversations,
  openConversation,
  openMenuId,
  setIsAccountMenuOpen,
  setOpenMenuId,
  archiveConversation,
  deleteConversation,
  renameConversation,
  restoreConversation,
  showArchived,
  generatingConversationId,
  unreadConversationIds,
}) {
  return (
    <>
      {historyError && (
        <div className="history-error">
          <span>{historyError}</span>
          <button type="button" onClick={loadConversations}>Reessayer</button>
        </div>
      )}

      <div className="history">
        {isLoadingHistory && <div className="history-empty">Chargement...</div>}
        {!isLoadingHistory && !historyError && conversations.length === 0 && <div className="history-empty">Aucune conversation</div>}
        {conversations.map((conversation) => {
          const isGeneratingConversation = generatingConversationId === conversation.id
          const isUnread = unreadConversationIds.has(conversation.id)
          return (
          <div className={`history-row ${activeConversation?.id === conversation.id ? 'active' : ''} ${isUnread ? 'unread' : ''}`} key={conversation.id}>
            <button className="history-item" type="button" onClick={() => openConversation(conversation)}>
              <span className="history-title">
                <span>{displayConversationTitle(conversation.title)}</span>
                {isGeneratingConversation && <InlineGeneratingIndicator />}
                {isUnread && !isGeneratingConversation && <span className="notification-dot" aria-label="Reponse prete"></span>}
              </span>
              <small className="model-badge">{cleanModelName(conversation.modelDisplayName, conversation.modelAlias)}</small>
            </button>
            <ConversationMenu
              id={`conversation-${conversation.id}`}
              isOpen={openMenuId === conversation.id}
              archiveLabel={showArchived || conversation.status === 'ARCHIVEE' ? 'Desarchiver' : 'Archiver'}
              onArchive={() => (showArchived || conversation.status === 'ARCHIVEE' ? restoreConversation(conversation) : archiveConversation(conversation))}
              onDelete={() => deleteConversation(conversation)}
              onOpen={() => {
                setIsAccountMenuOpen(false)
                setOpenMenuId((current) => (current === conversation.id ? null : conversation.id))
              }}
              onRename={() => renameConversation(conversation)}
            />
          </div>
          )
        })}
      </div>
    </>
  )
}

function ArchiveTabs({ showArchived, setShowArchived }) {
  return (
    <div className="archive-tabs" role="tablist" aria-label="Filtrer les conversations">
      <button
        type="button"
        role="tab"
        aria-selected={!showArchived}
        className={!showArchived ? 'active' : ''}
        onClick={() => setShowArchived(false)}
      >
        Actives
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={showArchived}
        className={showArchived ? 'active' : ''}
        onClick={() => setShowArchived(true)}
      >
        Archives
      </button>
    </div>
  )
}

function SearchModal({
  conversations,
  inputRef,
  isLoadingHistory,
  modelFilter,
  models,
  onClose,
  openConversation,
  search,
  setModelFilter,
  setSearch,
  setShowArchived,
  showArchived,
}) {
  const visibleConversations = modelFilter
    ? conversations.filter((conversation) => conversation.modelAlias === modelFilter)
    : conversations

  return (
    <div className="modal-overlay search-modal-overlay" role="presentation" onMouseDown={onClose}>
      <section
        className="search-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="search-modal-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="search-modal-header">
          <h2 id="search-modal-title">Rechercher</h2>
          <button type="button" aria-label="Fermer la recherche" onClick={onClose}>
            <span className="close-icon" aria-hidden="true"></span>
          </button>
        </div>
        <input
          ref={inputRef}
          className="search-modal-input"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.preventDefault()
          }}
          placeholder="Rechercher une conversation"
        />
        <div className="search-modal-filters">
          <ArchiveTabs showArchived={showArchived} setShowArchived={setShowArchived} />
          <ModelFilterDropdown modelFilter={modelFilter} models={models} setModelFilter={setModelFilter} />
        </div>
        <div className="search-results" role="listbox" aria-label="Resultats de recherche">
          {isLoadingHistory && <div className="search-result-empty">Recherche...</div>}
          {!isLoadingHistory && visibleConversations.length === 0 && (
            <div className="search-result-empty">Aucune conversation trouvee</div>
          )}
          {!isLoadingHistory && visibleConversations.map((conversation) => (
            <button
              key={conversation.id}
              type="button"
              className="search-result-row"
              role="option"
              onClick={async () => {
                await openConversation(conversation)
                onClose()
              }}
            >
              <span>{displayConversationTitle(conversation.title)}</span>
              <small>{cleanModelName(conversation.modelDisplayName, conversation.modelAlias)}</small>
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}

function InlineGeneratingIndicator() {
  return (
    <span className="inline-generating" aria-label="Generation en cours">
      <span></span>
      <span></span>
      <span></span>
    </span>
  )
}

function ModelFilterDropdown({ modelFilter, models, setModelFilter }) {
  const [isModelFilterOpen, setIsModelFilterOpen] = useState(false)
  const activeFilterLabel = models.find((model) => model.alias === modelFilter)?.displayName || 'Tous les modeles'

  return (
    <div className="custom-dropdown" data-menu-root>
      <button
        type="button"
        className="custom-dropdown-trigger"
        aria-haspopup="listbox"
        aria-expanded={isModelFilterOpen}
        onClick={() => setIsModelFilterOpen((current) => !current)}
      >
        <span>{activeFilterLabel}</span>
        <DownArrowIcon />
      </button>
      {isModelFilterOpen && (
        <ul className="custom-dropdown-menu" role="listbox" aria-label="Filtrer par modele">
          <li
            role="option"
            aria-selected={modelFilter === ''}
            className={modelFilter === '' ? 'selected' : ''}
            onClick={() => {
              setModelFilter('')
              setIsModelFilterOpen(false)
            }}
          >
            Tous les modeles
          </li>
          {models.map((model) => (
            <li
              key={model.alias}
              role="option"
              aria-selected={modelFilter === model.alias}
              className={modelFilter === model.alias ? 'selected' : ''}
              onClick={() => {
                setModelFilter(model.alias)
                setIsModelFilterOpen(false)
              }}
            >
              {model.displayName}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function DotsIcon() {
  return (
    <span className="dots-icon" aria-hidden="true">
      <span></span>
      <span></span>
      <span></span>
    </span>
  )
}

function DownArrowIcon() {
  return <span className="down-arrow-icon" aria-hidden="true"></span>
}

function StopIcon() {
  return <span className="stop-icon" aria-hidden="true"></span>
}

function ConfirmModal({ cancelLabel, confirmLabel, message, onCancel, onConfirm, title }) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onCancel}>
      <div
        className="confirm-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id="confirm-modal-title">{title}</h2>
        <p>{message}</p>
        <div className="confirm-modal-actions">
          <button type="button" className="secondary" onClick={onCancel}>{cancelLabel}</button>
          <button type="button" className="danger" onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}

async function deletionErrorMessage(response) {
  if (response.status === 404) return 'Conversation introuvable ou deja supprimee.'
  if (response.status === 409) return 'Cette conversation ne peut pas etre supprimee pour le moment.'
  if (response.status >= 500) return 'Suppression impossible cote serveur. Verifiez les liens messages/conversation.'
  return requestStatusMessage(response, 'Impossible de supprimer la conversation.')
}

async function requestStatusMessage(response, fallback) {
  let details
  try {
    details = await response.text()
  } catch {
    details = ''
  }
  return details?.trim() || `${fallback} Statut HTTP ${response.status}.`
}

function requestErrorMessage(error, fallback) {
  if (error instanceof TypeError && /fetch/i.test(error.message)) {
    return `${fallback} Le backend est inaccessible ou la requete est bloquee par CORS.`
  }
  return error instanceof Error ? error.message : fallback
}

function friendlyGenerationError(error) {
  const rawMessage = typeof error === 'string' ? error : error instanceof Error ? error.message : ''
  if (/litellm|stream|streaming|fetch|network|failed/i.test(rawMessage)) {
    return 'Le modele est temporairement indisponible. Veuillez reessayer.'
  }
  return rawMessage.trim() || 'La generation a echoue. Veuillez reessayer.'
}

function MessageBubble({ copiedKey, message, fallbackModelName, onCopy, setCopiedKey }) {
  const isUser = message.role === 'USER'
  const modelName = cleanModelName(message.modelDisplayName || fallbackModelName, message.modelAlias)
  const isWaiting = !isUser && message.status === 'EN_COURS' && !message.content
  const isFailed = !isUser && message.status === 'ECHEC'
  const messageCopyKey = `message-${message.id}`
  const promptCopyKey = `prompt-${message.id}`
  const textDirection = detectTextDirection(message.content || '')

  async function copyResponse(copyKey = messageCopyKey) {
    const success = await onCopy(message.content || '')
    if (!success) return
    markCopied(copyKey, setCopiedKey)
  }

  return (
    <article className={`message ${isUser ? 'user' : 'assistant'}`}>
      <div className="bubble">
        {!isUser && <AssistantMessageHeader modelAlias={message.modelAlias} modelName={modelName} />}
        {isUser ? (
          <div className="user-message-wrap">
            <p>{message.content}</p>
          </div>
        ) : isWaiting ? (
          <TypingIndicator />
        ) : isFailed ? (
          <ErrorMessage content={message.content || 'La generation a echoue.'} />
        ) : (
          <>
            <MarkdownContent
              content={message.content || ''}
              copiedKey={copiedKey}
              direction={textDirection}
              onCopy={onCopy}
              setCopiedKey={setCopiedKey}
            />
            {message.content && (
              <div className="message-actions">
                <button type="button" aria-label="Copier la reponse" onClick={copyResponse}>
                  {copiedKey === messageCopyKey ? <span>Copie</span> : <CopyIcon />}
                </button>
              </div>
            )}
          </>
        )}
      </div>
      {isUser && message.content && (
        <div className="message-actions user-actions">
          <button type="button" aria-label="Copier mon prompt" onClick={() => copyResponse(promptCopyKey)}>
            {copiedKey === promptCopyKey ? <span>Copie</span> : <CopyIcon />}
          </button>
        </div>
      )}
    </article>
  )
}

function AssistantMessageHeader({ modelAlias, modelName }) {
  const meta = modelCardMeta(modelAlias)

  return (
    <div className="assistant-header">
      <ModelLogo alias={modelAlias} className={`assistant-logo ${meta.tone}`} fallback={meta.initials} />
      <div className="assistant-meta">
        <strong>{modelName}</strong>
      </div>
    </div>
  )
}

function MarkdownContent({ content, copiedKey, direction, onCopy, setCopiedKey }) {
  const normalizedContent = normalizeAssistantMarkdown(normalizeMarkdownCodeFences(content))

  return (
    <div className="markdown-body" dir={direction}>
      <ReactMarkdown
        components={{
          code({ children, className, ...props }) {
            return <code className={className} {...props}>{children}</code>
          },
          pre({ children }) {
            const child = Array.isArray(children) ? children[0] : children
            const props = child?.props || {}
            const className = props.className || ''
            const match = /language-([^\s]+)/.exec(className)
            const code = String(props.children || '').replace(/\n$/, '')
            return (
              <CodeBlock
                code={code}
                copiedKey={copiedKey}
                language={match?.[1] || 'text'}
                onCopy={onCopy}
                setCopiedKey={setCopiedKey}
              />
            )
          },
        }}
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
      >
        {normalizedContent}
      </ReactMarkdown>
    </div>
  )
}

function CodeBlock({ code, copiedKey, language, onCopy, setCopiedKey }) {
  const detectedLanguage = detectCodeLanguage(code, language)
  const copyKey = `code-${hashText(`${detectedLanguage}:${code}`)}`

  async function copyCode() {
    const success = await onCopy(code)
    if (!success) return
    markCopied(copyKey, setCopiedKey)
  }

  return (
    <div className="code-block">
      <div className="code-block-header">
        <span>{formatLanguageName(detectedLanguage)}</span>
        <button type="button" aria-label="Copier le code" onClick={copyCode}>
          {copiedKey === copyKey ? 'Copie' : <CopyIcon tone="light" />}
        </button>
      </div>
      <SyntaxHighlighter
        CodeTag="code"
        PreTag="div"
        customStyle={{
          background: '#0b1020',
          margin: 0,
          padding: '15px 16px',
        }}
        language={detectedLanguage}
        lineNumberStyle={{
          color: 'rgba(203, 213, 225, 0.38)',
          minWidth: '2.25em',
          paddingRight: '1em',
        }}
        showLineNumbers={code.split('\n').length > 15}
        style={oneDark}
        wrapLongLines={false}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  )
}

function ErrorMessage({ content }) {
  return (
    <div className="assistant-error" role="alert">
      <strong>Impossible de generer la reponse</strong>
      <p>{content}</p>
    </div>
  )
}

function TypingIndicator() {
  return (
    <div className="typing-indicator" aria-label="Reponse en cours">
      <span></span>
      <span></span>
      <span></span>
    </div>
  )
}

function CopyIcon({ tone = 'dark' }) {
  const src = tone === 'light' ? '/assets/white_copy.png' : '/assets/copy.png'
  return <img className="copy-icon" src={src} alt="" aria-hidden="true" />
}

function ModelLogo({ alias, className = '' }) {
  const logo = modelLogoSrc(alias)

  if (!logo) {
    return null
  }

  return (
    <span className={className}>
      <img src={logo} alt="" onError={(event) => { event.currentTarget.style.display = 'none' }} />
    </span>
  )
}

async function copyToClipboard(text) {
  if (!text) return false
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch (error) {
    logDevelopmentError('clipboard failed', error)
    return false
  }
}

function hashText(value) {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0
  }
  return Math.abs(hash).toString(36)
}

function markCopied(copyKey, setCopiedKey) {
  setCopiedKey(copyKey)
  window.setTimeout(() => setCopiedKey((current) => (current === copyKey ? '' : current)), 1500)
}

function detectTextDirection(text) {
  const rtlMatches = text.match(/[\u0590-\u05ff\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff\ufb50-\ufdff\ufe70-\ufeff]/g) || []
  const ltrMatches = text.match(/[A-Za-z\u00c0-\u024f]/g) || []
  return rtlMatches.length > ltrMatches.length ? 'rtl' : 'ltr'
}

function normalizeMarkdownCodeFences(content) {
  return String(content || '').replace(/^```([^\s`]+)(.*)$/gm, (line, rawLanguage, rest) => {
    const language = String(rawLanguage || '').trim()
    const stickyFence = splitStickyFenceLanguage(language, rest || '')
    if (stickyFence) {
      return `\`\`\`${stickyFence.language}\n${stickyFence.code}`.trimEnd()
    }

    const normalized = normalizeCodeLanguage(language)
    if (normalized !== 'text' && normalized !== language.toLowerCase()) {
      return `\`\`\`${normalized}${rest || ''}`
    }
    return line
  })
}

function normalizeAssistantMarkdown(content) {
  let isCodeBlock = false
  return String(content || '')
    .split('\n')
    .map((line) => {
      if (/^\s*```/.test(line)) {
        isCodeBlock = !isCodeBlock
        return line
      }

      if (isCodeBlock) return line

      return line.replace(/^(#{1,6})(?=\S)/, (match, hashes) => {
        if (hashes.length === 1 && /^#include\b/i.test(line)) return match
        return `${hashes} `
      })
    })
    .join('\n')
}

function splitStickyFenceLanguage(language, rest) {
  const value = String(language || '')
  const lower = value.toLowerCase()
  const candidates = [
    { language: 'cpp', match: /^cpp(#include)/i, prefixLength: 3 },
    { language: 'c', match: /^c(#include)/i, prefixLength: 1 },
    { language: 'java', match: /^java(import|package|public|class)/i, prefixLength: 4 },
    { language: 'python', match: /^python(from|import|def|class)/i, prefixLength: 6 },
  ]
  const candidate = candidates.find((item) => item.match.test(lower))
  if (!candidate) return null

  return {
    language: candidate.language,
    code: `${value.slice(candidate.prefixLength)}${rest}`,
  }
}

function normalizeCodeLanguage(language) {
  const value = String(language || '').trim().toLowerCase()
  if (!value || value === 'code' || value === 'text') return 'text'

  const aliases = {
    c99: 'c',
    c11: 'c',
    cpp: 'cpp',
    'c++': 'cpp',
    'c#': 'csharp',
    csharp: 'csharp',
    cs: 'csharp',
    js: 'javascript',
    ts: 'typescript',
    sh: 'bash',
    shell: 'bash',
    zsh: 'bash',
    html: 'markup',
    htm: 'markup',
    xml: 'markup',
    py: 'python',
    yml: 'yaml',
    ps1: 'powershell',
    dockerfile: 'docker',
  }

  if (aliases[value]) return aliases[value]
  if (value.startsWith('c#include')) return 'c'
  if (value.startsWith('cpp#include')) return 'cpp'

  return supportedCodeLanguages.has(value) ? value : 'text'
}

const supportedCodeLanguages = new Set([
  'bash',
  'c',
  'cpp',
  'csharp',
  'css',
  'docker',
  'go',
  'java',
  'javascript',
  'json',
  'jsx',
  'kotlin',
  'markdown',
  'markup',
  'php',
  'powershell',
  'python',
  'rust',
  'sql',
  'tsx',
  'typescript',
  'yaml',
])

function detectCodeLanguage(code, declaredLanguage) {
  const declared = normalizeCodeLanguage(declaredLanguage)
  if (declared !== 'text') return declared

  const source = String(code || '').trim()
  if (!source) return 'text'
  const lower = source.toLowerCase()

  if (/^\s*[{[]/.test(source)) {
    try {
      JSON.parse(source)
      return 'json'
    } catch {
      // Keep checking other languages.
    }
  }

  if (/#include\s*[<"]/.test(source) && /using\s+namespace\s+std|std::|cout\s*<</.test(source)) return 'cpp'
  if (/#include\s*[<"]/.test(source)) return 'c'
  if (/console\.writeline|using\s+system|namespace\s+\w+\s*{|static\s+void\s+main\s*\(/i.test(source)) return 'csharp'
  if (/public\s+static\s+void\s+main\s*\(|system\.out\.println|import\s+java\./i.test(source)) return 'java'
  if (/import\s+react|from\s+['"]react['"]|<[A-Z][\w.]*[\s>]|className=|<\/[A-Z][\w.]*>/i.test(source)) return 'jsx'
  if (/\binterface\s+\w+|:\s*(string|number|boolean|unknown|any)\b|type\s+\w+\s*=/.test(source)) return 'typescript'
  if (/^\s*(def|class)\s+\w+|^\s*from\s+\w+\s+import\s+|^\s*import\s+\w+/m.test(source)) return 'python'
  if (/\b(select|insert\s+into|update|delete\s+from|create\s+table|alter\s+table)\b[\s\S]*(\bfrom\b|\bvalues\b|\bset\b|\()/i.test(source)) return 'sql'
  if (/^\s*<!doctype html|<html[\s>]|<\/?[a-z][\w:-]*(\s+[^>]*)?>/i.test(source)) return 'markup'
  if (/^\s*[\w.#:[\]-]+\s*{[\s\S]*:\s*[^;]+;[\s\S]*}/.test(source)) return 'css'
  if (/^\s*(function|const|let|var)\s+\w+|=>|console\.log/i.test(source)) return 'javascript'
  if (/^\s*FROM\s+\S+|^\s*RUN\s+|^\s*COPY\s+|^\s*CMD\s+/im.test(source)) return 'docker'
  if (/^\s*package\s+main|fmt\.Println|func\s+\w+\s*\(/m.test(source)) return 'go'
  if (/^\s*fn\s+\w+\s*\(|println!\s*\(|let\s+mut\s+/m.test(source)) return 'rust'
  if (/^\s*fun\s+\w+\s*\(|println\s*\(|val\s+\w+\s*=|var\s+\w+\s*=/m.test(source)) return 'kotlin'
  if (/<\?php|\becho\s+['"]|\$\w+\s*=/.test(lower)) return 'php'

  return 'text'
}

function formatLanguageName(language) {
  const normalized = normalizeCodeLanguage(language)
  const names = {
    bash: 'Bash',
    c: 'C',
    cpp: 'C++',
    csharp: 'C#',
    css: 'CSS',
    docker: 'Dockerfile',
    go: 'Go',
    java: 'Java',
    javascript: 'JavaScript',
    json: 'JSON',
    jsx: 'JSX',
    kotlin: 'Kotlin',
    markdown: 'Markdown',
    markup: 'HTML',
    php: 'PHP',
    powershell: 'PowerShell',
    python: 'Python',
    rust: 'Rust',
    sql: 'SQL',
    text: 'Code',
    tsx: 'TSX',
    typescript: 'TypeScript',
    yaml: 'YAML',
  }
  return names[normalized] || 'Code'
}

function modelLogoSrc(alias) {
  const logos = {
    'secure-gpt': '/assets/ChatGPT Logo.png',
    'secure-groq': '/assets/groq logo.png',
    'secure-gemini': '/assets/gemini logo.png',
    'secure-mistral': '/assets/mistral logo.png',
    'secure-claude': '/assets/claude logo.png',
  }
  return logos[alias] || ''
}

function logDevelopmentError(label, payload) {
  if (import.meta.env.DEV) {
    console.error(label, payload)
  }
}

function parseJson(value) {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function extractSseData(lines, preserveWhitespace = false) {
  return lines
    .filter((line) => line.startsWith('data:'))
    .map((line) => {
      const value = line.slice(5).replace(/\r$/, '')
      if (preserveWhitespace) return value.startsWith(' ') ? value.slice(1) : value
      return value.startsWith(' ') ? value.slice(1) : value.trim()
    })
    .join('\n')
}

function saveLastModel(alias) {
  if (!alias) return
  localStorage.setItem(LAST_MODEL_STORAGE_KEY, alias)
}

function saveActiveConversationId(id) {
  if (!id) return
  localStorage.setItem(ACTIVE_CONVERSATION_STORAGE_KEY, String(id))
}

function clearActiveConversationId(id) {
  const current = localStorage.getItem(ACTIVE_CONVERSATION_STORAGE_KEY)
  if (!id || current === String(id)) {
    localStorage.removeItem(ACTIVE_CONVERSATION_STORAGE_KEY)
  }
}

function selectAvailableModel(models, currentAlias) {
  const savedAlias = localStorage.getItem(LAST_MODEL_STORAGE_KEY)
  if (savedAlias && models.some((model) => model.alias === savedAlias)) return savedAlias
  if (savedAlias) localStorage.removeItem(LAST_MODEL_STORAGE_KEY)
  if (currentAlias && models.some((model) => model.alias === currentAlias)) return currentAlias
  return models[0]?.alias || ''
}

function cleanModelName(value, alias) {
  const candidate = value || alias
  const names = {
    'secure-gpt': 'GPT',
    'secure-groq': 'Groq',
    'secure-gemini': 'Gemini',
    'secure-mistral': 'Mistral',
    'secure-claude': 'Claude',
  }
  if (names[candidate]) return names[candidate]
  if (candidate?.startsWith?.('secure-')) return names[alias] || candidate.replace(/^secure-/i, '')
  return candidate
    .replace(/^secure[-_\s]*model[-_\s]*/i, '')
    .replace(/^secure[-_\s]*/i, '')
    .replace(/\bGro[kq]\b/g, 'Groq')
    .trim()
}

function displayConversationTitle(title) {
  return String(title || 'Nouvelle conversation')
    .replace(/^Discussion:\s*/i, '')
    .trim() || 'Nouvelle conversation'
}

function modelProviderName(alias) {
  const providers = {
    'secure-gpt': 'OpenAI',
    'secure-groq': 'Groq',
    'secure-gemini': 'Google',
    'secure-mistral': 'Mistral',
    'secure-claude': 'Anthropic',
  }
  return providers[alias] || 'Provider'
}

function modelCardMeta(alias) {
  const metas = {
    'secure-gpt': {
      initials: 'GPT',
      tone: 'tone-openai',
      description: 'Modele generaliste adapte aux reponses concises, au raisonnement et aux usages quotidiens.',
    },
    'secure-groq': {
      initials: 'GQ',
      tone: 'tone-groq',
      description: 'Modele rapide pour tester les conversations et obtenir des reponses reactives.',
    },
    'secure-gemini': {
      initials: 'GM',
      tone: 'tone-gemini',
      description: 'Modele polyvalent pour explorer, reformuler et structurer des idees.',
    },
    'secure-mistral': {
      initials: 'MS',
      tone: 'tone-mistral',
      description: 'Modele efficace pour les taches pratiques, les syntheses et les prompts directs.',
    },
    'secure-claude': {
      initials: 'CL',
      tone: 'tone-claude',
      description: 'Modele oriente redaction, analyse longue et conversations soignees.',
    },
  }
  return metas[alias] || {
    initials: cleanModelName(alias, alias).slice(0, 2).toUpperCase(),
    tone: 'tone-default',
    description: 'Modele disponible dans le catalogue Secure LLM Gateway.',
  }
}

function titleFrom(content) {
  const compact = content.replace(/\s+/g, ' ').trim()
  const words = compact
    .split(' ')
    .map((word) => word.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter((word) => word.length >= 4)
    .slice(0, 6)
  return words.length > 0 ? `Discussion: ${words.join(' ')}` : 'Nouvelle conversation'
}

export default App
