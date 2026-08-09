import { useEffect, useMemo, useState } from 'react'
import mammoth from 'mammoth'
import {
  downloadSecureAttachment,
  fetchAttachmentContent,
  fetchAttachmentInspection,
  fetchAttachmentSecure,
} from '../../../api/attachmentsApi'
import { CopyIcon } from '../../../components/common/icons'

const TEXT_EXTENSIONS = new Set(['txt', 'log', 'md', 'csv', 'json', 'xml', 'yaml', 'yml', 'js', 'jsx', 'ts', 'tsx', 'java', 'py', 'properties', 'env', 'ini', 'conf'])
const PREVIEW_UNAVAILABLE = 'Format non prévisualisable'
const EXTRACTION_UNAVAILABLE = 'Extraction impossible'

export default function DocumentInspectorPanel({ attachment: inspectionTarget, closing = false, onAttachSecure, onClose, width }) {
  const target = useMemo(() => normalizeTarget(inspectionTarget), [inspectionTarget])
  const attachment = target.attachment
  const attachmentKey = attachmentIdentity(attachment)
  const [activeTab, setActiveTab] = useState(initialMode(target))
  const [originalState, setOriginalState] = useState(() => initialOriginalState())
  const [inspectionState, setInspectionState] = useState(() => initialInspectionState(target))
  const [secureState, setSecureState] = useState(() => initialSecureState(target))
  const [copySucceeded, setCopySucceeded] = useState(false)
  const [fontSize, setFontSize] = useState(13)

  useEffect(() => {
    setActiveTab(initialMode(target))
    setOriginalState(initialOriginalState())
    setInspectionState(initialInspectionState(target))
    setSecureState(initialSecureState(target))
    setCopySucceeded(false)
    setFontSize(13)
  }, [attachmentKey])

  useEffect(() => {
    if (!attachment) return undefined
    let cancelled = false
    let previewUrl = ''
    const controller = new AbortController()

    async function loadOriginal() {
      setOriginalState((current) => ({ ...current, error: '', loading: true, status: 'Chargement du document…' }))
      try {
        const filename = attachment.filename || attachment.name || ''
        const fallbackText = target.extractedText || ''
        if (attachment.id) {
          const source = await fetchAttachmentContent(attachment.id, { signal: controller.signal })
          const nextState = await previewStateFromBlob(source.blob, filename, source.contentType || '', fallbackText)
          previewUrl = nextState.url || ''
          if (!cancelled) setOriginalState(nextState)
          return
        }

        const file = attachment.file || attachment
        if (!(file instanceof Blob)) {
          if (!cancelled) setOriginalState(fallbackOriginalState(fallbackText))
          return
        }

        const nextState = await previewStateFromBlob(file, filename, file.type || '', fallbackText)
        previewUrl = nextState.url || ''
        if (!cancelled) setOriginalState(nextState)
      } catch (error) {
        if (!cancelled && error?.name !== 'AbortError') {
          setOriginalState(fallbackOriginalState(target.extractedText || '', EXTRACTION_UNAVAILABLE))
        }
      }
    }

    loadOriginal()
    return () => {
      cancelled = true
      controller.abort()
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [attachmentKey])

  useEffect(() => {
    if (!attachment) return undefined
    let cancelled = false
    const controller = new AbortController()

    async function loadInspection() {
      setInspectionState((current) => ({ ...current, error: '', loading: true }))
      try {
        if (attachment.id) {
          const payload = await fetchAttachmentInspection(attachment.id, { signal: controller.signal })
          if (!cancelled) {
            const extractedText = payload.extractedText || ''
            setInspectionState({
              error: '',
              loading: false,
              matches: Array.isArray(payload.matches) ? payload.matches : [],
              status: payload.extractionStatus || '',
              text: extractedText,
            })
            setOriginalState((current) => (
              current.text
                ? current
                : { ...current, loading: false, status: extractedText ? '' : (current.status || EXTRACTION_UNAVAILABLE), text: extractedText }
            ))
          }
          return
        }

        if (!cancelled) {
          setInspectionState({
            error: '',
            loading: false,
            matches: target.matches,
            status: '',
            text: target.extractedText || '',
          })
        }
      } catch (error) {
        if (!cancelled && error?.name !== 'AbortError') {
          setInspectionState({ error: "Impossible de charger l'inspection DLP.", loading: false, matches: [], status: 'ERROR', text: '' })
        }
      }
    }

    loadInspection()
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [attachmentKey])

  useEffect(() => {
    if (!attachment) return undefined
    let cancelled = false
    const controller = new AbortController()

    async function loadSecure() {
      setSecureState((current) => ({ ...current, error: '', loading: true }))
      try {
        if (attachment.id) {
          const payload = await fetchAttachmentSecure(attachment.id, { signal: controller.signal })
          if (!cancelled) setSecureState((current) => ({ error: '', loading: false, status: payload.extractionStatus || '', text: payload.maskedText || current.text || target.maskedText || '' }))
          return
        }

        if (!cancelled) setSecureState({ error: '', loading: false, status: '', text: target.maskedText || '' })
      } catch (error) {
        if (!cancelled && error?.name !== 'AbortError') {
          setSecureState({ error: 'Impossible de charger la version sécurisée.', loading: false, status: 'ERROR', text: '' })
        }
      }
    }

    loadSecure()
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [attachmentKey])

  const filename = attachment?.filename || attachment?.name || 'Document'
  const extension = fileExtension(filename).toUpperCase() || 'FICHIER'
  const hasSecureText = Boolean(secureState.text)
  const visibleMatches = useMemo(() => filterMatchesForAttachment(inspectionState.matches, attachment), [attachment, inspectionState.matches])
  const matchCount = visibleMatches.length
  const canDownloadOriginal = attachment?.id && String(attachment?.decision || '').toUpperCase() !== 'BLOCK'
  const pageClass = useMemo(() => {
    if (activeTab === 'secure') return 'document-text-page document-secure-page'
    if (activeTab === 'detected') return 'document-text-page document-detected-page'
    return 'document-text-page document-editor-page'
  }, [activeTab])
  const readerStyle = pageClass.includes('document-text-page') ? { fontSize: `${fontSize}px` } : undefined

  async function copySecureVersion() {
    if (!secureState.text) return
    await navigator.clipboard?.writeText(secureState.text)
    setCopySucceeded(true)
    window.setTimeout(() => setCopySucceeded(false), 1500)
  }

  async function handleDownloadSecure() {
    if (!secureState.text) return
    if (attachment?.id) {
      await downloadSecureAttachment(attachment.id)
      return
    }
    downloadText(`${filenameWithoutExtension(filename)}-securise.txt`, secureState.text)
  }

  function handleAttachSecureVersion() {
    if (!secureState.text) return
    const secureFile = new File(
      [secureState.text],
      `${filenameWithoutExtension(filename)}-securise.txt`,
      { type: 'text/plain;charset=utf-8' },
    )
    onAttachSecure?.(secureFile)
  }

  function decreaseFontSize() {
    setFontSize((current) => Math.max(10, current - 1))
  }

  function increaseFontSize() {
    setFontSize((current) => Math.min(24, current + 1))
  }

  if (!attachment) return null

  return (
    <aside className={`document-inspector-panel ${closing ? 'is-closing' : ''}`} style={{ width }} aria-label="Inspection du document">
      <header className="document-inspector-header">
        <div className="document-inspector-title">
          <strong title={filename}>{filename}</strong>
          <span>{extension}</span>
        </div>
        <div className="document-inspector-header-actions">
          <div className="document-zoom-controls" aria-label="Taille du texte">
            <button type="button" className="document-zoom-button document-type-button" aria-label="Réduire la taille du texte" title="Réduire la taille du texte" onClick={decreaseFontSize}>
              A-
            </button>
            <span className="document-zoom-value" aria-label="Taille actuelle du texte">{fontSize}px</span>
            <button type="button" className="document-zoom-button document-type-button" aria-label="Agrandir la taille du texte" title="Agrandir la taille du texte" onClick={increaseFontSize}>
              A+
            </button>
          </div>
          {canDownloadOriginal && (
            <a className="document-header-icon-action" href={`/api/attachments/${attachment.id}/content`} download aria-label="Télécharger le fichier original" title="Télécharger le fichier original">
              <img src="/assets/download.png" alt="" aria-hidden="true" />
            </a>
          )}
          <button type="button" className="document-close-button" aria-label="Fermer l'inspection du document" title="Fermer" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>
      </header>

      <div className="document-segmented-row">
        <div className="segmented-control" role="tablist" aria-label="Vues du document">
          <button type="button" role="tab" aria-selected={activeTab === 'original'} className={activeTab === 'original' ? 'active' : ''} onClick={() => setActiveTab('original')}>
            Original
          </button>
          <button type="button" role="tab" aria-selected={activeTab === 'detected'} className={activeTab === 'detected' ? 'active' : ''} onClick={() => setActiveTab('detected')}>
            Menaces ({matchCount})
          </button>
          <button type="button" role="tab" aria-selected={activeTab === 'secure'} className={activeTab === 'secure' ? 'active' : ''} onClick={() => setActiveTab('secure')}>
            Sécurisé
          </button>
        </div>
      </div>

      <div className="document-inspector-viewer">
        <div className="document-zoom-shell">
          <article className={pageClass} style={readerStyle}>
            {activeTab === 'original' && <OriginalDocumentView documentState={originalState} extractedText={inspectionState.text || target.extractedText} extractionLoading={inspectionState.loading} />}
            {activeTab === 'detected' && <InspectionDocumentView state={{ ...inspectionState, matches: visibleMatches, text: inspectionState.text || originalState.text || target.extractedText }} />}
            {activeTab === 'secure' && <SecureDocumentView state={secureState} />}
          </article>
        </div>
      </div>

      {activeTab === 'secure' && (
        <div className="document-secure-actionbar" aria-label="Actions de la version sécurisée">
          <button type="button" className="document-icon-action labeled" title={hasSecureText ? 'Copier la version sécurisée' : 'Version sécurisée indisponible'} aria-label="Copier la version sécurisée" disabled={!hasSecureText} onClick={copySecureVersion}>
            {copySucceeded ? <span className="check-icon" aria-hidden="true" /> : <CopyIcon />}
            <span>Copier</span>
          </button>
          <button type="button" className="document-icon-action labeled" title={hasSecureText ? 'Télécharger la version sécurisée' : 'Version sécurisée indisponible'} aria-label="Télécharger la version sécurisée" disabled={!hasSecureText} onClick={handleDownloadSecure}>
            <img src="/assets/download.png" alt="" aria-hidden="true" />
            <span>Télécharger</span>
          </button>
          <button type="button" className="document-icon-action primary labeled" title={hasSecureText ? 'Ajouter la version sécurisée aux pièces jointes' : 'Version sécurisée indisponible'} aria-label="Ajouter la version sécurisée aux pièces jointes" disabled={!hasSecureText} onClick={handleAttachSecureVersion}>
            <img src="/assets/share.png" alt="" aria-hidden="true" />
            <span>Partager</span>
          </button>
        </div>
      )}
    </aside>
  )
}

function CloseIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
      <path d="M18 6 6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function OriginalDocumentView({ documentState, extractedText, extractionLoading }) {
  if (documentState.loading) return <LoadingState label="Chargement du document…" />
  if (documentState.kind === 'pdf' && documentState.url) {
    return (
      <object className="document-pdf-viewer" data={documentState.url} type="application/pdf" aria-label="Aperçu PDF">
        <PdfFallback text={extractedText} />
      </object>
    )
  }
  if (documentState.kind === 'image' && documentState.url) return <img className="document-image-viewer" src={documentState.url} alt="Aperçu du document original" />
  if (documentState.kind === 'html' && documentState.html) return <div className="document-docx-preview" dangerouslySetInnerHTML={{ __html: documentState.html }} />
  const text = documentState.text || extractedText || ''
  if (text) return <EditorText text={text} className="document-original-code" />
  if (extractionLoading) return <LoadingState label="Extraction du texte en cours…" />
  const placeholder = documentState.status || EXTRACTION_UNAVAILABLE
  return <EditorText text={placeholder} className="document-original-code document-code-placeholder" renderLine={(line) => <span className="document-code-placeholder-line">{line}</span>} />
}

function PdfFallback({ text }) {
  if (!text) return <p>{PREVIEW_UNAVAILABLE}</p>
  return <EditorText text={text} className="document-original-code" />
}

function InspectionDocumentView({ state }) {
  const [selectedMatchId, setSelectedMatchId] = useState('')
  if (state.loading) return <LoadingState label="Analyse de sécurité en cours…" />
  if (state.error) return <p>{state.error}</p>
  if (!state.text && String(state.status).toUpperCase() === 'SUCCESS') return <p>Extraction réussie, mais aucun texte lisible n'a été retourné pour ce fichier.</p>
  if (!state.text && state.matches?.length) return <p>Le texte extrait du fichier n'a pas été retrouvé pour ces détections.</p>
  if (!state.text) return <p>L'extraction du texte n'est pas disponible.</p>

  const rows = lineRows(state.text, state.matches)
  function selectMatch(match) {
    const id = matchKey(match)
    setSelectedMatchId(id)
    document.querySelector(`[data-match-id="${CSS.escape(id)}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' })
    window.setTimeout(() => setSelectedMatchId((current) => (current === id ? '' : current)), 1400)
  }

  return (
    <div className="document-detected-layout">
      <DetectionIndex matches={state.matches} text={state.text} onSelect={selectMatch} />
      <div className="document-inspection-code">
        {rows.map((line) => (
          <div className="document-line" key={line.number}>
            <span className="document-line-number">{line.number}</span>
            <code>{renderHighlightedParts(line.parts, selectedMatchId)}</code>
          </div>
        ))}
      </div>
    </div>
  )
}

function SecureDocumentView({ state }) {
  if (state.loading) return <LoadingState label="Chargement de la version sécurisée…" />
  if (state.error) return <p>{state.error}</p>
  if (!state.text) {
    return (
      <div className="document-empty-state">
        <span aria-hidden="true">!</span>
        <strong>Version sécurisée indisponible</strong>
        <p>La version sécurisée est en cours de génération ou indisponible.</p>
      </div>
    )
  }
  return <EditorText text={state.text} className="document-secure-text" renderLine={renderSecureText} />
}

function LoadingState({ label }) {
  return (
    <div className="document-loading-state" role="status" aria-live="polite">
      <span className="document-spinner" aria-hidden="true" />
      <p>{label}</p>
    </div>
  )
}

function EditorText({ text, className, renderLine = (line) => line }) {
  const lines = String(text || '').split('\n')
  return (
    <pre className={className}>
      {lines.map((line, index) => (
        <div className="document-line" key={index}>
          <span className="document-line-number">{index + 1}</span>
          <code>{renderLine(line)}</code>
        </div>
      ))}
    </pre>
  )
}

function DetectionIndex({ matches, text, onSelect }) {
  if (!Array.isArray(matches) || matches.length === 0) return null
  return (
    <div className="document-threat-list" aria-label="Liste des menaces détectées">
      {matches.map((match, index) => (
        <button type="button" key={matchKey(match, index)} onClick={() => onSelect(match)}>
          <strong>{displaySeverity(match.severity)}</strong>
          <span>{displayTypeFr(match.type)}</span>
          <small>Ligne {lineNumberForMatch(text, match)}</small>
          <em>{contextForMatch(text, match)}</em>
        </button>
      ))}
    </div>
  )
}

function lineRows(text, matches) {
  const rows = String(text || '').split('\n')
  let cursor = 0
  return rows.map((line, index) => {
    const start = cursor
    const end = start + line.length
    cursor = end + 1
    const lineMatches = (matches || [])
      .filter((match) => Number.isInteger(match.start) && Number.isInteger(match.end))
      .filter((match) => match.end > start && match.start < end)
      .map((match) => ({
        ...match,
        start: Math.max(match.start, start) - start,
        end: Math.min(match.end, end) - start,
      }))
    return {
      number: index + 1,
      parts: splitOriginalText(line, lineMatches),
    }
  })
}

function renderHighlightedParts(parts, selectedMatchId) {
  return parts.map((part, index) => {
    if (part.kind !== 'mark') return <span key={index}>{part.text}</span>
    const id = matchKey(part.match)
    return (
      <mark
        className={`document-dlp-mark severity-${severityClass(part.match)} ${selectedMatchId === id ? 'is-selected' : ''}`}
        data-match-id={id}
        key={index}
        title={`${displayType(part.match?.type)} - ${severityClass(part.match)}`}
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
      maskedText: fileMaskedText(target),
      matches: Array.isArray(target.matches) ? target.matches : [],
      mode: target.requestedView || target.mode,
    }
  }
  return { attachment: target, extractedText: '', maskedText: fileMaskedText(target), matches: [], mode: 'original' }
}

function fileMaskedText(target) {
  const value = target?.attachment?.maskedText || target?.maskedText || ''
  return /^Pi[eè]ces jointes\s*:/i.test(String(value).trim()) ? '' : value
}

function normalizeMode(mode) {
  if (mode === 'inspect' || mode === 'detected') return 'detected'
  if (mode === 'secure') return 'secure'
  return 'original'
}

function initialMode(target) {
  return normalizeMode(target.mode)
}

function initialOriginalState() {
  return { error: '', html: '', kind: 'message', loading: false, status: 'Chargement du document…', text: '', url: '' }
}

function initialInspectionState(target) {
  return { error: '', loading: false, matches: target.matches, status: '', text: target.extractedText || '' }
}

function initialSecureState(target) {
  return { error: '', loading: false, status: '', text: target.maskedText || '' }
}

function filterMatchesForAttachment(matches, attachment) {
  if (!Array.isArray(matches)) return []
  const attachmentId = attachment?.id == null ? '' : String(attachment.id)
  const sourceNames = new Set([
    attachment?.filename,
    attachment?.name,
    attachment?.source,
  ].filter(Boolean).map((value) => String(value)))
  return matches.filter((match) => {
    if (match.attachmentId != null && attachmentId) return String(match.attachmentId) === attachmentId
    if (match.source && sourceNames.size > 0) return sourceNames.has(String(match.source))
    return !match.attachmentId && !match.source
  })
}

function severityClass(match) {
  return String(match?.severity || match?.level || 'medium').toLowerCase()
}

function displayType(type) {
  return String(type || 'donnée sensible').replaceAll('_', ' ')
}

function displayTypeFr(type) {
  const normalized = String(type || '').toLowerCase()
  const labels = {
    ip_address: 'Adresse IP',
    private_key: 'Clé privée',
    connection_string: 'Chaîne de connexion',
    openai_api_key: 'Clé API OpenAI',
    moroccan_cin: 'CIN',
    email: 'Adresse e-mail',
  }
  return labels[normalized] || displayType(type)
}

function displaySeverity(severity) {
  const normalized = String(severity || 'medium').toLowerCase()
  if (normalized === 'high') return 'Élevée'
  if (normalized === 'low') return 'Faible'
  return 'Moyenne'
}

function matchKey(match, fallback = '') {
  return String(match?.id || `${match?.attachmentId || ''}-${match?.source || ''}-${match?.start || 0}-${match?.end || 0}-${fallback}`)
}

function renderSecureText(text) {
  const value = String(text || '')
  const pattern = /\[([A-Z0-9_]+?)(?:_\d+)?\]/g
  const parts = []
  let cursor = 0
  value.replace(pattern, (placeholder, type, index) => {
    if (index > cursor) parts.push(<span key={`t-${index}`}>{value.slice(cursor, index)}</span>)
    parts.push(<span className="document-secure-placeholder" key={`p-${index}`}>{placeholder}</span>)
    cursor = index + placeholder.length
    return placeholder
  })
  if (cursor < value.length) parts.push(<span key="tail">{value.slice(cursor)}</span>)
  return parts
}

function contextForMatch(text, match) {
  const value = String(text || '')
  if (!Number.isInteger(match?.start) || !Number.isInteger(match?.end) || !value) return match?.placeholder || ''
  const line = lineTextForOffset(value, match.start)
  if (line.length <= 180) return line
  const localStart = Math.max(0, match.start - line.start)
  const start = Math.max(0, localStart - 60)
  return `${start > 0 ? '...' : ''}${line.text.slice(start, start + 180)}${start + 180 < line.text.length ? '...' : ''}`
}

function lineNumberForMatch(text, match) {
  if (Number.isInteger(match?.start) && text) return String(text || '').slice(0, match.start).split('\n').length
  if (Number.isInteger(match?.lineNumber) && match.lineNumber > 0) return match.lineNumber
  return 1
}

function lineTextForOffset(text, offset) {
  const value = String(text || '')
  const bounded = Math.max(0, Math.min(offset, value.length))
  const start = value.lastIndexOf('\n', bounded - 1) + 1
  const nextBreak = value.indexOf('\n', bounded)
  const end = nextBreak === -1 ? value.length : nextBreak
  return { start, text: value.slice(start, end) }
}

function isTextLike(extension, contentType = '') {
  const normalized = String(contentType).toLowerCase()
  return TEXT_EXTENSIONS.has(extension) || normalized.startsWith('text/') || normalized.includes('json') || normalized.includes('xml')
}

function isPdf(extension, contentType = '') {
  return extension === 'pdf' || String(contentType).toLowerCase().includes('pdf')
}

function isImage(extension, contentType = '') {
  return ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'tif', 'tiff'].includes(extension) || String(contentType).toLowerCase().startsWith('image/')
}

function isDocx(extension, contentType = '') {
  return extension === 'docx' || String(contentType).toLowerCase().includes('wordprocessingml.document')
}

async function previewStateFromBlob(blob, filename, contentType, fallbackText) {
  const extension = fileExtension(filename)
  if (blob && isDocx(extension, contentType)) {
    try {
      const result = await mammoth.convertToHtml({ arrayBuffer: await blob.arrayBuffer() })
      if (result.value) return { error: '', html: result.value, kind: 'html', loading: false, status: '', text: fallbackText || '', url: '' }
    } catch {
      return fallbackOriginalState(fallbackText, fallbackText ? '' : EXTRACTION_UNAVAILABLE)
    }
  }
  if (blob && isPdf(extension, contentType)) {
    return { error: '', html: '', kind: 'pdf', loading: false, status: '', text: fallbackText || '', url: URL.createObjectURL(blob) }
  }
  if (blob && isImage(extension, contentType)) {
    return { error: '', html: '', kind: 'image', loading: false, status: '', text: fallbackText || '', url: URL.createObjectURL(blob) }
  }
  if (blob && isTextLike(extension, contentType)) {
    return { error: '', html: '', kind: 'text', loading: false, status: '', text: await blob.text(), url: '' }
  }
  return fallbackOriginalState(fallbackText, fallbackText ? PREVIEW_UNAVAILABLE : EXTRACTION_UNAVAILABLE)
}

function fallbackOriginalState(text, status = PREVIEW_UNAVAILABLE) {
  return { error: '', html: '', kind: 'text', loading: false, status: text ? '' : status, text: text || '', url: '' }
}

function fileExtension(filename) {
  const match = String(filename || '').match(/\.([a-z0-9]+)$/i)
  return match ? match[1].toLowerCase() : ''
}

function filenameWithoutExtension(filename) {
  return String(filename || 'document').replace(/\.[^.]+$/, '')
}

function attachmentIdentity(attachment) {
  return String(attachment?.id || attachment?.filename || attachment?.name || '')
}

function downloadText(filename, text) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
