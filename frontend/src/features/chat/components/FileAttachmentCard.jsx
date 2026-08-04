const FILE_ICON_META = {
  doc: '/assets/doc.png',
  docx: '/assets/doc.png',
  pdf: '/assets/pdf.png',
  ppt: '/assets/ppt.png',
  pptx: '/assets/ppt.png',
  xls: '/assets/sheets.png',
  xlsx: '/assets/sheets.png',
  zip: '/assets/zip.png',
}

export default function FileAttachmentCard({ attachment, hideActions = false, hideViewButton = false, variant = 'message', onAction, onInspect, onRemove }) {
  const filename = attachment?.filename || attachment?.name || 'Fichier'
  const size = attachment?.size || 0

  if (variant === 'chip') {
    return (
      <div className="attachment-chip">
        {getFileIcon(filename, 32)}
        <span className="attachment-chip-copy">
          <span className="attachment-name" title={filename}>{filename}</span>
          <span className="attachment-size">{formatBytes(size)}</span>
        </span>
        <button
          className="attachment-remove-button"
          type="button"
          aria-label={`Retirer ${filename}`}
          title={`Retirer ${filename}`}
          onClick={onRemove}
        >
          <span aria-hidden="true" />
        </button>
      </div>
    )
  }

  return (
    <li className="file-message-card">
      {getFileIcon(filename, 32)}
      <span className="file-message-copy">
        <strong title={filename}>{filename}</strong>
        <small>{formatBytes(size)}</small>
      </span>
      {!hideActions && (
        <span className="attachment-actions">
          {!hideViewButton && (
            <button
              className="attachment-view-button"
              type="button"
              aria-label={`Voir ${filename}`}
              title={`Voir ${filename}`}
              onClick={() => emitAction(onAction, onInspect, attachment, 'view')}
            >
              Voir
            </button>
          )}
          <button
            className="attachment-view-button"
            type="button"
            aria-label={`Inspecter ${filename}`}
            title={`Inspecter ${filename}`}
            onClick={() => emitAction(onAction, onInspect, attachment, 'inspect')}
          >
            Inspecter
          </button>
          <button
            className="attachment-view-button"
            type="button"
            aria-label={`Afficher la version sécurisée de ${filename}`}
            title={`Version sécurisée de ${filename}`}
            onClick={() => emitAction(onAction, onInspect, attachment, 'secure')}
          >
            Version sécurisée
          </button>
        </span>
      )}
    </li>
  )
}

function emitAction(onAction, onInspect, attachment, mode) {
  if (onAction) {
    onAction(attachment, mode)
    return
  }
  onInspect?.({ attachment, mode })
}

function getFileIcon(filename, size = 32) {
  const extension = fileExtension(filename)
  const src = FILE_ICON_META[extension] || '/assets/document.png'
  return (
    <img
      className="file-type-icon"
      src={src}
      alt="icon"
      aria-hidden="true"
      style={{ width: size, height: size }}
    />
  )
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 o'
  if (bytes < 1024) return `${bytes} o`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`
}

function fileExtension(filename) {
  const match = String(filename || '').toLowerCase().match(/\.([a-z0-9]+)$/)
  return match ? match[1] : ''
}
