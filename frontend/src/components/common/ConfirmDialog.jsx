export default function ConfirmDialog({ cancelLabel, confirmLabel, message, onCancel, onConfirm, title }) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onCancel}>
      <div
        className="confirm-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="confirm-modal-icon" aria-hidden="true">!</div>
        <h2 id="confirm-modal-title">{title}</h2>
        <p>{message}</p>
        <div className="confirm-modal-actions">
          <button type="button" className="secondary" onClick={onCancel}>{cancelLabel}</button>
          <button type="button" className="danger" onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}
