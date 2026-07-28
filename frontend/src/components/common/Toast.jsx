import { useEffect, useRef, useState } from 'react'

const EXIT_ANIMATION_MS = 220

export default function Toast({ chatError, chatNotice, onClose }) {
  const incomingMessage = chatError || chatNotice
  const incomingKind = chatNotice ? 'success' : 'error'
  const [toast, setToast] = useState(null)
  const exitTimerRef = useRef(null)
  const toastKeyRef = useRef(0)

  useEffect(() => {
    if (exitTimerRef.current) {
      window.clearTimeout(exitTimerRef.current)
      exitTimerRef.current = null
    }

    if (incomingMessage) {
      toastKeyRef.current += 1
      setToast({
        key: toastKeyRef.current,
        kind: incomingKind,
        message: incomingMessage,
        exiting: false,
      })
      return undefined
    }

    setToast((current) => (current ? { ...current, exiting: true } : null))
    exitTimerRef.current = window.setTimeout(() => {
      setToast(null)
      exitTimerRef.current = null
    }, EXIT_ANIMATION_MS)

    return () => {
      if (exitTimerRef.current) {
        window.clearTimeout(exitTimerRef.current)
        exitTimerRef.current = null
      }
    }
  }, [incomingKind, incomingMessage])

  if (!toast) return null

  return (
    <div
      key={toast.key}
      className={`inline-error ${toast.kind === 'success' ? 'success' : ''} ${toast.exiting ? 'is-exiting' : ''}`}
      role={toast.kind === 'error' ? 'alert' : 'status'}
    >
      <span>{toast.message}</span>
      <button type="button" aria-label="Fermer la notification" onClick={onClose}>
        <span className="close-icon" aria-hidden="true"></span>
      </button>
    </div>
  )
}
