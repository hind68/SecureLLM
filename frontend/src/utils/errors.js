export async function deletionErrorMessage(response) {
  if (response.status === 404) return 'Conversation introuvable ou deja supprimee.'
  if (response.status === 409) return 'Cette conversation ne peut pas etre supprimee pour le moment.'
  if (response.status >= 500) return 'Suppression impossible cote serveur. Verifiez les liens messages/conversation.'
  return requestStatusMessage(response, 'Impossible de supprimer la conversation.')
}

export async function requestStatusMessage(response, fallback) {
  let details
  try {
    details = await response.text()
  } catch {
    details = ''
  }
  return details?.trim() || `${fallback} Statut HTTP ${response.status}.`
}

export function requestErrorMessage(error, fallback) {
  if (error instanceof TypeError && /fetch/i.test(error.message)) {
    return `${fallback} Le backend est inaccessible ou la requete est bloquee par CORS.`
  }
  return error instanceof Error ? error.message : fallback
}

export function friendlyGenerationError(error) {
  const rawMessage = typeof error === 'string' ? error : error instanceof Error ? error.message : ''
  if (/litellm|stream|streaming|fetch|network|failed/i.test(rawMessage)) {
    return 'Le modele met trop de temps a repondre ou est indisponible. Veuillez reessayer.'
  }
  return rawMessage.trim() || 'La generation a echoue. Veuillez reessayer.'
}

export function logDevelopmentError(label, payload) {
  if (import.meta.env.DEV) {
    console.error(label, payload)
  }
}
