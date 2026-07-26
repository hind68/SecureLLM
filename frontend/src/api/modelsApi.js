import { API_BASE_URL } from './client'

export async function fetchModelDetails() {
  const response = await fetch(`${API_BASE_URL}/models/details`)
  if (!response.ok) throw new Error('model-details')
  return response.json()
}

export async function fetchModelAliases() {
  const response = await fetch(`${API_BASE_URL}/models`)
  if (!response.ok) throw new Error('models')
  return response.json()
}
