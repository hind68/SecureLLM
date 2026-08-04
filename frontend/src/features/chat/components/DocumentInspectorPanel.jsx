import { useEffect, useMemo, useState } from 'react'
import mammoth from 'mammoth'
import {
  downloadSecureAttachment,
  fetchAttachmentContent,
  fetchAttachmentInspection,
  fetchAttachmentSecure,
} from '../../../api/attachmentsApi'

const TEXT_EXTENSIONS = new Set(['txt', 'log', 'md', 'csv', 'json', 'xml', 'yaml', 'yml', 'js', 'jsx', 'ts', 'tsx', 'java', 'py', 'properties', 'env', 'ini', 'conf'])
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'])

export default function DocumentInspectorPanel({ attachment: inspectionTarget, conversationId, onClose, onSendSecure }) {
  const target = normalizeTarget(inspectionTarget)
  const attachment = target.attachment
  const [activeTab, setActiveTab] = useState(normalizeMode(target.mode))
  const [originalState, setOriginalState] = useState({ html: '', kind: 'message', status: 'Chargement du fichier...', text: '', url: '' })
  const [inspectionState, setInspectionState] = useState({ error: '', loading: false, matches: target.matches, text: '' })
  const [secureState, setSecureState] = useState({ error: '', loading: false, text: target.maskedText || '' })

  useEffect(() => {
    if (!attachment || activeTab !== 'original') return undefined
    let cancelled = false
    let objectUrl = ''

    async function loadOriginal() {
      setOriginalState((current) => ({ ...current, status: 'Chargement du fichier...' }))
      try {
        const source = await resolveOriginalSource(attachment)
        if (!source) {
          if (!cancelled) setOriginalState({ html: '', kind: 'message', status: 'Fichier original indisponible.', text: '', url: '' })
          return
        }
        const filename = attachment.filename || attachment.name || 'Document'
        const extension = fileExtension(filename)
        const blob = source.blob
        if ((extension === 'pdf' || source.contentType.includes('pdf')) && blob) {
          objectUrl = URL.createObjectURL(blob)
          if (!cancelled) setOriginalState({ html: '', kind: 'pdf', status: '', text: '', url: objectUrl })
          return
        }
        if ((IMAGE_EXTENSIONS.has(extension) || source.contentType.startsWith('image/')) && blob) {
          objectUrl = URL.createObjectURL(blob)
          if (!cancelled) setOriginalState({ html: '', kind: 'image', status: '', text: '', url: objectUrl })
          return
        }
        if (extension === 'docx' && blob) {
          const fileData = await blob.arrayBuffer()
          const htmlResult = await mammoth.convertToHtml({ arrayBuffer: fileData })
          if (!cancelled) setOriginalState({ html: sanitizeHtml(htmlResult.value), kind: 'docx', status: '', text: '', url: '' })
          return
        }
        if ((isTextLike(extension) || source.contentType.startsWith('text/')) && blob) {
          const text = await blob.text()
          if (!cancelled) setOriginalState({ html: '', kind: 'text', status: '', text, url: '' })
          return
        }
        if (!cancelled) setOriginalState({ html: '', kind: 'message', status: 'Aperçu original indisponible pour ce type de fichier.', text: '', url: '' })
      } catch {
        if (!cancelled) setOriginalState({ html: '', kind: 'message', status: 'Impossible de charger le fichier original.', text: '', url: '' })
      }
    }

    loadOriginal()
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [activeTab, attachment])

  useEffect(() => {
    if (!attachment || activeTab !== 'inspect') return
    let cancelled = false

    async function loadInspection() {
      setInspectionState((current) => ({ ...current, error: '', loading: true }))
      try {
        if (attachment.id) {
          const payload = await fetchAttachmentInspection(attachment.id)
          if (!cancelled) {
            setInspectionState({
              error: '',
              loading: false,
              matches: Array.isArray(payload.matches) ? payload.matches : [],
              text: payload.extractedText || '',
            })
          }
          return
        }
        if (!cancelled) {
          setInspectionState({
            error: '',
            loading: false,
            matches: target.matches,
            text: target.extractedText || originalState.text || '',
          })
        }
      } catch {
        if (!cancelled) setInspectionState({ error: 'Impossible de charger l’inspection DLP.', loading: false, matches: [], text: '' })
      }
    }

    loadInspection()
    return () => {
      cancelled = true
    }
  }, [activeTab, attachment, originalState.text, target.extractedText, target.matches])

  useEffect(() => {
    if (!attachment || activeTab !== 'secure') return
    let cancelled = false

    async function loadSecure() {
      setSecureState((current) => ({ ...current, error: '', loading: true }))
      try {
        if (attachment.id) {
          const payload = await fetchAttachmentSecure(attachment.id)
          if (!cancelled) setSecureState({ error: '', loading: false, text: payload.maskedText || '' })
          return
        }
        if (!cancelled) setSecureState({ error: '', loading: false, text: target.maskedText || '' })
      } catch {
        if (!cancelled) setSecureState({ error: 'Impossible de charger la version sécurisée.', loading: false, text: '' })
      }
    }

    loadSecure()
    return () => {
      cancelled = true
    }
  }, [activeTab, attachment, target.maskedText])

  const filename = attachment?.filename || attachment?.name || 'Document'
  const extension = fileExtension(filename).toUpperCase() || 'FICHIER'
  const canUseServerActions = Boolean(attachment?.id)
  const pageClass = useMemo(() => {
    if (activeTab === 'secure') return 'document-secure-page'
    if (activeTab === 'inspect') return 'document-secure-page'
    return originalState.kind === 'pdf' ? 'document-a4-page document-a4-page-pdf' : 'document-a4-page'
  }, [activeTab, originalState.kind])

  async function copySecureVersion() {
    if (!secureState.text) return
    await navigator.clipboard?.writeText(secureState.text)
  }

  async function handleDownloadSecure() {
    if (attachment?.id) {
      await downloadSecureAttachment(attachment.id)
    }
  }

  async function handleSendSecure() {
    if (!conversationId || !attachment?.id) return
    await onSendSecure?.(attachment)
  }

  if (!attachment) return null

  return (
    <aside className="document-inspector-panel" aria-label="Inspection du document">
      <header className="document-inspector-header">
        <div className="document-inspector-title">
          <strong title={filename}>{filename}</strong>
          <span>{extension}</span>
        </div>
        <button type="button" aria-label="Fermer l'inspection du document" title="Fermer" onClick={onClose}>
          <span aria-hidden="true">×</span>
        </button>
      </header>

      <div className="document-inspector-tabs" role="tablist" aria-label="Vues du document">
        <button type="button" role="tab" aria-selected={activeTab === 'original'} className={activeTab === 'original' ? 'active' : ''} onClick={() => setActiveTab('original')}>
          Fichier original
        </button>
        <button type="button" role="tab" aria-selected={activeTab === 'inspect'} className={activeTab === 'inspect' ? 'active' : ''} onClick={() => setActiveTab('inspect')}>
          Inspection DLP
        </button>
        <button type="button" role="tab" aria-selected={activeTab === 'secure'} className={activeTab === 'secure' ? 'active' : ''} onClick={() => setActiveTab('secure')}>
          Version sécurisée
        </button>
        {activeTab === 'secure' && (
          <span className="document-secure-actions">
            <button type="button" className="document-copy-safe" onClick={copySecureVersion}>Copier</button>
            <button type="button" className="document-copy-safe" disabled={!canUseServerActions} onClick={handleDownloadSecure}>Télécharger</button>
            <button type="button" className="document-copy-safe" disabled={!canUseServerActions || !conversationId} onClick={handleSendSecure}>Renvoyer au LLM</button>
          </span>
        )}
      </div>

      <div className="document-inspector-viewer">
        <article className={pageClass}>
          {activeTab === 'original' && <OriginalDocumentView documentState={originalState} />}
          {activeTab === 'inspect' && <InspectionDocumentView state={inspectionState} />}
          {activeTab === 'secure' && <SecureDocumentView state={secureState} />}
        </article>
      </div>
    </aside>
  )
}

function OriginalDocumentView({ documentState }) {
  if (documentState.kind === 'pdf' && documentState.url) {
    return (
      <object className="document-pdf-viewer" data={documentState.url} type="application/pdf">
        <a href={documentState.url} target="_blank" rel="noreferrer">Ouvrir le PDF dans le navigateur</a>
      </object>
    )
  }
  if (documentState.kind === 'image' && documentState.url) {
    return <img className="document-image-viewer" src={documentState.url} alt="Aperçu du document" />
  }
  if (documentState.html) {
    return <div dangerouslySetInnerHTML={{ __html: documentState.html }} />
  }
  if (documentState.text) {
    return <pre><code>{documentState.text}</code></pre>
  }
  return <p>{documentState.status}</p>
}

function InspectionDocumentView({ state }) {
  if (state.loading) return <p>Chargement de l’inspection...</p>
  if (state.error) return <p>{state.error}</p>
  if (!state.text) return <p>Aucun texte extrait disponible pour ce fichier.</p>
  return (
    <pre className="document-inspection-text"><code>{renderHighlightedParts(splitOriginalText(state.text, state.matches))}</code></pre>
  )
}

function SecureDocumentView({ state }) {
  if (state.loading) return <p>Chargement de la version sécurisée...</p>
  if (state.error) return <p>{state.error}</p>
  if (!state.text) return <p>Version sécurisée indisponible.</p>
  return <pre className="document-secure-text"><code>{state.text}</code></pre>
}

async function resolveOriginalSource(attachment) {
  if (attachment.id) return fetchAttachmentContent(attachment.id)
  const file = attachment.file || attachment
  if (file instanceof Blob) {
    return { blob: file, contentType: file.type || 'application/octet-stream' }
  }
  return null
}

function renderHighlightedParts(parts) {
  return parts.map((part, index) => {
    if (part.kind !== 'mark') return <span key={index}>{part.text}</span>
    return (
      <mark className={`document-dlp-mark severity-${severityClass(part.match)}`} key={index} title={displayType(part.match?.type)}>
        {part.text}
      </mark>
    )
  })
}

function splitOriginalText(text, matches) {
  const spans = normalizeSpans(text, matches)
  const parts = []
  let cursor = 0
  spans.forEach((match) => {
    if (match.start > cursor) parts.push({ kind: 'text', text: text.slice(cursor, match.start) })
    parts.push({ kind: 'mark', text: text.slice(match.start, match.end), match })
    cursor = match.end
  })
  if (cursor < text.length) parts.push({ kind: 'text', text: text.slice(cursor) })
  return parts
}

function normalizeSpans(text, matches) {
  const length = text.length
  return [...(matches || [])]
    .filter((match) => Number.isInteger(match.start) && Number.isInteger(match.end))
    .map((match) => ({
      ...match,
      start: Math.max(0, Math.min(match.start, length)),
      end: Math.max(0, Math.min(match.end, length)),
    }))
    .filter((match) => match.end > match.start)
    .sort((left, right) => left.start - right.start)
}

function normalizeTarget(target) {
  if (target?.attachment) {
    return {
      attachment: target.attachment,
      extractedText: target.extractedText || '',
      maskedText: target.maskedText || '',
      matches: Array.isArray(target.matches) ? target.matches : [],
      mode: target.mode,
    }
  }
  return { attachment: target, extractedText: '', maskedText: '', matches: [], mode: 'original' }
}

function normalizeMode(mode) {
  if (mode === 'inspect' || mode === 'secure') return mode
  return 'original'
}

function sanitizeHtml(html) {
  const document = new DOMParser().parseFromString(html || '', 'text/html')
  const allowedTags = new Set(['P', 'BR', 'STRONG', 'B', 'EM', 'I', 'U', 'UL', 'OL', 'LI', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'])
  document.body.querySelectorAll('*').forEach((node) => {
    if (!allowedTags.has(node.tagName)) {
      node.replaceWith(...node.childNodes)
      return
    }
    ;[...node.attributes].forEach((attribute) => node.removeAttribute(attribute.name))
  })
  return document.body.innerHTML
}

function severityClass(match) {
  return String(match?.severity || match?.level || 'medium').toLowerCase()
}

function displayType(type) {
  return String(type || 'donnée sensible').replaceAll('_', ' ')
}

function isTextLike(extension) {
  return TEXT_EXTENSIONS.has(extension)
}

function fileExtension(filename) {
  const match = String(filename || '').match(/\.([a-z0-9]+)$/i)
  return match ? match[1].toLowerCase() : ''
}
