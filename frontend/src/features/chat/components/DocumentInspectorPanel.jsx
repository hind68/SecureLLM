import { useEffect, useMemo, useState } from 'react'
import mammoth from 'mammoth'

const TEXT_EXTENSIONS = new Set(['txt', 'log', 'md', 'csv', 'json', 'xml', 'yaml', 'yml', 'js', 'jsx', 'ts', 'tsx', 'java', 'py', 'properties', 'env', 'ini', 'conf'])
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'])

export default function DocumentInspectorPanel({ attachment: inspectionTarget, onClose }) {
  const target = normalizeTarget(inspectionTarget)
  const attachment = target.attachment
  const matches = target.matches
  const [activeTab, setActiveTab] = useState('original')
  const initialDocumentState = useMemo(() => ({ html: '', kind: 'message', status: initialStatus(attachment), text: '', url: '' }), [attachment])
  const [documentState, setDocumentState] = useState(initialDocumentState)

  useEffect(() => {
    let cancelled = false
    let objectUrl = ''

    async function loadDocument() {
      const file = attachment?.file || attachment
      if (!file) return
      const filename = attachment.filename || attachment.name || 'Document'
      const extension = fileExtension(filename)

      if (isTextLike(extension) && typeof file.text === 'function') {
        try {
          const text = await file.text()
          if (!cancelled) setDocumentState({ html: '', kind: 'text', status: '', text, url: '' })
        } catch {
          if (!cancelled) setDocumentState({ html: '', kind: 'message', status: 'Impossible de lire ce fichier texte.', text: '', url: '' })
        }
        return
      }

      if (extension === 'docx' && typeof file.arrayBuffer === 'function') {
        try {
          const fileData = await file.arrayBuffer()
          const [htmlResult, textResult] = await Promise.all([
            mammoth.convertToHtml({ arrayBuffer: fileData }),
            mammoth.extractRawText({ arrayBuffer: fileData }),
          ])
          if (!cancelled) {
            setDocumentState({
              html: sanitizeHtml(htmlResult.value),
              kind: 'docx',
              status: '',
              text: textResult.value,
              url: '',
            })
          }
        } catch {
          if (!cancelled) {
            setDocumentState({ html: '', kind: 'message', status: "Impossible d'afficher ce document Word.", text: '', url: '' })
          }
        }
        return
      }

      if ((extension === 'pdf' || file.type === 'application/pdf') && file instanceof Blob) {
        const url = URL.createObjectURL(file)
        objectUrl = url
        if (!cancelled) setDocumentState({ html: '', kind: 'pdf', status: '', text: '', url })
        return
      }

      if ((IMAGE_EXTENSIONS.has(extension) || file.type?.startsWith('image/')) && file instanceof Blob) {
        const url = URL.createObjectURL(file)
        objectUrl = url
        if (!cancelled) setDocumentState({ html: '', kind: 'image', status: '', text: '', url })
        return
      }

      if (!cancelled) setDocumentState({ html: '', kind: 'message', status: unsupportedStatus(extension), text: '', url: '' })
    }

    loadDocument()
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [attachment, initialDocumentState])

  const safeText = useMemo(
    () => target.maskedText || buildSafeText(documentState.text, matches),
    [documentState.text, matches, target.maskedText],
  )

  if (!attachment) return null

  const filename = attachment.filename || attachment.name || 'Document'
  const extension = fileExtension(filename).toUpperCase() || 'FICHIER'

  async function copySafeVersion() {
    if (!safeText) return
    await navigator.clipboard?.writeText(safeText)
  }

  return (
    <aside className="document-inspector-panel" aria-label="Inspection du document">
      <header className="document-inspector-header">
        <div className="document-inspector-title">
          <strong title={filename}>{filename}</strong>
          <span>{extension}</span>
        </div>
        <button
          type="button"
          aria-label="Fermer l'inspection du document"
          title="Fermer"
          onClick={onClose}
        >
          <span aria-hidden="true">×</span>
        </button>
      </header>

      <div className="document-inspector-tabs" role="tablist" aria-label="Vues du document">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'original'}
          className={activeTab === 'original' ? 'active' : ''}
          onClick={() => setActiveTab('original')}
        >
          Document original
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'secure'}
          className={activeTab === 'secure' ? 'active' : ''}
          onClick={() => setActiveTab('secure')}
        >
          Version sécurisée
        </button>
        {activeTab === 'secure' && (
          <button type="button" className="document-copy-safe" onClick={copySafeVersion}>
            Copier
          </button>
        )}
      </div>

      <div className="document-inspector-viewer">
        <article className={documentPageClass(activeTab, documentState.kind)}>
          {activeTab === 'original' ? (
            <OriginalDocumentView documentState={documentState} matches={matches} />
          ) : (
            <SafeDocumentView safeText={safeText} status={documentState.status} />
          )}
        </article>
      </div>
    </aside>
  )
}

