import { useState } from 'react'
import { DotsIcon } from '../../../components/common/icons'

export default function ConversationMenu({ id, isOpen, onOpen, onRename, onArchive, onDelete, archiveLabel = 'Archiver' }) {
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
