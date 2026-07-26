import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  archiveConversationRequest,
  changeConversationModelRequest,
  createConversationRequest,
  deleteConversationRequest,
  fetchConversation,
  fetchConversationMessages,
  fetchConversations,
  renameConversationRequest,
  restoreConversationRequest,
} from './api/conversationsApi'
import { fetchModelAliases, fetchModelDetails } from './api/modelsApi'
import ChatComposer from './components/chat/ChatComposer'
import ChatThread from './components/chat/ChatThread'
import ConfirmDialog from './components/common/ConfirmDialog'
import Toast from './components/common/Toast'
import ConversationMenu from './components/sidebar/ConversationMenu'
import SearchModal from './components/sidebar/SearchModal'
import Sidebar from './components/sidebar/Sidebar'
import ModelGallery from './components/models/ModelGallery'
import ModelSelector from './components/models/ModelSelector'
import useAutoScroll from './hooks/useAutoScroll'
import useMessageStream from './hooks/useMessageStream'
import { deletionErrorMessage, friendlyGenerationError, logDevelopmentError, requestErrorMessage, requestStatusMessage } from './utils/errors'
import { cleanModelName, displayConversationTitle, selectAvailableModel, titleFrom } from './utils/modelMetadata'
import { ACTIVE_CONVERSATION_STORAGE_KEY, LAST_MODEL_STORAGE_KEY, SIDEBAR_STORAGE_KEY, clearActiveConversationId, saveActiveConversationId, saveLastModel } from './utils/storage'
import './App.css'

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
  const [showTabs, setShowTabs] = useState(false)
  const [hasLoadedHistory, setHasLoadedHistory] = useState(false)
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)
  const [isLoadingModels, setIsLoadingModels] = useState(true)
  const [conversationUiStatus, setConversationUiStatusState] = useState({})
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => localStorage.getItem(SIDEBAR_STORAGE_KEY) !== 'false')
  const [activeView, setActiveView] = useState('chat')
  const [collapsedPanel, setCollapsedPanel] = useState(null)
  const [openMenuId, setOpenMenuId] = useState(null)
  const [isHeaderMenuOpen, setIsHeaderMenuOpen] = useState(false)
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false)
  const [isModelMenuOpen, setIsModelMenuOpen] = useState(false)
  const [modelDecision, setModelDecision] = useState(null)
  const [pendingDeleteConversation, setPendingDeleteConversation] = useState(null)
  const [editingConversationId, setEditingConversationId] = useState(null)
  const [editingTitle, setEditingTitle] = useState('')
  const [isComposerMaxed, setIsComposerMaxed] = useState(false)
  const [isComposerTransitioning, setIsComposerTransitioning] = useState(false)

  const textareaRef = useRef(null)
  const searchInputRef = useRef(null)
  const composerRef = useRef(null)
  const composerBeforeRectRef = useRef(null)
  const composerTimerRef = useRef(null)
  const activeConversationRestoreRef = useRef(false)
  const activeConversationIdRef = useRef(null)
  const conversationUiStatusRef = useRef({})

  const activeModelAlias = activeConversation?.modelAlias || selectedModel
  const activeModel = models.find((model) => model.alias === activeModelAlias)
  const generatingConversationId = Object.entries(conversationUiStatus).find(([, status]) => status === 'generating')?.[0] || null
  const isGenerating = Boolean(generatingConversationId)
  const canSend = Boolean(activeModelAlias && draft.trim() && !isGenerating)
  const hasActiveMessages = messages.length > 0
  const isModelsView = activeView === 'models'
  const {
    bottomRef,
    goToBottom,
    isLastBlockVisible,
    messagesRef,
    onMessagesScroll,
    setIsLastBlockVisible,
    shouldAutoScrollRef,
  } = useAutoScroll(messages)

  const resizeTextarea = useCallback(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.style.height = 'auto'
    const nextHeight = Math.min(textarea.scrollHeight, 150)
    textarea.style.height = `${nextHeight}px`
    setIsComposerMaxed(textarea.scrollHeight > 150)
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

  const setConversationUiStatus = useCallback((conversationId, status) => {
    if (!conversationId) return
    const key = String(conversationId)
    // UI-only statuses survive list refreshes so background completions can stay marked unread.
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
  }, [])

  const markConversationRead = useCallback((conversationId) => {
    setConversationUiStatus(conversationId, 'idle')
  }, [setConversationUiStatus])

  const {
    messageCacheRef,
    stopGeneration,
    streamMessage,
  } = useMessageStream({
    activeConversationIdRef,
    loadConversations: () => loadConversations(),
    modelDisplayName,
    setConversationUiStatus,
    setMessages,
    showError,
  })

  const loadModels = useCallback(async () => {
    setIsLoadingModels(true)
    try {
      const data = await fetchModelDetails()
      const normalized = Array.isArray(data)
        ? data.map((item) => ({ alias: item.alias, displayName: cleanModelName(item.displayName || item.alias, item.alias) }))
        : []
      setModels(normalized)
      setSelectedModel((current) => selectAvailableModel(normalized, current))
      setChatError('')
    } catch {
      try {
        const aliases = await fetchModelAliases()
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
      const data = await fetchConversations({ modelFilter, search, showArchived })
      const rawContent = Array.isArray(data) ? data : Array.isArray(data.content) ? data.content : []
      const content = rawContent.map((conversation) => ({
        ...conversation,
        uiStatus: conversationUiStatusRef.current[String(conversation.id)] || 'idle',
      }))
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
    if (composerTimerRef.current) {
      window.clearTimeout(composerTimerRef.current)
    }
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
      // Message history is cached per conversation to avoid refetching when users jump between threads.
      const cachedMessages = messageCacheRef.current.get(conversation.id)
      if (cachedMessages) {
        setMessages(cachedMessages)
        closeSidePanelOnMobile()
        return
      }
      const nextMessages = await fetchConversationMessages(conversation.id)
      messageCacheRef.current.set(conversation.id, nextMessages)
      setMessages(nextMessages)
      closeSidePanelOnMobile()
    } catch {
      showError('Impossible de reprendre cette conversation.')
    }
  }, [closeSidePanelOnMobile, closeTransientMenus, markConversationRead, messageCacheRef, setIsLastBlockVisible, shouldAutoScrollRef, showError])

  useEffect(() => {
    if (activeConversationRestoreRef.current || !hasLoadedHistory || showArchived || search.trim() || modelFilter) return

    async function restoreActiveConversation() {
      const savedId = localStorage.getItem(ACTIVE_CONVERSATION_STORAGE_KEY)
      activeConversationRestoreRef.current = true
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
    const conversation = { ...(await createConversationRequest(modelAlias, title)), uiStatus: 'idle' }
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

  function renameConversation(conversation = activeConversation) {
    if (!conversation || isGenerating) return
    setEditingConversationId(conversation.id)
    setEditingTitle(displayConversationTitle(conversation.title))
    closeMenus()
  }

  async function saveInlineRename(conversation) {
    const title = editingTitle.trim()
    if (!conversation || isGenerating) return
    if (!title || title === displayConversationTitle(conversation.title)) {
      setEditingConversationId(null)
      setEditingTitle('')
      return
    }

    try {
      const updated = await renameConversationRequest(conversation.id, title)
      setActiveConversation((current) => (current?.id === updated.id ? { ...updated, uiStatus: current.uiStatus } : current))
      setConversations((current) => current.map((item) => (item.id === updated.id ? { ...updated, uiStatus: item.uiStatus } : item)))
      setEditingConversationId(null)
      setEditingTitle('')
      closeMenus()
    } catch {
      showError('Impossible de renommer la conversation.')
    }
  }

  async function archiveConversation(conversation = activeConversation) {
    if (!conversation || isGenerating) return
    try {
      await archiveConversationRequest(conversation.id)
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
      const response = await restoreConversationRequest(conversation.id)
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
    try {
      const response = await deleteConversationRequest(conversation.id)
      if (!response.ok) {
        const message = await deletionErrorMessage(response)
        logDevelopmentError('delete conversation failed', {
          id: conversation.id,
          method: 'DELETE',
          status: response.status,
          url: `/conversations/${conversation.id}/permanent`,
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
    if (messages.length === 0) {
      setSelectedModel(alias)
      saveLastModel(alias)
      setActiveConversation((current) => (current ? { ...current, modelAlias: alias } : current))
      return
    }
    setModelDecision({ alias })
  }

  async function continueWithModel(alias) {
    if (!activeConversation) return
    try {
      const response = await changeConversationModelRequest(activeConversation.id, alias)
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
    newConversation(alias)
    setModelDecision(null)
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


  return (
    <div className={`app-shell ${isSidebarOpen ? 'sidebar-open' : 'sidebar-closed'}`}>
      <Sidebar
        activeConversation={activeConversation}
        archiveConversation={archiveConversation}
        closeSidebarPanels={closeSidebarPanels}
        closeTransientMenus={closeTransientMenus}
        collapsedPanel={collapsedPanel}
        conversations={conversations}
        deleteConversation={deleteConversation}
        editingConversationId={editingConversationId}
        editingTitle={editingTitle}
        historyError={historyError}
        isAccountMenuOpen={isAccountMenuOpen}
        isLoadingHistory={isLoadingHistory}
        isModelsView={isModelsView}
        isSearchModalOpen={isSearchModalOpen}
        isSidebarOpen={isSidebarOpen}
        loadConversations={loadConversations}
        newConversation={newConversation}
        openConversation={openConversation}
        openMenuId={openMenuId}
        renameConversation={renameConversation}
        restoreConversation={restoreConversation}
        saveInlineRename={saveInlineRename}
        setActiveView={setActiveView}
        setCollapsedPanel={setCollapsedPanel}
        setEditingConversationId={setEditingConversationId}
        setEditingTitle={setEditingTitle}
        setIsAccountMenuOpen={setIsAccountMenuOpen}
        setIsSearchModalOpen={setIsSearchModalOpen}
        setIsSidebarOpen={setIsSidebarOpen}
        setModelFilter={setModelFilter}
        setOpenMenuId={setOpenMenuId}
        setSearch={setSearch}
        setShowArchived={setShowArchived}
        setShowTabs={setShowTabs}
        showArchived={showArchived}
        showTabs={showTabs}
        toggleCollapsedPanel={toggleCollapsedPanel}
        toggleSidebar={toggleSidebar}
      />

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
            <ModelSelector
              activeModel={activeModel}
              disabled={isGenerating || isLoadingModels}
              isOpen={isModelMenuOpen}
              models={models}
              onSelect={selectModel}
              onToggle={() => {
                setIsAccountMenuOpen(false)
                setIsModelMenuOpen((current) => !current)
              }}
            />

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
          <ModelGallery
            disabled={isGenerating}
            models={models}
            onClose={() => setActiveView('chat')}
            onSelect={selectModel}
          />
        )}

        <ChatThread
          activeModelAlias={activeModelAlias}
          activeModelName={activeModel?.displayName || modelDisplayName(activeModelAlias)}
          bottomRef={bottomRef}
          copiedKey={copiedKey}
          goToBottom={goToBottom}
          hasActiveMessages={hasActiveMessages}
          isComposerTransitioning={isComposerTransitioning}
          isLastBlockVisible={isLastBlockVisible}
          messages={messages}
          messagesRef={messagesRef}
          onCopy={async (text) => {
            const success = await copyToClipboard(text)
            if (!success) showError('Impossible de copier le contenu.')
            return success
          }}
          onMessagesScroll={onMessagesScroll}
          setCopiedKey={setCopiedKey}
        />

        <ChatComposer
          canSend={canSend}
          composerRef={composerRef}
          draft={draft}
          hasActiveMessages={hasActiveMessages}
          isComposerMaxed={isComposerMaxed}
          isGenerating={isGenerating}
          onDraftChange={setDraft}
          onKeyDown={handleKeyDown}
          onStop={stopGeneration}
          onSubmit={sendMessage}
          textareaRef={textareaRef}
        />

        <Toast
          chatError={chatError}
          chatNotice={chatNotice}
          onClose={() => {
            setChatError('')
            setChatNotice('')
          }}
        />
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
        <ConfirmDialog
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

export default App
