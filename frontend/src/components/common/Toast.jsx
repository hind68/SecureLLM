export default function Toast({ chatError, chatNotice, onClose }) {
  if (!chatError && !chatNotice) return null

  return (
    <div className={`inline-error ${chatNotice ? 'success' : ''}`} role={chatError ? 'alert' : 'status'}>
      <span>{chatError || chatNotice}</span>
      <button type="button" aria-label="Fermer la notification" onClick={onClose}>
        <span className="close-icon" aria-hidden="true"></span>
      </button>
    </div>
  )
}
