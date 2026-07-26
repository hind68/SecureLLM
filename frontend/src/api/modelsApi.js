import { apiFetch } from './client'

export async function fetchModelDetails() {
  return apiFetch('/models/details')
}

export async function fetchModelAliases() {
  return apiFetch('/models')
}
