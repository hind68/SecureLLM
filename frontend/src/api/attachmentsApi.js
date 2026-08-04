import { apiFetch, apiFetchResponse } from './client'

export function fetchAttachmentMetadata(id) {
  return apiFetch(`/attachments/${id}`)
}

export async function fetchAttachmentContent(id) {
  const response = await apiFetchResponse(`/attachments/${id}/content`)
  return {
    blob: await response.blob(),
    contentType: response.headers.get('content-type') || 'application/octet-stream',
  }
}

export function fetchAttachmentInspection(id) {
  return apiFetch(`/attachments/${id}/inspection`)
}

export function fetchAttachmentSecure(id) {
  return apiFetch(`/attachments/${id}/secure`)
}

export async function downloadSecureAttachment(id) {
  const response = await apiFetchResponse(`/attachments/${id}/secure/download`)
  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  const disposition = response.headers.get('content-disposition') || ''
  link.href = url
  link.download = filenameFromDisposition(disposition) || 'document-securise.txt'
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export function streamSecureAttachment(conversationId, attachmentId, signal) {
  return apiFetchResponse(`/conversations/${conversationId}/attachments/${attachmentId}/send-secure`, {
    method: 'POST',
    signal,
  })
}

function filenameFromDisposition(disposition) {
  const match = disposition.match(/filename="([^"]+)"/i)
  return match ? match[1] : ''
}
