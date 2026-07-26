import ChatComposer from '../chat/components/ChatComposer'
import ChatThread from '../chat/components/ChatThread'
import ConfirmDialog from '../../components/common/ConfirmDialog'
import Toast from '../../components/common/Toast'
import ModelGallery from '../models/components/ModelGallery'
import ModelSelector from '../models/components/ModelSelector'
import ConversationMenu from '../conversations/components/ConversationMenu'
import SearchModal from '../conversations/components/SearchModal'
import Sidebar from './Sidebar'
import { displayConversationTitle } from '../../utils/modelMetadata'

export default function AppLayout({
  activeConversation,
  activeModel,
  activeModelAlias,
  archiveConversation,
  bottomRef,
  canSend,
  chatError,
  chatNotice,
  closeSidebarPanels,
  closeTransientMenus,
  collapsedPanel,
  confirmDeleteConversation,
  conversations,
  copiedKey,
  deleteConversation,
  draft,
  editingConversationId,
  editingTitle,
  goToBottom,
  handleKeyDown,
  hasActiveMessages,
  historyError,
  isAccountMenuOpen,
  isComposerMaxed,
  isComposerTransitioning,
  isGenerating,
  isHeaderMenuOpen,
  isLastBlockVisible,
  isLoadingHistory,
  isLoadingModels,
  isModelMenuOpen,
  isModelsView,
  isSearchModalOpen,
  isSidebarOpen,
  loadConversations,
  messages,
  messagesRef,
  modelDecision,
  modelDisplayName,
  modelFilter,
  models,
  newConversation,
  onClearToast,
  onCopy,
  onMessagesScroll,
  openConversation,
  openMenuId,
  openNewConversationWithModel,
  pendingDeleteConversation,
  renameConversation,
  restoreConversation,
  saveInlineRename,
  search,
  searchInputRef,
  selectModel,
  sendMessage,
  setActiveView,
  setCollapsedPanel,
  setCopiedKey,
  setDraft,
  setEditingConversationId,
  setEditingTitle,
  setIsAccountMenuOpen,
  setIsHeaderMenuOpen,
  setIsModelMenuOpen,
  setIsSearchModalOpen,
  setIsSidebarOpen,
  setModelDecision,
  setModelFilter,
  setOpenMenuId,
  setPendingDeleteConversation,
  setSearch,
  setShowArchived,
  setShowTabs,
  showArchived,
  showTabs,
  stopGeneration,
  textareaRef,
  toggleCollapsedPanel,
  toggleSidebar,
  continueWithModel,
  composerRef,
}) {
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
          onCopy={onCopy}
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
          onClose={onClearToast}
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
