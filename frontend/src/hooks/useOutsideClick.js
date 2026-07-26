import { useEffect } from 'react'

/**
 * Centralizes document-level menu dismissal.
 *
 * The selector is intentionally configurable because the app has several
 * independent popovers that all opt into the same outside-click contract via
 * `data-menu-root`. Escape is handled here as the keyboard equivalent of that
 * dismissal, while the caller decides which extra UI state must be reset.
 */
export default function useOutsideClick({ selector, onOutside, onEscape }) {
  useEffect(() => {
    function closeOutside(event) {
      if (!event.target.closest(selector)) {
        onOutside()
      }
    }

    function closeOnEscape(event) {
      if (event.key === 'Escape') {
        onEscape?.()
      }
    }

    document.addEventListener('mousedown', closeOutside)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('mousedown', closeOutside)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [onEscape, onOutside, selector])
}
