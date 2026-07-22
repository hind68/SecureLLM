import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { PrismLight as SyntaxHighlighter } from 'react-syntax-highlighter'
import bash from 'react-syntax-highlighter/dist/esm/languages/prism/bash'
import css from 'react-syntax-highlighter/dist/esm/languages/prism/css'
import java from 'react-syntax-highlighter/dist/esm/languages/prism/java'
import javascript from 'react-syntax-highlighter/dist/esm/languages/prism/javascript'
import json from 'react-syntax-highlighter/dist/esm/languages/prism/json'
import jsx from 'react-syntax-highlighter/dist/esm/languages/prism/jsx'
import markdown from 'react-syntax-highlighter/dist/esm/languages/prism/markdown'
import powershell from 'react-syntax-highlighter/dist/esm/languages/prism/powershell'
import python from 'react-syntax-highlighter/dist/esm/languages/prism/python'
import sql from 'react-syntax-highlighter/dist/esm/languages/prism/sql'
import yaml from 'react-syntax-highlighter/dist/esm/languages/prism/yaml'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import rehypeSanitize from 'rehype-sanitize'
import remarkGfm from 'remark-gfm'
import './App.css'

const API_BASE_URL = 'http://localhost:8080/api'
const SIDEBAR_STORAGE_KEY = 'secure-llm-sidebar-open'

SyntaxHighlighter.registerLanguage('bash', bash)
SyntaxHighlighter.registerLanguage('css', css)
SyntaxHighlighter.registerLanguage('java', java)
SyntaxHighlighter.registerLanguage('javascript', javascript)
SyntaxHighlighter.registerLanguage('js', javascript)
SyntaxHighlighter.registerLanguage('json', json)
SyntaxHighlighter.registerLanguage('jsx', jsx)
SyntaxHighlighter.registerLanguage('markdown', markdown)
SyntaxHighlighter.registerLanguage('md', markdown)
SyntaxHighlighter.registerLanguage('powershell', powershell)
SyntaxHighlighter.registerLanguage('ps1', powershell)
SyntaxHighlighter.registerLanguage('python', python)
SyntaxHighlighter.registerLanguage('sql', sql)
SyntaxHighlighter.registerLanguage('yaml', yaml)
SyntaxHighlighter.registerLanguage('yml', yaml)

