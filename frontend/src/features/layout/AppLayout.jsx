import { useCallback, useRef, useState } from 'react'
import ChatComposer from '../chat/components/ChatComposer'
import DocumentInspectorPanel from '../chat/components/DocumentInspectorPanel'
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
  layout,
  sidebar,
  chat,
  models,
  conversations,
  feedback,
}) {
  const { state, filters, editing, dialogs, actions, status } = conversations
  const activeConversation = state.activeConversation
  const [isDraggingFiles, setIsDraggingFiles] = useState(false)
  const [inspectedDocument, setInspectedDocument] = useState(null)
  const dragDepthRef = useRef(0)

  const containsFiles = useCallback((event) => (
    Array.from(event.dataTransfer?.types || []).includes('Files')
  ), [])

  const handleDragEnter = useCallback((event) => {
    if (!containsFiles(event)) return
    event.preventDefault()
    dragDepthRef.current += 1
    setIsDraggingFiles(true)
  }, [containsFiles])

  const handleDragOver = useCallback((event) => {
    if (!containsFiles(event)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
  }, [containsFiles])

  const handleDragLeave = useCallback((event) => {
    if (!containsFiles(event)) return
    event.preventDefault()
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
    if (dragDepthRef.current === 0) {
      setIsDraggingFiles(false)
    }
  }, [containsFiles])

  const handleDrop = useCallback((event) => {
    if (!containsFiles(event)) return
    event.preventDefault()
    dragDepthRef.current = 0
    setIsDraggingFiles(false)
    if (status.isGenerating) return
    chat.addAttachments(event.dataTransfer.files)
  }, [chat, containsFiles, status.isGenerating])

  return (
    <div className={`app-shell ${layout.isSidebarOpen ? 'sidebar-open' : 'sidebar-closed'}`}>
      <Sidebar
        activeConversation={activeConversation}
        archiveConversation={actions.archiveConversation}
        closeSidebarPanels={layout.closeSidebarPanels}
        closeTransientMenus={layout.closeTransientMenus}
        collapsedPanel={layout.collapsedPanel}
        conversations={state.conversations}
        deleteConversation={actions.deleteConversation}
        editingConversationId={editing.editingConversationId}
        editingTitle={editing.editingTitle}
        historyError={state.historyError}
        isAccountMenuOpen={layout.isAccountMenuOpen}
        isLoadingHistory={state.isLoadingHistory}
        isModelsView={layout.isModelsView}
        isSearchModalOpen={layout.isSearchModalOpen}
        isSidebarOpen={layout.isSidebarOpen}
        loadConversations={actions.loadConversations}
        newConversation={actions.newConversation}
        openConversation={actions.openConversation}
        openMenuId={layout.openMenuId}
        renameConversation={actions.renameConversation}
        restoreConversation={actions.restoreConversation}
        saveInlineRename={actions.saveInlineRename}
        setActiveView={layout.setActiveView}
        setCollapsedPanel={layout.setCollapsedPanel}
        setEditingConversationId={editing.setEditingConversationId}
        setEditingTitle={editing.setEditingTitle}
        setIsAccountMenuOpen={layout.setIsAccountMenuOpen}
        setIsSearchModalOpen={layout.setIsSearchModalOpen}
        setIsSidebarOpen={layout.setIsSidebarOpen}
        setModelFilter={filters.setModelFilter}
        setOpenMenuId={layout.setOpenMenuId}
        setSearch={filters.setSearch}
        setShowArchived={filters.setShowArchived}
        setShowTabs={sidebar.setShowTabs}
        showArchived={state.showArchived}
        showTabs={sidebar.showTabs}
        toggleCollapsedPanel={layout.toggleCollapsedPanel}
        toggleSidebar={layout.toggleSidebar}
      />

      {layout.isSearchModalOpen && (
        <SearchModal
          inputRef={layout.searchInputRef}
          conversations={state.conversations}
          isLoadingHistory={state.isLoadingHistory}
          modelFilter={state.modelFilter}
          models={models.models}
          onClose={() => layout.setIsSearchModalOpen(false)}
          openConversation={actions.openConversation}
          search={state.search}
          setModelFilter={filters.setModelFilter}
          setSearch={filters.setSearch}
          setShowArchived={filters.setShowArchived}
          showArchived={state.showArchived}
        />
      )}

      <div className="chat-workspace">
      <main
        className={`chat-main ${chat.hasActiveMessages ? 'conversation-mode' : 'welcome-mode'} ${isDraggingFiles ? 'is-dragging-files' : ''}`}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {isDraggingFiles && (
          <div className="drag-drop-overlay" aria-live="polite">
            <div className="drag-drop-card">
              <span className="drag-drop-icon" aria-hidden="true"></span>
              <strong>Glissez-déposez vos fichiers ici</strong>
            </div>
          </div>
        )}
        <header className="chat-header">
          <div className="header-controls">
            <ModelSelector
              activeModel={models.activeModel}
              disabled={status.isGenerating || models.isLoadingModels}
              isOpen={layout.isModelMenuOpen}
              models={models.models}
              onSelect={actions.selectModel}
              onToggle={() => {
                layout.setIsAccountMenuOpen(false)
                layout.setIsModelMenuOpen((current) => !current)
              }}
            />

            {activeConversation && (
              <ConversationMenu
                id="header-conversation-menu"
                isOpen={layout.isHeaderMenuOpen}
                archiveLabel={activeConversation.status === 'ARCHIVEE' ? 'Désarchiver' : 'Archiver'}
                onArchive={() => (activeConversation.status === 'ARCHIVEE' ? actions.restoreConversation(activeConversation) : actions.archiveConversation(activeConversation))}
                onDelete={() => actions.deleteConversation(activeConversation)}
                onOpen={() => {
                  layout.setIsAccountMenuOpen(false)
                  layout.setIsHeaderMenuOpen((current) => !current)
                }}
                onRename={() => actions.renameConversation(activeConversation)}
              />
            )}
          </div>
        </header>

        {layout.isModelsView && (
          <ModelGallery
            disabled={status.isGenerating}
            models={models.models}
            onClose={() => layout.setActiveView('chat')}
            onSelect={actions.selectModel}
          />
        )}

        <ChatThread
          activeModelAlias={models.activeModelAlias}
          activeModelName={models.activeModel?.displayName || models.modelDisplayName(models.activeModelAlias)}
          bottomRef={chat.bottomRef}
          copiedKey={chat.copiedKey}
          goToBottom={chat.goToBottom}
          hasActiveMessages={chat.hasActiveMessages}
          isComposerTransitioning={chat.isComposerTransitioning}
          isGenerating={status.isGenerating}
          isLastBlockVisible={chat.isLastBlockVisible}
          messages={chat.messages}
          messagesRef={chat.messagesRef}
          onCopy={chat.onCopy}
          onInspectDocument={setInspectedDocument}
          onMessagesScroll={chat.onMessagesScroll}
          setCopiedKey={chat.setCopiedKey}
        />

        <ChatComposer
          attachments={chat.attachments}
          canSend={chat.canSend}
          composerRef={chat.composerRef}
          draft={chat.draft}
          hasActiveMessages={chat.hasActiveMessages}
          isComposerMaxed={chat.isComposerMaxed}
          isGenerating={status.isGenerating}
          onDraftChange={chat.setDraft}
          onFilesSelected={chat.addAttachments}
          onInspectDocument={setInspectedDocument}
          onKeyDown={chat.handleKeyDown}
          onRemoveFile={chat.removeAttachment}
          onRemoveFiles={chat.clearAttachments}
          onStop={chat.stopGeneration}
          onSubmit={actions.sendMessage}
          textareaRef={chat.textareaRef}
        />

        <Toast
          chatError={feedback.chatError}
          chatNotice={feedback.chatNotice}
          onClose={feedback.onClearToast}
        />
      </main>

      {inspectedDocument && (
        <DocumentInspectorPanel
          attachment={inspectedDocument}
          key={`${inspectedDocument.filename || inspectedDocument.name}-${inspectedDocument.size || 0}`}
          onClose={() => setInspectedDocument(null)}
        />
      )}
      </div>

      {dialogs.modelDecision && (
        <div className="decision-backdrop" role="presentation">
          <div className="decision-box" role="dialog" aria-modal="true" aria-labelledby="model-decision-title">
            <h2 id="model-decision-title">Changer de modèle ?</h2>
            <p>Cette conversation utilise actuellement {models.modelDisplayName(activeConversation?.modelAlias)}. Que souhaitez-vous faire avec {models.modelDisplayName(dialogs.modelDecision.alias)} ?</p>
            <div className="decision-actions">
              <button type="button" onClick={() => actions.openNewConversationWithModel(dialogs.modelDecision.alias)}>
                Ouvrir une nouvelle conversation
              </button>
              <button type="button" onClick={() => actions.continueWithModel(dialogs.modelDecision.alias)}>
                Continuer cette conversation
              </button>
              <button type="button" className="secondary" onClick={() => dialogs.setModelDecision(null)}>
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}

      {dialogs.pendingDeleteConversation && (
        <ConfirmDialog
          title="Supprimer la conversation ?"
          message={`La conversation "${displayConversationTitle(dialogs.pendingDeleteConversation.title)}" sera supprimée définitivement.`}
          confirmLabel="Confirmer"
          cancelLabel="Annuler"
          onCancel={() => dialogs.setPendingDeleteConversation(null)}
          onConfirm={actions.confirmDeleteConversation}
        />
      )}
    </div>
  )
}
