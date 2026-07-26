import { useCallback, useState } from 'react'

/**
 * Mirrors a React state value into localStorage while preserving lazy initialization.
 */
export default function useLocalStorage(key, initialValue) {
  const [value, setValue] = useState(() => {
    const saved = localStorage.getItem(key)
    return saved ?? initialValue
  })

  const saveValue = useCallback((nextValue) => {
    setValue((current) => {
      const resolved = typeof nextValue === 'function' ? nextValue(current) : nextValue
      localStorage.setItem(key, String(resolved))
      return resolved
    })
  }, [key])

  return [value, saveValue]
}
