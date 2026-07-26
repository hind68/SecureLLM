export const API_BASE_URL = 'http://localhost:8080/api'

export async function readJson(response) {
  return response.json()
}

export function jsonHeaders() {
  return { 'Content-Type': 'application/json' }
}