function OriginalDocumentView({ documentState, matches }) {
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
    return (
      <>
        <p className="document-inspector-note">Aperçu HTML nettoyé. Les offsets DLP ne sont pas appliqués sur le HTML Mammoth sans mapping fiable.</p>
        <div dangerouslySetInnerHTML={{ __html: documentState.html }} />
      </>
    )
  }
  if (documentState.text) {
    return (
      <pre><code>{renderHighlightedParts(splitOriginalText(documentState.text, matches))}</code></pre>
    )
  }
  return <p>{documentState.status}</p>
}

function SafeDocumentView({ safeText, status }) {
  if (!safeText) return <p>{status || 'Version sécurisée indisponible : aucun texte extrait ou aucune détection DLP associée à ce fichier.'}</p>
  return (
    <pre className="document-secure-text"><code>{safeText}</code></pre>
  )
}

function documentPageClass(activeTab, kind) {
  if (activeTab === 'secure') return 'document-secure-page'
  return kind === 'pdf' ? 'document-a4-page document-a4-page-pdf' : 'document-a4-page'
}

function renderHighlightedParts(parts) {
  return parts.map((part, index) => {
    if (part.kind !== 'mark') return <span key={index}>{part.text}</span>
    return (
      <mark
        className={`document-dlp-mark severity-${severityClass(part.match)}`}
        key={index}
        title={displayType(part.match?.type)}
      >
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

function buildSafeText(text, matches) {
  const spans = normalizeSpans(text, matches)
  if (!text || spans.length === 0) return ''
  let cursor = 0
  let result = ''
  spans.forEach((match) => {
    result += text.slice(cursor, match.start)
    result += match.placeholder || `[${String(match.type || 'DLP').toUpperCase()}]`
    cursor = match.end
  })
  result += text.slice(cursor)
  return result
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
      maskedText: target.maskedText || '',
      matches: Array.isArray(target.matches) ? target.matches : [],
    }
  }
  return { attachment: target, maskedText: '', matches: [] }
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

function unsupportedStatus(extension) {
  if (['xlsx', 'xls'].includes(extension)) {
    return 'Aperçu tableur indisponible dans cette version. Le fichier reste analysé par le DLP, mais le rendu XLSX nécessite un lecteur dédié.'
  }
  if (['pptx', 'ppt'].includes(extension)) {
    return 'Aperçu présentation indisponible dans cette version. Le fichier reste analysé par le DLP, mais le rendu PPTX nécessite un lecteur dédié.'
  }
  if (extension === 'zip') {
    return 'Archive ZIP analysée par le DLP. L’inspection visuelle fichier par fichier nécessite une vue dédiée des éléments extraits.'
  }
  return 'Aperçu indisponible pour ce type de fichier. Le fichier reste analysé par le DLP lorsque vous l’envoyez.'
}

function fileExtension(filename) {
  const match = String(filename || '').match(/\.([a-z0-9]+)$/i)
  return match ? match[1].toLowerCase() : ''
}

function initialStatus(attachment) {
  if (!attachment) return ''
  const file = attachment.file || attachment
  const filename = attachment.filename || attachment.name || 'Document'
  const extension = fileExtension(filename)

  if (isTextLike(extension) && typeof file.text === 'function') {
    return 'Chargement du contenu lisible du document...'
  }
  if (extension === 'docx') {
    return typeof file.arrayBuffer === 'function'
      ? 'Chargement du document Word...'
      : 'Aperçu DOCX indisponible pour les documents déjà envoyés. Le backend doit exposer le contenu extrait pour les recharger.'
  }
  if (extension === 'pdf') {
    return 'Aperçu PDF via navigateur à connecter lorsque le fichier source est disponible.'
  }
  return 'Aucun contenu lisible localement pour ce fichier.'
}


