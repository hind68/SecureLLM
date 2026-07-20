import { useCallback, useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeSanitize from 'rehype-sanitize'
import remarkGfm from 'remark-gfm'
import './App.css'

const API_BASE_URL = 'http://localhost:8080/api'
const SIDEBAR_STORAGE_KEY = 'secure-llm-sidebar-open'

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
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)
  const [isLoadingModels, setIsLoadingModels] = useState(true)
  const [isSending, setIsSending] = useState(false)
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => localStorage.getItem(SIDEBAR_STORAGE_KEY) !== 'false')
  const [activeView, setActiveView] = useState('chat')
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [collapsedPanel, setCollapsedPanel] = useState(null)
  const [openMenuId, setOpenMenuId] = useState(null)
  const [isHeaderMenuOpen, setIsHeaderMenuOpen] = useState(false)
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false)
  const [isModelMenuOpen, setIsModelMenuOpen] = useState(false)
  const [modelDecision, setModelDecision] = useState(null)
  const [isLastBlockVisible, setIsLastBlockVisible] = useState(true)
  const [isComposerMaxed, setIsComposerMaxed] = useState(false)

  const messagesRef = useRef(null)
  const bottomRef = useRef(null)
  const textareaRef = useRef(null)
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
    setActiveView('chat')
  }, [closeTransientMenus])

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
        setChatError('Impossible de charger les modeles.')
      }
    } finally {
      setIsLoadingModels(false)
    }
  }, [])

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
  }, [])

  async function openConversation(conversation) {
    if (isSending) return
    try {
      setChatError('')
      setActiveConversation(conversation)
      setSelectedModel(conversation.modelAlias)
      setIsLastBlockVisible(true)
      shouldAutoScrollRef.current = true
      const response = await fetch(`${API_BASE_URL}/conversations/${conversation.id}/messages`)
      if (!response.ok) throw new Error('messages')
      setMessages(await response.json())
      closeSidePanelOnMobile()
    } catch {
      setChatError('Impossible de reprendre cette conversation.')
    }
  }

  function newConversation(modelAlias = selectedModel) {
    if (isSending) return
    setActiveConversation(null)
    setMessages([])
    setDraft('')
    setChatError('')
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
      setChatError('Le message ne peut pas etre vide.')
      return
    }

    setChatError('')
    setIsSending(true)
    setDraft('')
    setIsLastBlockVisible(true)
    shouldAutoScrollRef.current = true

    try {
      const conversation = await ensureConversation(prompt)
      await streamMessage(conversation, prompt)
      await loadConversations()
    } catch {
      setChatError('La requete a echoue. Verifiez Spring Boot, LiteLLM et le provider.')
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
      setChatError('Impossible de renommer la conversation.')
    }
  }

  async function archiveConversation(conversation = activeConversation) {
    if (!conversation || isSending) return
    try {
      const response = await fetch(`${API_BASE_URL}/conversations/${conversation.id}`, { method: 'DELETE' })
      if (!response.ok) throw new Error('archive')
      if (activeConversation?.id === conversation.id) {
        setActiveConversation(null)
        setMessages([])
      }
      closeMenus()
      await loadConversations()
    } catch {
      setChatError('Impossible d archiver la conversation.')
    }
  }

  async function deleteConversation(conversation = activeConversation) {
    if (!conversation || isSending) return
    if (!window.confirm('Supprimer definitivement cette conversation ?')) return
    try {
      const response = await fetch(`${API_BASE_URL}/conversations/${conversation.id}/permanent`, { method: 'DELETE' })
      if (!response.ok) throw new Error('delete')
      if (activeConversation?.id === conversation.id) {
        setActiveConversation(null)
        setMessages([])
      }
      closeMenus()
      await loadConversations()
    } catch {
      setChatError('Impossible de supprimer la conversation.')
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
      if (!response.ok) throw new Error('change model')
      const updated = await response.json()
      setActiveConversation(updated)
      setSelectedModel(updated.modelAlias)
      setConversations((current) => current.map((item) => (item.id === updated.id ? updated : item)))
      setModelDecision(null)
    } catch {
      setChatError('Impossible de changer le modele.')
    }
  }

  async function openNewConversationWithModel(alias) {
    try {
      newConversation(alias)
      await createConversation(alias, 'Nouvelle conversation')
      setModelDecision(null)
    } catch {
      setChatError('Impossible de creer une nouvelle conversation.')
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

      <aside className="sidebar" aria-label="Navigation Synapse">
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
              <img className="sidebar-logo-default" src="/assets/brand.png" alt="" />
              <img className="sidebar-logo-hover" src="/assets/sidebar-hover.png" alt="" />
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
            <img src="/assets/new-tab.png" alt="" />
            <span>Nouvelle conversation</span>
          </button>
          <button
            className={isFilterOpen || collapsedPanel === 'search' ? 'active' : ''}
            type="button"
            title="Rechercher"
            aria-label="Rechercher"
            onClick={() => {
              if (isSidebarOpen) {
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
            <img src="/assets/search.png" alt="" />
            <span>Rechercher</span>
          </button>
          <button
            className={collapsedPanel === 'history' ? 'active' : ''}
            type="button"
            title="Discussions recentes"
            aria-label="Discussions recentes"
            onClick={() => {
              setShowArchived(false)
              if (isSidebarOpen) {
                setActiveView('chat')
                setCollapsedPanel(null)
                setIsFilterOpen(false)
                setOpenMenuId(null)
              } else {
                setIsFilterOpen(false)
                toggleCollapsedPanel('history')
              }
            }}
          >
            <img src="/assets/message.png" alt="" />
            <span>Discussions recentes</span>
          </button>
          <button
            className={isModelsView ? 'active' : ''}
            type="button"
            title="Explorer les modeles"
            aria-label="Explorer les modeles"
            onClick={() => {
              closeTransientMenus()
              setIsFilterOpen(false)
              setActiveView((current) => (current === 'models' ? 'chat' : 'models'))
            }}
          >
            <img src="/assets/compass.png" alt="" />
            <span>Explorer les modeles</span>
          </button>
        </nav>

        <section className="recent-section">
          <div className="history-heading">
            <span>{showArchived ? 'Archives' : 'Recents'}</span>
            {isSidebarOpen && (
              <button type="button" aria-label="Filtres" onClick={() => setIsFilterOpen((current) => !current)}>
                <img src="/assets/filter.png" alt="" />
              </button>
            )}
          </div>

          {isFilterOpen && (
            <div className="filters compact">
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher" />
              <select value={modelFilter} onChange={(event) => setModelFilter(event.target.value)}>
                <option value="">Tous les modeles</option>
                {models.map((model) => (
                  <option key={model.alias} value={model.alias}>{model.displayName}</option>
                ))}
              </select>
            </div>
          )}

          <HistoryList
            activeConversation={activeConversation}
            conversations={conversations}
            historyError={historyError}
            isLoadingHistory={isLoadingHistory}
            loadConversations={loadConversations}
            openConversation={openConversation}
            openMenuId={openMenuId}
            setOpenMenuId={setOpenMenuId}
            archiveConversation={archiveConversation}
            deleteConversation={deleteConversation}
            renameConversation={renameConversation}
          />
        </section>

        <div className="sidebar-user" data-menu-root>
          <button type="button" title="Compte" aria-label="Compte" onClick={() => setIsAccountMenuOpen((current) => !current)}>
            <span className="user-avatar">HA</span>
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
            {collapsedPanel === 'search' && (
              <button type="button" aria-label="Filtres" onClick={() => setIsFilterOpen((current) => !current)}>
                <img src="/assets/filter.png" alt="" />
              </button>
            )}
          </div>

          {collapsedPanel === 'search' && (
            <div className="filters compact">
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher" />
              <select value={modelFilter} onChange={(event) => setModelFilter(event.target.value)}>
                <option value="">Tous les modeles</option>
                {models.map((model) => (
                  <option key={model.alias} value={model.alias}>{model.displayName}</option>
                ))}
              </select>
            </div>
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
              <button className="model-button" type="button" onClick={() => setIsModelMenuOpen((current) => !current)} disabled={isSending || isLoadingModels}>
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
                onOpen={() => setIsHeaderMenuOpen((current) => !current)}
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
              <button type="button" aria-label="Fermer l explorateur" onClick={() => setActiveView('chat')}>
                <span aria-hidden="true">x</span>
              </button>
            </div>

            <div className="model-card-grid">
              {models.map((model) => {
                const meta = modelCardMeta(model.alias)
                return (
                  <article className="model-card" key={model.alias}>
                    <div className={`model-card-visual ${meta.tone}`} aria-hidden="true">
                      {meta.logo ? (
                        <img src={meta.logo} alt="" />
                      ) : (
                        <span>{meta.initials}</span>
                      )}
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
          {!hasActiveMessages && (
            <div className="welcome-stack">
              <div className="empty-state">
                <h2>Par quoi voulez-vous commencer ?</h2>
              </div>
              <form className={`composer composer-welcome ${isComposerMaxed ? 'composer-maxed' : ''}`} onSubmit={sendMessage}>
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
            </div>
          )}

          {messages.map((item) => (
            <MessageBubble key={item.id} message={item} fallbackModelName={activeModel?.displayName || modelDisplayName(activeModelAlias)} />
          ))}
          <div ref={bottomRef} className="bottom-anchor" />
        </section>

        {!isLastBlockVisible && hasActiveMessages && (
          <button className="go-bottom-button" type="button" onClick={goToBottom}>
            <DownArrowIcon />
          </button>
        )}

        {hasActiveMessages && (
          <form className={`composer composer-bottom ${isComposerMaxed ? 'composer-maxed' : ''}`} onSubmit={sendMessage}>
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
        )}

        {chatError && (
          <div className="inline-error" role="alert">
            {chatError}
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
  return (
    <div className="conversation-menu" data-menu-root>
      <button
        className="icon-button"
        type="button"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={`${id}-menu`}
        onClick={onOpen}
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
              onOpen={() => setOpenMenuId((current) => (current === conversation.id ? null : conversation.id))}
              onRename={() => renameConversation(conversation)}
            />
          </div>
        ))}
      </div>
    </>
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

function MessageBubble({ message, fallbackModelName }) {
  const isUser = message.role === 'USER'
  const modelName = cleanModelName(message.modelDisplayName || fallbackModelName, message.modelAlias)
  return (
    <article className={`message ${isUser ? 'user' : 'assistant'}`}>
      <div className="bubble">
        {!isUser && (
          <div className="message-label">
            {modelName}{message.status === 'ECHEC' ? ' - echec' : ''}
          </div>
        )}
        {isUser ? (
          <p>{message.content}</p>
        ) : (
          <MarkdownContent content={message.content || (message.status === 'EN_COURS' ? '...' : '')} />
        )}
      </div>
    </article>
  )
}

function MarkdownContent({ content }) {
  return (
    <div className="markdown-body">
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
        {content}
      </ReactMarkdown>
    </div>
  )
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
    .replace(/\bGrok\b/g, 'Groq')
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
      logo: '/assets/openai-logo.png',
      tone: 'tone-openai',
      description: 'Modele generaliste adapte aux reponses concises, au raisonnement et aux usages quotidiens.',
    },
    'secure-groq': {
      initials: 'GQ',
      logo: '/assets/grok-logo.png',
      tone: 'tone-groq',
      description: 'Modele rapide pour tester les conversations et obtenir des reponses reactives.',
    },
    'secure-gemini': {
      initials: 'GM',
      logo: '/assets/gemini-logo.png',
      tone: 'tone-gemini',
      description: 'Modele polyvalent pour explorer, reformuler et structurer des idees.',
    },
    'secure-mistral': {
      initials: 'MS',
      logo: '/assets/mistral-logo.png',
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
