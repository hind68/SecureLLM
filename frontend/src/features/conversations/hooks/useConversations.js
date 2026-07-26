import { useCallback, useEffect, useRef, useState } from 'react'
import {
  archiveConversationRequest,
  changeConversationModelRequest,
  createConversationRequest,
  deleteConversationRequest,
  fetchConversationMessages,
  fetchConversations,
  renameConversationRequest,
  restoreConversationRequest,
} from '../../../api/conversationsApi'
import { friendlyGenerationError, logDevelopmentError, requestErrorMessage } from '../../../utils/errors'
import { displayConversationTitle, titleFrom } from '../../../utils/modelMetadata'
import { clearActiveConversationId, saveActiveConversationId, saveLastModel } from '../../../utils/storage'
import useActiveConversationRestore from './useActiveConversationRestore'
import useConversationStatus from './useConversationStatus'

/**
 * Owns conversation history, active conversation persistence, conversation CRUD,
 * model switching decisions and the UI-only status map used by the sidebar.
 *
 * @param {object} params
 * @param {Function} params.getChatState Chat UI getter. Conversation actions
 * read it at call time because chat state owns message cache, draft,
 * composer refs and SSE streaming, while this hook owns conversation creation.
 * @param {Function} params.getModelState Model getter containing the selected
 * model and its setter from `useModels`.
 * @param {object} params.navigation Sidebar/menu callbacks from `useAppMenus`.
 * @param {{ showError: Function, showNotice: Function, clearChatError: Function }} params.feedback Global feedback callbacks.
 * @returns {object} Grouped conversation state, editing state, dialogs, actions
 * and UI status helpers.
 */
