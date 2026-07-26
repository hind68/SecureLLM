import { API_BASE_URL, jsonHeaders } from './client'

export async function fetchConversations({ modelFilter, search, showArchived }) {
  const params = new URLSearchParams({ page: '0', size: '30' })
  if (modelFilter) params.set('modelAlias', modelFilter)
  if (search.trim()) params.set('search', search.trim())
  if (showArchived) params.set('archived', 'true')

  const response = await fetch(`${API_BASE_URL}/conversations?${params}`)
  if (!response.ok) throw new Error(`history ${response.status}`)
  return response.json()
}

export async function fetchConversation(conversationId) {
  const response = await fetch(`${API_BASE_URL}/conversations/${conversationId}`)
  if (!response.ok) throw new Error('conversation')
  return response.json()
}

export async function fetchConversationMessages(conversationId) {
  const response = await fetch(`${API_BASE_URL}/conversations/${conversationId}/messages`)
  if (!response.ok) throw new Error('messages')
  return response.json()
}

export async function createConversationRequest(modelAlias, title) {
  const response = await fetch(`${API_BASE_URL}/conversations`, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ modelAlias, title }),
  })
  if (!response.ok) throw new Error('create conversation')
  return response.json()
}

export async function renameConversationRequest(conversationId, title) {
  const response = await fetch(`${API_BASE_URL}/conversations/${conversationId}`, {
    method: 'PATCH',
    headers: jsonHeaders(),
    body: JSON.stringify({ title }),
  })
  if (!response.ok) throw new Error('rename')
  return response.json()
}

export async function archiveConversationRequest(conversationId) {
  const response = await fetch(`${API_BASE_URL}/conversations/${conversationId}`, { method: 'DELETE' })
  if (!response.ok) throw new Error('archive')
}

export async function restoreConversationRequest(conversationId) {
  const response = await fetch(`${API_BASE_URL}/conversations/${conversationId}/restore`, { method: 'PATCH' })
  return response
}

export async function deleteConversationRequest(conversationId) {
  return fetch(`${API_BASE_URL}/conversations/${conversationId}/permanent`, { method: 'DELETE' })
}

export async function changeConversationModelRequest(conversationId, modelAlias) {
  const response = await fetch(`${API_BASE_URL}/conversations/${conversationId}/model`, {
    method: 'PATCH',
    headers: jsonHeaders(),
    body: JSON.stringify({ modelAlias }),
  })
  return response
}

export function streamConversationMessage(conversationId, content, signal) {
  return fetch(`${API_BASE_URL}/conversations/${conversationId}/messages/stream`, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ content }),
    signal,
  })
}
