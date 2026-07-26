import { useCallback, useEffect, useRef, useState } from 'react'
import useOutsideClick from '../../../hooks/useOutsideClick'
import { SIDEBAR_STORAGE_KEY } from '../../../utils/storage'

/**
 * Owns transient layout state: side panels, menus, sidebar persistence and the
 * search modal focus behavior. Keeping this state together avoids stale menu
 * combinations when several popovers can be opened from the sidebar/header.
 */
export default function useAppMenus({ onEscape }) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => localStorage.getItem(SIDEBAR_STORAGE_KEY) !== 'false')
  const [activeView, setActiveView] = useState('chat')
  const [collapsedPanel, setCollapsedPanel] = useState(null)
  const [openMenuId, setOpenMenuId] = useState(null)
  const [isHeaderMenuOpen, setIsHeaderMenuOpen] = useState(false)
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false)
  const [isModelMenuOpen, setIsModelMenuOpen] = useState(false)
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false)
  const searchInputRef = useRef(null)

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

  const closeAllOnEscape = useCallback(() => {
    closeTransientMenus()
    setIsSearchModalOpen(false)
    setActiveView('chat')
    onEscape?.()
  }, [closeTransientMenus, onEscape])

  const toggleSidebar = useCallback(() => {
    closeSidebarPanels()
    setIsSidebarOpen((current) => !current)
  }, [closeSidebarPanels])

  const toggleCollapsedPanel = useCallback((panel) => {
    setOpenMenuId(null)
    setIsHeaderMenuOpen(false)
    setIsModelMenuOpen(false)
    setIsAccountMenuOpen(false)
    setCollapsedPanel((current) => (current === panel ? null : panel))
  }, [])

  useEffect(() => {
    localStorage.setItem(SIDEBAR_STORAGE_KEY, String(isSidebarOpen))
  }, [isSidebarOpen])

  useEffect(() => {
    if (!isSearchModalOpen) return undefined
    const timeout = window.setTimeout(() => searchInputRef.current?.focus(), 180)
    return () => window.clearTimeout(timeout)
  }, [isSearchModalOpen])

  useOutsideClick({
    selector: '[data-menu-root]',
    onOutside: closeTransientMenus,
    onEscape: closeAllOnEscape,
  })

  return {
    activeView,
    closeSidePanelOnMobile,
    closeSidebarPanels,
    closeTransientMenus,
    collapsedPanel,
    isAccountMenuOpen,
    isHeaderMenuOpen,
    isModelMenuOpen,
    isModelsView: activeView === 'models',
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
  }
}
