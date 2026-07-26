import { useCallback, useEffect, useState } from 'react'
import useConversations from './features/conversations/hooks/useConversations'
import AppLayout from './features/layout/AppLayout'
import useAppMenus from './features/layout/hooks/useAppMenus'
import useChatUi from './features/chat/hooks/useChatUi'
import useModels from './features/models/hooks/useModels'

function App() {
  const [chatError, setChatError] = useState('')
  const [chatNotice, setChatNotice] = useState('')
  const [showTabs, setShowTabs] = useState(false)

  let currentChat = {}
  let currentModel = {}
  let currentDialogs = {}

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

  const clearFeedback = useCallback(() => {
    setChatError('')
    setChatNotice('')
  }, [])

  const menus = useAppMenus({
    onEscape: () => {
      currentDialogs.setModelDecision?.(null)
      clearFeedback()
    },
  })

  const conversations = useConversations({
    getChatState: () => currentChat,
    getModelState: () => currentModel,
    navigation: {
      closeSidePanelOnMobile: menus.closeSidePanelOnMobile,
      closeTransientMenus: menus.closeTransientMenus,
      setActiveView: menus.setActiveView,
      setIsModelMenuOpen: menus.setIsModelMenuOpen,
    },
    feedback: {
      clearChatError,
      showError,
      showNotice,
    },
  })

  currentDialogs = conversations.dialogs

  const models = useModels({
    activeConversation: conversations.state.activeConversation,
    onError: showError,
    onLoaded: clearChatError,
  })

  currentModel = {
    selectedModel: models.selectedModel,
    setSelectedModel: models.setSelectedModel,
  }

  const chat = useChatUi({
    activeConversationIdRef: conversations.status.activeConversationIdRef,
    activeModelAlias: models.activeModelAlias,
    isGenerating: conversations.status.isGenerating,
    loadConversations: conversations.actions.loadConversations,
    modelDisplayName: models.modelDisplayName,
    setConversationUiStatus: conversations.status.setConversationUiStatus,
    showError,
  })

  currentChat = chat

  useEffect(() => {
    if (!chatError && !chatNotice) return undefined
    const timeout = window.setTimeout(clearFeedback, 5000)
    return () => window.clearTimeout(timeout)
  }, [chatError, chatNotice, clearFeedback])

  return (
    <AppLayout
      layout={{
        closeSidebarPanels: menus.closeSidebarPanels,
        closeTransientMenus: menus.closeTransientMenus,
        collapsedPanel: menus.collapsedPanel,
        isAccountMenuOpen: menus.isAccountMenuOpen,
        isHeaderMenuOpen: menus.isHeaderMenuOpen,
        isModelMenuOpen: menus.isModelMenuOpen,
        isModelsView: menus.isModelsView,
        isSearchModalOpen: menus.isSearchModalOpen,
        isSidebarOpen: menus.isSidebarOpen,
        openMenuId: menus.openMenuId,
        searchInputRef: menus.searchInputRef,
        setActiveView: menus.setActiveView,
        setCollapsedPanel: menus.setCollapsedPanel,
        setIsAccountMenuOpen: menus.setIsAccountMenuOpen,
        setIsHeaderMenuOpen: menus.setIsHeaderMenuOpen,
        setIsModelMenuOpen: menus.setIsModelMenuOpen,
        setIsSearchModalOpen: menus.setIsSearchModalOpen,
        setIsSidebarOpen: menus.setIsSidebarOpen,
        setOpenMenuId: menus.setOpenMenuId,
        toggleCollapsedPanel: menus.toggleCollapsedPanel,
        toggleSidebar: menus.toggleSidebar,
      }}
      sidebar={{
        showTabs,
        setShowTabs,
      }}
      chat={chat}
      models={models}
      conversations={conversations}
      feedback={{
        chatError,
        chatNotice,
        onClearToast: clearFeedback,
      }}
    />
  )
}

export default App
