import { useCallback, useEffect, useRef, useState } from 'react'
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
import AppLayout from './features/layout/AppLayout'
import useAppMenus from './features/layout/hooks/useAppMenus'
import useChatUi from './features/chat/hooks/useChatUi'
import useModels from './features/models/hooks/useModels'
import { friendlyGenerationError, logDevelopmentError, requestErrorMessage } from './utils/errors'
import { displayConversationTitle, titleFrom } from './utils/modelMetadata'
import { ACTIVE_CONVERSATION_STORAGE_KEY, clearActiveConversationId, saveActiveConversationId, saveLastModel } from './utils/storage'

function App() {
  const [modelFilter, setModelFilter] = useState('')
  const [search, setSearch] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [conversations, setConversations] = useState([])
  const [activeConversation, setActiveConversation] = useState(null)
  const [historyError, setHistoryError] = useState('')
  const [chatError, setChatError] = useState('')
  const [chatNotice, setChatNotice] = useState('')
  const [showTabs, setShowTabs] = useState(false)
  const [hasLoadedHistory, setHasLoadedHistory] = useState(false)
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)
  const [conversationUiStatus, setConversationUiStatusState] = useState({})
  const [modelDecision, setModelDecision] = useState(null)
  const [pendingDeleteConversation, setPendingDeleteConversation] = useState(null)
  const [editingConversationId, setEditingConversationId] = useState(null)
  const [editingTitle, setEditingTitle] = useState('')

  const activeConversationRestoreRef = useRef(false)
  const activeConversationIdRef = useRef(null)
  const conversationUiStatusRef = useRef({})

  const generatingConversationId = Object.entries(conversationUiStatus).find(([, status]) => status === 'generating')?.[0] || null
  const isGenerating = Boolean(generatingConversationId)

  const showError = useCallback((message) => {
    setChatNotice('')
    setChatError(message)
  }, [])

  const showNotice = useCallback((message) => {
    setChatError('')
    setChatNotice(message)
  }, [])

  const clearChatError = useCallback(() => {
    setChatError('')
  }, [])

  const {
    activeModel,
    activeModelAlias,
    isLoadingModels,
    modelDisplayName,
    models,
    selectedModel,
    setSelectedModel,
  } = useModels({
    activeConversation,
    onError: showError,
    onLoaded: clearChatError,
  })

  const {
    closeSidePanelOnMobile,
    closeSidebarPanels,
    closeTransientMenus,
    collapsedPanel,
    isAccountMenuOpen,
    isHeaderMenuOpen,
    isModelMenuOpen,
    isModelsView,
    isSearchModalOpen,
    isSidebarOpen,
    openMenuId,
    searchInputRef,
    setActiveView,
    setCollapsedPanel,
    setIsAccountMenuOpen,
    setIsHeaderMenuOpen,
    setIsModelMenuOpen,
    setIsSearchModalOpen,
    setIsSidebarOpen,
    setOpenMenuId,
    toggleCollapsedPanel,
    toggleSidebar,
  } = useAppMenus({
    onEscape: () => {
      setModelDecision(null)
      setChatError('')
      setChatNotice('')
    },
  })

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
    bottomRef,
    canSend,
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
    setIsLastBlockVisible,
    setMessages,
    shouldAutoScrollRef,
    stopGeneration,
    streamMessage,
    textareaRef,
  } = useChatUi({
    activeConversationIdRef,
    loadConversations: () => loadConversations(),
    activeModelAlias,
    isGenerating,
    modelDisplayName,
    setConversationUiStatus,
    showError,
  })

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
    loadConversations()
  }, [loadConversations])

  useEffect(() => {
    if (!chatError && !chatNotice) return undefined
    const timeout = window.setTimeout(() => {
      setChatError('')
      setChatNotice('')
    }, 5000)
    return () => window.clearTimeout(timeout)
  }, [chatError, chatNotice])

  useEffect(() => {
    activeConversationIdRef.current = activeConversation?.id || null
  }, [activeConversation?.id])

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
  }, [closeSidePanelOnMobile, closeTransientMenus, markConversationRead, messageCacheRef, setActiveView, setIsLastBlockVisible, setMessages, setSelectedModel, shouldAutoScrollRef, showError])

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
      const updated = await restoreConversationRequest(conversation.id)
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
      await deleteConversationRequest(conversation.id)
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
      const updated = await changeConversationModelRequest(activeConversation.id, alias)
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


  function closeMenus() {
    closeTransientMenus()
  }

  return (
    <AppLayout
      activeConversation={activeConversation}
      activeModel={activeModel}
      activeModelAlias={activeModelAlias}
      archiveConversation={archiveConversation}
      bottomRef={bottomRef}
      canSend={canSend}
      chatError={chatError}
      chatNotice={chatNotice}
      closeSidebarPanels={closeSidebarPanels}
      closeTransientMenus={closeTransientMenus}
      collapsedPanel={collapsedPanel}
      composerRef={composerRef}
      confirmDeleteConversation={confirmDeleteConversation}
      conversations={conversations}
      copiedKey={copiedKey}
      deleteConversation={deleteConversation}
      draft={draft}
      editingConversationId={editingConversationId}
      editingTitle={editingTitle}
      goToBottom={goToBottom}
      handleKeyDown={handleKeyDown}
      hasActiveMessages={hasActiveMessages}
      historyError={historyError}
      isAccountMenuOpen={isAccountMenuOpen}
      isComposerMaxed={isComposerMaxed}
      isComposerTransitioning={isComposerTransitioning}
      isGenerating={isGenerating}
      isHeaderMenuOpen={isHeaderMenuOpen}
      isLastBlockVisible={isLastBlockVisible}
      isLoadingHistory={isLoadingHistory}
      isLoadingModels={isLoadingModels}
      isModelMenuOpen={isModelMenuOpen}
      isModelsView={isModelsView}
      isSearchModalOpen={isSearchModalOpen}
      isSidebarOpen={isSidebarOpen}
      loadConversations={loadConversations}
      messages={messages}
      messagesRef={messagesRef}
      modelDecision={modelDecision}
      modelDisplayName={modelDisplayName}
      modelFilter={modelFilter}
      models={models}
      newConversation={newConversation}
      onClearToast={() => {
        setChatError('')
        setChatNotice('')
      }}
      onCopy={onCopy}
      onMessagesScroll={onMessagesScroll}
      openConversation={openConversation}
      openMenuId={openMenuId}
      openNewConversationWithModel={openNewConversationWithModel}
      pendingDeleteConversation={pendingDeleteConversation}
      renameConversation={renameConversation}
      restoreConversation={restoreConversation}
      saveInlineRename={saveInlineRename}
      search={search}
      searchInputRef={searchInputRef}
      selectModel={selectModel}
      sendMessage={sendMessage}
      setActiveView={setActiveView}
      setCollapsedPanel={setCollapsedPanel}
      setCopiedKey={setCopiedKey}
      setDraft={setDraft}
      setEditingConversationId={setEditingConversationId}
      setEditingTitle={setEditingTitle}
      setIsAccountMenuOpen={setIsAccountMenuOpen}
      setIsHeaderMenuOpen={setIsHeaderMenuOpen}
      setIsModelMenuOpen={setIsModelMenuOpen}
      setIsSearchModalOpen={setIsSearchModalOpen}
      setIsSidebarOpen={setIsSidebarOpen}
      setModelDecision={setModelDecision}
      setModelFilter={setModelFilter}
      setOpenMenuId={setOpenMenuId}
      setPendingDeleteConversation={setPendingDeleteConversation}
      setSearch={setSearch}
      setShowArchived={setShowArchived}
      setShowTabs={setShowTabs}
      showArchived={showArchived}
      showTabs={showTabs}
      stopGeneration={stopGeneration}
      textareaRef={textareaRef}
      toggleCollapsedPanel={toggleCollapsedPanel}
      toggleSidebar={toggleSidebar}
      continueWithModel={continueWithModel}
    />
  )
}

export default App