export default function useConversations({
  getChatState,
  getModelState,
  navigation,
  feedback,
}) {
  const [modelFilter, setModelFilter] = useState('')
  const [search, setSearch] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [conversations, setConversations] = useState([])
  const [activeConversation, setActiveConversation] = useState(null)
  const [historyError, setHistoryError] = useState('')
  const [hasLoadedHistory, setHasLoadedHistory] = useState(false)
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)
  const [modelDecision, setModelDecision] = useState(null)
  const [pendingDeleteConversation, setPendingDeleteConversation] = useState(null)
  const [editingConversationId, setEditingConversationId] = useState(null)
  const [editingTitle, setEditingTitle] = useState('')

  const activeConversationRestoreRef = useRef(false)
  const activeConversationIdRef = useRef(null)

  const {
    conversationUiStatus,
    conversationUiStatusRef,
    generatingConversationId,
    isGenerating,
    markConversationRead,
    setConversationUiStatus,
  } = useConversationStatus({ setConversations })

  const closeMenus = useCallback(() => {
    navigation.closeTransientMenus()
  }, [navigation])

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
  }, [conversationUiStatusRef, modelFilter, search, showArchived])

  useEffect(() => {
    // The history list is synchronized with the server whenever filters change.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadConversations()
  }, [loadConversations])

  useEffect(() => {
    activeConversationIdRef.current = activeConversation?.id || null
  }, [activeConversation?.id])

  const openConversation = useCallback(async (conversation) => {
    const chat = getChatState()
    const model = getModelState()
    try {
      feedback.clearChatError()
      navigation.closeTransientMenus()
      setActiveConversation(conversation)
      markConversationRead(conversation.id)
      model.setSelectedModel(conversation.modelAlias)
      saveLastModel(conversation.modelAlias)
      saveActiveConversationId(conversation.id)
      navigation.setActiveView('chat')
      chat.setIsLastBlockVisible(true)
      chat.shouldAutoScrollRef.current = true
      // Messages are cached per conversation so switching threads does not
      // refetch history unless the cache is cold.
      const cachedMessages = chat.messageCacheRef.current.get(conversation.id)
      if (cachedMessages) {
        chat.setMessages(cachedMessages)
        navigation.closeSidePanelOnMobile()
        return
      }
      const nextMessages = await fetchConversationMessages(conversation.id)
      chat.messageCacheRef.current.set(conversation.id, nextMessages)
      chat.setMessages(nextMessages)
      navigation.closeSidePanelOnMobile()
    } catch {
      feedback.showError('Impossible de reprendre cette conversation.')
    }
  }, [feedback, getChatState, getModelState, markConversationRead, navigation])

  useActiveConversationRestore({
    conversations,
    hasLoadedHistory,
    modelFilter,
    openConversation,
    restoreRef: activeConversationRestoreRef,
    search,
    showArchived,
  })

  const newConversation = useCallback((modelAlias = getModelState().selectedModel) => {
    const chat = getChatState()
    const model = getModelState()
    setActiveConversation(null)
    chat.setMessages([])
    chat.setDraft('')
    feedback.clearChatError()
    clearActiveConversationId()
    navigation.closeTransientMenus()
    model.setSelectedModel(modelAlias)
    saveLastModel(modelAlias)
    chat.setIsLastBlockVisible(true)
    chat.shouldAutoScrollRef.current = true
    navigation.closeSidePanelOnMobile()
  }, [feedback, getChatState, getModelState, navigation])

  const createConversation = useCallback(async (modelAlias, title) => {
    const model = getModelState()
    const conversation = { ...(await createConversationRequest(modelAlias, title)), uiStatus: 'idle' }
    setActiveConversation(conversation)
    markConversationRead(conversation.id)
    model.setSelectedModel(conversation.modelAlias)
    saveLastModel(conversation.modelAlias)
    saveActiveConversationId(conversation.id)
    setConversations((current) => [conversation, ...current.filter((item) => item.id !== conversation.id)])
    return conversation
  }, [getModelState, markConversationRead])

  const ensureConversation = useCallback(async (prompt) => {
    if (activeConversation) return activeConversation
    // A conversation is created only on first send, which keeps an empty draft
    // from creating server history.
    return createConversation(getModelState().selectedModel, titleFrom(prompt))
  }, [activeConversation, createConversation, getModelState])

  const sendMessage = useCallback(async (event) => {
    event.preventDefault()
    const chat = getChatState()
    if (isGenerating) {
      chat.stopGeneration()
      return
    }
    const prompt = chat.draft.trim()
    if (!prompt) {
      feedback.showError('Le message ne peut pas etre vide.')
      return
    }

    feedback.clearChatError()
    if (!chat.hasActiveMessages && chat.composerRef.current) {
      chat.composerBeforeRectRef.current = chat.composerRef.current.getBoundingClientRect()
    }
    chat.setDraft('')
    chat.setIsLastBlockVisible(true)
    chat.shouldAutoScrollRef.current = true

    try {
      const conversation = await ensureConversation(prompt)
      void chat.streamMessage(conversation, prompt)
    } catch (error) {
      feedback.showError(friendlyGenerationError(error))
    }
  }, [ensureConversation, feedback, getChatState, isGenerating])

  const renameConversation = useCallback((conversation = activeConversation) => {
    if (!conversation || isGenerating) return
    setEditingConversationId(conversation.id)
    setEditingTitle(displayConversationTitle(conversation.title))
    closeMenus()
  }, [activeConversation, closeMenus, isGenerating])

  const saveInlineRename = useCallback(async (conversation) => {
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
      feedback.showError('Impossible de renommer la conversation.')
    }
  }, [closeMenus, editingTitle, feedback, isGenerating])

  const archiveConversation = useCallback(async (conversation = activeConversation) => {
    const chat = getChatState()
    if (!conversation || isGenerating) return
    try {
      await archiveConversationRequest(conversation.id)
      setConversations((current) => current.filter((item) => item.id !== conversation.id))
      if (activeConversation?.id === conversation.id) {
        setActiveConversation(null)
        chat.setMessages([])
      }
      clearActiveConversationId(conversation.id)
      closeMenus()
      await loadConversations()
    } catch {
      feedback.showError('Impossible d archiver la conversation.')
    }
  }, [activeConversation, closeMenus, feedback, getChatState, isGenerating, loadConversations])

  const restoreConversation = useCallback(async (conversation) => {
    const model = getModelState()
    if (!conversation || isGenerating) return
    try {
      const updated = await restoreConversationRequest(conversation.id)
      setConversations((current) => current.filter((item) => item.id !== updated.id))
      if (activeConversation?.id === updated.id) {
        setActiveConversation(updated)
        model.setSelectedModel(updated.modelAlias)
        saveLastModel(updated.modelAlias)
        saveActiveConversationId(updated.id)
      }
      closeMenus()
      feedback.showNotice('Conversation desarchivee.')
      await loadConversations()
    } catch (error) {
      feedback.showError(requestErrorMessage(error, 'Impossible de desarchiver la conversation.'))
    }
  }, [activeConversation, closeMenus, feedback, getModelState, isGenerating, loadConversations])

  const deleteConversation = useCallback(async (conversation = activeConversation) => {
    if (!conversation || isGenerating) return
    if (!conversation.id) {
      feedback.showError('Impossible de supprimer cette conversation: identifiant manquant.')
      logDevelopmentError('delete conversation missing id', conversation)
      return
    }
    setPendingDeleteConversation(conversation)
    closeMenus()
  }, [activeConversation, closeMenus, feedback, isGenerating])

  const confirmDeleteConversation = useCallback(async () => {
    const chat = getChatState()
    const conversation = pendingDeleteConversation
    if (!conversation || isGenerating) return
    try {
      await deleteConversationRequest(conversation.id)
      setConversations((current) => current.filter((item) => item.id !== conversation.id))
      if (activeConversation?.id === conversation.id) {
        setActiveConversation(null)
        chat.setMessages([])
      }
      clearActiveConversationId(conversation.id)
      closeMenus()
      setPendingDeleteConversation(null)
      feedback.showNotice('Conversation supprimee.')
      await loadConversations()
    } catch (error) {
      feedback.showError(requestErrorMessage(error, 'Impossible de supprimer la conversation.'))
    }
  }, [activeConversation, closeMenus, feedback, getChatState, isGenerating, loadConversations, pendingDeleteConversation])

  const selectModel = useCallback(async (alias) => {
    const chat = getChatState()
    const model = getModelState()
    navigation.setIsModelMenuOpen(false)
    if (isGenerating) return
    if (!activeConversation) {
      model.setSelectedModel(alias)
      saveLastModel(alias)
      return
    }
    if (activeConversation.modelAlias === alias) return
    if (chat.messages.length === 0) {
      model.setSelectedModel(alias)
      saveLastModel(alias)
      setActiveConversation((current) => (current ? { ...current, modelAlias: alias } : current))
      return
    }
    // Existing messages make model switching ambiguous, so the existing dialog
    // asks whether to continue this thread or start a new one.
    setModelDecision({ alias })
  }, [activeConversation, getChatState, getModelState, isGenerating, navigation])

  const continueWithModel = useCallback(async (alias) => {
    const model = getModelState()
    if (!activeConversation) return
    try {
      const updated = await changeConversationModelRequest(activeConversation.id, alias)
      setActiveConversation(updated)
      model.setSelectedModel(updated.modelAlias)
      saveLastModel(updated.modelAlias)
      saveActiveConversationId(updated.id)
      setConversations((current) => current.map((item) => (item.id === updated.id ? updated : item)))
      setModelDecision(null)
    } catch (error) {
      feedback.showError(requestErrorMessage(error, 'Impossible de changer le modele.'))
    }
  }, [activeConversation, feedback, getModelState])

  const openNewConversationWithModel = useCallback(async (alias) => {
    newConversation(alias)
    setModelDecision(null)
  }, [newConversation])

  return {
    state: {
      activeConversation,
      conversations,
      hasLoadedHistory,
      historyError,
      isLoadingHistory,
      modelFilter,
      search,
      showArchived,
    },
    filters: {
      setModelFilter,
      setSearch,
      setShowArchived,
    },
    editing: {
      editingConversationId,
      editingTitle,
      setEditingConversationId,
      setEditingTitle,
    },
    dialogs: {
      modelDecision,
      pendingDeleteConversation,
      setModelDecision,
      setPendingDeleteConversation,
    },
    actions: {
      archiveConversation,
      confirmDeleteConversation,
      continueWithModel,
      deleteConversation,
      ensureConversation,
      loadConversations,
      newConversation,
      openConversation,
      openNewConversationWithModel,
      renameConversation,
      restoreConversation,
      saveInlineRename,
      selectModel,
      sendMessage,
    },
    status: {
      activeConversationIdRef,
      conversationUiStatus,
      generatingConversationId,
      isGenerating,
      markConversationRead,
      setConversationUiStatus,
    },
  }
}
