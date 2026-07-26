/**
 * Parses JSON carried inside SSE data fields.
 * The backend may stream token events as raw text, so callers decide when JSON is expected.
 */
export function parseJson(value) {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

/**
 * Joins all `data:` lines of one SSE event.
 * Token events preserve leading whitespace because spaces are meaningful model output.
 */
export function extractSseData(lines, preserveWhitespace = false) {
  return lines
    .filter((line) => line.startsWith('data:'))
    .map((line) => {
      const value = line.slice(5).replace(/\r$/, '')
      if (preserveWhitespace) return value
      return value.startsWith(' ') ? value.slice(1) : value.trim()
    })
    .join('\n')
}