function App() {
  const [models, setModels] = useState([])
  const [selectedModel, setSelectedModel] = useState('')
  const [modelFilter, setModelFilter] = useState('')
  const [search, setSearch] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [conversations, setConversations] = useState([])
  const [activeConversation, setActiveConversation] = useState(null)
  const [messages, setMessages] = useState([])
  const [draft, setDraft] = useState('')
  const [historyError, setHistoryError] = useState('')
  const [chatError, setChatError] = useState('')
  const [chatNotice, setChatNotice] = useState('')
  const [copiedKey, setCopiedKey] = useState('')
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)
  const [isLoadingModels, setIsLoadingModels] = useState(true)
  const [isSending, setIsSending] = useState(false)
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => localStorage.getItem(SIDEBAR_STORAGE_KEY) !== 'false')
  const [activeView, setActiveView] = useState('chat')
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [isAdvancedFiltersOpen, setIsAdvancedFiltersOpen] = useState(false)
  const [collapsedPanel, setCollapsedPanel] = useState(null)
  const [openMenuId, setOpenMenuId] = useState(null)
  const [isHeaderMenuOpen, setIsHeaderMenuOpen] = useState(false)
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false)
  const [isModelMenuOpen, setIsModelMenuOpen] = useState(false)
  const [modelDecision, setModelDecision] = useState(null)
  const [isLastBlockVisible, setIsLastBlockVisible] = useState(true)
  const [isComposerMaxed, setIsComposerMaxed] = useState(false)
  const [isComposerTransitioning, setIsComposerTransitioning] = useState(false)

  const messagesRef = useRef(null)
  const bottomRef = useRef(null)
  const textareaRef = useRef(null)
  const composerRef = useRef(null)
  const composerBeforeRectRef = useRef(null)
  const composerTimerRef = useRef(null)
  const localIdCounterRef = useRef(0)
  const shouldAutoScrollRef = useRef(true)
  const scrollFrameRef = useRef(null)

  const activeModelAlias = activeConversation?.modelAlias || selectedModel
  const activeModel = models.find((model) => model.alias === activeModelAlias)
  const canSend = Boolean(activeModelAlias && draft.trim() && !isSending)
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
    setIsFilterOpen(false)
    setIsAdvancedFiltersOpen(false)
    setActiveView('chat')
  }, [closeTransientMenus])

  const showError = useCallback((message) => {
    setChatNotice('')
    setChatError(message)
  }, [])

  const showNotice = useCallback((message) => {
    setChatError('')
    setChatNotice(message)
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
      setSelectedModel((current) => current || normalized[0]?.alias || '')
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
        setSelectedModel((current) => current || normalized[0]?.alias || '')
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
    } catch {
      setHistoryError('Impossible de charger l historique.')
    } finally {
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
    function closeMenus(event) {
      if (!event.target.closest('[data-menu-root]')) {
        closeTransientMenus()
      }
    }

    function closeOnEscape(event) {
      if (event.key === 'Escape') {
        closeTransientMenus()
        setModelDecision(null)
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

  useEffect(() => () => {
    if (scrollFrameRef.current) {
      cancelAnimationFrame(scrollFrameRef.current)
    }
    if (composerTimerRef.current) {
      window.clearTimeout(composerTimerRef.current)
    }
  }, [showError])

  async function openConversation(conversation) {
    if (isSending) return
    try {
      setChatError('')
      closeTransientMenus()
      setActiveConversation(conversation)
      setSelectedModel(conversation.modelAlias)
      setIsLastBlockVisible(true)
      shouldAutoScrollRef.current = true
      const response = await fetch(`${API_BASE_URL}/conversations/${conversation.id}/messages`)
      if (!response.ok) throw new Error('messages')
      setMessages(await response.json())
      closeSidePanelOnMobile()
    } catch {
      showError('Impossible de reprendre cette conversation.')
    }
  }

  function newConversation(modelAlias = selectedModel) {
    if (isSending) return
    setActiveConversation(null)
    setMessages([])
    setDraft('')
    setChatError('')
    closeTransientMenus()
    setSelectedModel(modelAlias)
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
    setSelectedModel(conversation.modelAlias)
    setConversations((current) => [conversation, ...current.filter((item) => item.id !== conversation.id)])
    return conversation
  }

  async function ensureConversation(prompt) {
    if (activeConversation) return activeConversation
    return createConversation(selectedModel, titleFrom(prompt))
  }

  async function sendMessage(event) {
    event.preventDefault()
    const prompt = draft.trim()
    if (!prompt) {
      showError('Le message ne peut pas etre vide.')
      return
    }

    setChatError('')
    if (!hasActiveMessages && composerRef.current) {
      composerBeforeRectRef.current = composerRef.current.getBoundingClientRect()
    }
    setIsSending(true)
    setDraft('')
    setIsLastBlockVisible(true)
    shouldAutoScrollRef.current = true

    try {
      const conversation = await ensureConversation(prompt)
      await streamMessage(conversation, prompt)
      await loadConversations()
    } catch {
      showError('La requete a echoue. Verifiez Spring Boot, LiteLLM et le provider.')
    } finally {
      setIsSending(false)
    }
  }

  async function streamMessage(conversation, prompt) {
    const modelName = modelDisplayName(conversation.modelAlias)
    const localUserId = nextLocalId('local-user')
    const localAssistantId = nextLocalId('local-assistant')

    setMessages((current) => [
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

    const response = await fetch(`${API_BASE_URL}/conversations/${conversation.id}/messages/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: prompt }),
    })

    if (!response.ok || !response.body) throw new Error('stream')

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const events = buffer.split('\n\n')
      buffer = events.pop() || ''
      events.forEach((rawEvent) => handleSseEvent(rawEvent, localUserId, localAssistantId))
    }

    if (buffer.trim()) {
      handleSseEvent(buffer, localUserId, localAssistantId)
    }
  }

  function handleSseEvent(rawEvent, localUserId, localAssistantId) {
    const lines = rawEvent.split('\n')
    const event = lines.find((line) => line.startsWith('event:'))?.slice(6).trim()
    const data = lines
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trim())
      .join('\n')

    if (event === 'message') {
      const parsed = parseJson(data)
      if (!parsed) return
      const targetId = parsed.role === 'USER' ? localUserId : localAssistantId
      setMessages((current) =>
        current.map((item) =>
          item.id === targetId
            ? { ...item, ...parsed, id: targetId, serverId: parsed.id }
            : item,
        ),
      )
    }

    if (event === 'token') {
      setMessages((current) =>
        current.map((item) =>
          item.id === localAssistantId ? { ...item, content: `${item.content}${data}` } : item,
        ),
      )
    }

    if (event === 'done') {
      const parsed = parseJson(data)
      setMessages((current) =>
        current.map((item) =>
          item.id === localAssistantId
            ? { ...item, id: parsed?.messageId || item.id, status: 'TERMINE', content: parsed?.content ?? item.content }
            : item,
        ),
      )
    }

    if (event === 'error') {
      setMessages((current) =>
        current.map((item) =>
          item.id === localAssistantId ? { ...item, status: 'ECHEC', content: item.content || data } : item,
        ),
      )
    }
  }

  async function renameConversation(conversation = activeConversation) {
    if (!conversation || isSending) return
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
    if (!conversation || isSending) return
    try {
      const response = await fetch(`${API_BASE_URL}/conversations/${conversation.id}`, { method: 'DELETE' })
      if (!response.ok) throw new Error('archive')
      setConversations((current) => current.filter((item) => item.id !== conversation.id))
      if (activeConversation?.id === conversation.id) {
        setActiveConversation(null)
        setMessages([])
      }
      closeMenus()
      await loadConversations()
    } catch {
      showError('Impossible d archiver la conversation.')
    }
  }

  async function deleteConversation(conversation = activeConversation) {
    if (!conversation || isSending) return
    if (!conversation.id) {
      showError('Impossible de supprimer cette conversation: identifiant manquant.')
      logDevelopmentError('delete conversation missing id', conversation)
      return
    }
    if (!window.confirm('Supprimer definitivement cette conversation ?')) return
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
      closeMenus()
      showNotice('Conversation supprimee.')
      await loadConversations()
    } catch (error) {
      showError(requestErrorMessage(error, 'Impossible de supprimer la conversation.'))
    }
  }

  async function selectModel(alias) {
    setIsModelMenuOpen(false)
    if (isSending) return
    if (!activeConversation) {
      setSelectedModel(alias)
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
    if (panel !== 'search') {
      setIsFilterOpen(false)
    }
    setCollapsedPanel((current) => (current === panel ? null : panel))
  }

  function closeSidePanelOnMobile() {
    if (window.innerWidth < 820) {
      closeSidebarPanels()
      setIsSidebarOpen(false)
    }
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
          <button type="button" title="Nouvelle conversation" aria-label="Nouvelle conversation" onClick={() => { closeSidebarPanels(); newConversation() }}>
            <span className="sidebar-icon" aria-hidden="true">
              <img src="/assets/new-tab.png" alt="" />
            </span>
            <span>Nouvelle conversation</span>
          </button>
          <button
            className={isFilterOpen || collapsedPanel === 'search' ? 'active' : ''}
            type="button"
            title="Rechercher"
            aria-label="Rechercher"
            onClick={() => {
              if (isSidebarOpen) {
                setIsAccountMenuOpen(false)
                setActiveView('chat')
                setCollapsedPanel(null)
                setIsFilterOpen((current) => !current)
              } else {
                setShowArchived(false)
                setIsFilterOpen(true)
                toggleCollapsedPanel('search')
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
              setIsFilterOpen(false)
              setIsAdvancedFiltersOpen(false)
              setActiveView((current) => (current === 'models' ? 'chat' : 'models'))
            }}
          >
            <span className="sidebar-icon" aria-hidden="true">
              <img src="/assets/compass.png" alt="" />
            </span>
            <span>Explorer les modeles</span>
          </button>
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
                setIsFilterOpen(false)
                setIsAdvancedFiltersOpen(false)
                setModelFilter('')
                setSearch('')
                setOpenMenuId(null)
              } else {
                setIsAdvancedFiltersOpen(false)
                setIsFilterOpen(true)
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
            <span>{showArchived ? 'Archives' : 'Recents'}</span>
            {isSidebarOpen && (
              <button
                type="button"
                aria-label="Filtres"
                onClick={() => {
                  setIsFilterOpen((current) => {
                    const next = !current
                    setIsAdvancedFiltersOpen(next)
                    return next
                  })
                }}
              >
                <img src="/assets/filter.png" alt="" />
              </button>
            )}
          </div>

          {isFilterOpen && (
            <SearchPanel
              hideFilterButton
              isAdvancedFiltersOpen={isAdvancedFiltersOpen}
              modelFilter={modelFilter}
              models={models}
              search={search}
              setIsAdvancedFiltersOpen={setIsAdvancedFiltersOpen}
              setModelFilter={setModelFilter}
              setSearch={setSearch}
              setShowArchived={setShowArchived}
              showArchived={showArchived}
            />
          )}

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
            <SearchPanel
              isAdvancedFiltersOpen={isAdvancedFiltersOpen}
              modelFilter={modelFilter}
              models={models}
              search={search}
              setIsAdvancedFiltersOpen={setIsAdvancedFiltersOpen}
              setModelFilter={setModelFilter}
              setSearch={setSearch}
              setShowArchived={setShowArchived}
              showArchived={showArchived}
            />
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
          />
        </div>
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
                disabled={isSending || isLoadingModels}
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
                onArchive={() => archiveConversation(activeConversation)}
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
          <section className="model-gallery" aria-labelledby="model-gallery-title" data-menu-root>
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
                      disabled={isSending}
                    >
                      Utiliser ce modele
                    </button>
                  </article>
                )
              })}
            </div>
          </section>
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
          className={`composer ${hasActiveMessages ? 'composer-bottom' : 'composer-welcome composer-center'} ${isComposerMaxed ? 'composer-maxed' : ''}`}
          onSubmit={sendMessage}
        >
          <textarea
            ref={textareaRef}
            disabled={isSending}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Poser une question"
            rows={1}
            value={draft}
          />
          <button type="submit" aria-label="Envoyer" disabled={!canSend}>
            {isSending ? <DotsIcon /> : <span className="send-arrow" aria-hidden="true"></span>}
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
    </div>
  )
}

function ConversationMenu({ id, isOpen, onOpen, onRename, onArchive, onDelete }) {
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
          <button type="button" role="menuitem" onClick={onArchive}>Archiver</button>
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
        {conversations.map((conversation) => (
          <div className={`history-row ${activeConversation?.id === conversation.id ? 'active' : ''}`} key={conversation.id}>
            <button className="history-item" type="button" onClick={() => openConversation(conversation)}>
              <span>{conversation.title}</span>
              <small>{cleanModelName(conversation.modelDisplayName, conversation.modelAlias)}</small>
            </button>
            <ConversationMenu
              id={`conversation-${conversation.id}`}
              isOpen={openMenuId === conversation.id}
              onArchive={() => archiveConversation(conversation)}
              onDelete={() => deleteConversation(conversation)}
              onOpen={() => {
                setIsAccountMenuOpen(false)
                setOpenMenuId((current) => (current === conversation.id ? null : conversation.id))
              }}
              onRename={() => renameConversation(conversation)}
            />
          </div>
        ))}
      </div>
    </>
  )
}

function SearchPanel({
  hideFilterButton = false,
  isAdvancedFiltersOpen,
  modelFilter,
  models,
  search,
  setIsAdvancedFiltersOpen,
  setModelFilter,
  setSearch,
  setShowArchived,
  showArchived,
}) {
  return (
    <div className="search-panel">
      <div className={`search-line ${hideFilterButton ? 'without-filter-button' : ''}`}>
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher" />
        {!hideFilterButton && (
          <button type="button" aria-label="Afficher les filtres avances" onClick={() => setIsAdvancedFiltersOpen((current) => !current)}>
            <img src="/assets/filter.png" alt="" />
          </button>
        )}
      </div>

      {isAdvancedFiltersOpen && (
        <div className="advanced-filters">
          <select value={modelFilter} onChange={(event) => setModelFilter(event.target.value)}>
            <option value="">Tous les modeles</option>
            {models.map((model) => (
              <option key={model.alias} value={model.alias}>{model.displayName}</option>
            ))}
          </select>
          <label>
            <input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} />
            <span>Archives</span>
          </label>
        </div>
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
                language={match?.[1] || 'code'}
                onCopy={onCopy}
                setCopiedKey={setCopiedKey}
              />
            )
          },
        }}
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}

function CodeBlock({ code, copiedKey, language, onCopy, setCopiedKey }) {
  const copyKey = `code-${hashText(`${language}:${code}`)}`

  async function copyCode() {
    const success = await onCopy(code)
    if (!success) return
    markCopied(copyKey, setCopiedKey)
  }

  return (
    <div className="code-block">
      <div className="code-block-header">
        <span>{formatLanguageName(language)}</span>
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
        language={language === 'code' ? 'text' : language}
        style={vscDarkPlus}
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

function ModelLogo({ alias, className = '', fallback }) {
  const [canShowLogo, setCanShowLogo] = useState(Boolean(modelLogoSrc(alias)))
  const logo = modelLogoSrc(alias)

  if (!logo || !canShowLogo) {
    return <span className={className}>{fallback}</span>
  }

  return (
    <span className={className}>
      <img src={logo} alt="" onError={() => setCanShowLogo(false)} />
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

function formatLanguageName(language) {
  const names = {
    bash: 'Bash',
    css: 'CSS',
    html: 'HTML',
    java: 'Java',
    javascript: 'JavaScript',
    js: 'JavaScript',
    json: 'JSON',
    jsx: 'JSX',
    markdown: 'Markdown',
    md: 'Markdown',
    powershell: 'PowerShell',
    ps1: 'PowerShell',
    python: 'Python',
    sql: 'SQL',
    text: 'Texte',
    ts: 'TypeScript',
    tsx: 'TSX',
    typescript: 'TypeScript',
    yaml: 'YAML',
    yml: 'YAML',
  }
  return names[language?.toLowerCase?.()] || language || 'Code'
}

function modelLogoSrc(alias) {
  const logos = {
    'secure-gpt': '/assets/openai-logo.png',
    'secure-groq': '/assets/groq-logo.png',
    'secure-gemini': '/assets/gemini-logo.png',
    'secure-mistral': '/assets/mistral-logo.png',
    'secure-claude': '/assets/claude-logo.png',
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
