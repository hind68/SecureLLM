import { Fragment, memo, useMemo, useState } from 'react'
import { CheckIcon, CopyIcon } from '../../../components/common/icons'
import ModelLogo from '../../models/components/ModelLogo'
import MarkdownContent from './MarkdownContent'
import { cleanModelName, modelCardMeta } from '../../../utils/modelMetadata'
import { dlpUserMessage } from '../utils/dlpErrors'
import { splitMaskedTextByPlaceholders, normalizeSensitiveSpans, splitTextBySpans } from '../utils/dlpViews'
import { detectTextDirection } from '../utils/markdown'

function ChatMessage({ copiedKey, message, fallbackModelName, onCopy, setCopiedKey }) {
  const isUser = message.role === 'USER'
  const isDlpBlocked = message.status === 'DLP_BLOCKED'
  const modelName = cleanModelName(message.modelDisplayName || fallbackModelName, message.modelAlias)
  const isWaiting = !isUser && message.status === 'EN_COURS' && !message.content
  const isFailed = !isUser && message.status === 'ECHEC'
  const messageCopyKey = `message-${message.id}`
  const promptCopyKey = `prompt-${message.id}`
  const alertCopyKey = `dlp-alert-${message.id}`
  const safeCopyKey = `dlp-safe-${message.id}`
  const isMessageCopied = copiedKey === messageCopyKey
  const isPromptCopied = copiedKey === promptCopyKey
  const isAlertCopied = copiedKey === alertCopyKey
  const isSafeCopied = copiedKey === safeCopyKey
  const textDirection = detectTextDirection(message.content || '')

  async function copyResponse(copyKey = messageCopyKey, text = message.content || '') {
    const success = await onCopy(text)
    if (!success) return
    markCopied(copyKey, setCopiedKey)
  }

  if (isUser && isDlpBlocked) {
    return (
      <Fragment>
        <article className="message user">
          <div className="bubble">
            <div className="user-message-wrap">
              <p>{message.content}</p>
            </div>
          </div>
          {message.content && (
            <div className="message-actions user-actions">
              <button
                type="button"
                aria-label={isPromptCopied ? 'Copié' : 'Copier mon prompt'}
                title={isPromptCopied ? 'Copié' : 'Copier mon prompt'}
                onClick={() => copyResponse(promptCopyKey)}
              >
                {isPromptCopied ? <CheckIcon /> : <CopyIcon />}
              </button>
            </div>
          )}
        </article>
        <article className="message assistant dlp-blocked-response">
          <div className="bubble">
            <DlpBlockedMessage
              alertCopied={isAlertCopied}
              copied={isSafeCopied}
              message={message}
              onCopyAlert={(text) => copyResponse(alertCopyKey, text)}
              onCopySafe={(text) => copyResponse(safeCopyKey, text)}
            />
          </div>
        </article>
      </Fragment>
    )
  }

  return (
    <article className={`message ${isUser ? 'user' : 'assistant'}`}>
      <div className="bubble">
        {!isUser && <AssistantMessageHeader modelAlias={message.modelAlias} modelName={modelName} />}
        {isUser ? (
          <div className="user-message-wrap">
            <p>{message.content}</p>
          </div>
        ) : isWaiting ? (
          <TypingIndicator />
        ) : isFailed ? (
          <ErrorMessage content={message.content || 'La génération a échoué.'} />
        ) : (
          <>
            <MarkdownContent
              content={message.content || ''}
              copiedKey={copiedKey}
              direction={textDirection}
              onCopy={onCopy}
              setCopiedKey={setCopiedKey}
            />
            {message.content && (
              <div className="message-actions">
                <button
                  type="button"
                  aria-label={isMessageCopied ? 'Copié' : 'Copier la réponse'}
                  title={isMessageCopied ? 'Copié' : 'Copier la réponse'}
                  onClick={() => copyResponse()}
                >
                  {isMessageCopied ? <CheckIcon /> : <CopyIcon />}
                </button>
              </div>
            )}
          </>
        )}
      </div>
      {isUser && !isDlpBlocked && message.content && (
        <div className="message-actions user-actions">
          <button
            type="button"
            aria-label={isPromptCopied ? 'Copié' : 'Copier mon prompt'}
            title={isPromptCopied ? 'Copié' : 'Copier mon prompt'}
            onClick={() => copyResponse(promptCopyKey)}
          >
            {isPromptCopied ? <CheckIcon /> : <CopyIcon />}
          </button>
        </div>
      )}
    </article>
  )
}

function DlpBlockedMessage({ alertCopied, copied, message, onCopyAlert, onCopySafe }) {
  const [showSafe, setShowSafe] = useState(false)
  const [showOriginal, setShowOriginal] = useState(false)
  const matches = useMemo(() => message.dlpMatches || [], [message.dlpMatches])
  const safeText = message.dlpMaskedText || ''
  const originalText = message.dlpOriginalText || ''
  const hasOriginal = Boolean(originalText)
  const summary = dlpUserMessage({
    code: 'DLP_BLOCKED',
    detectedTypes: message.dlpDetectedTypes,
    highestSeverity: message.dlpHighestSeverity,
  })
  const safeParts = useMemo(
    () => splitMaskedTextByPlaceholders(safeText, matches.map((match) => match.placeholder)),
    [matches, safeText],
  )
  const originalParts = useMemo(
    () => splitTextBySpans(originalText, normalizeSensitiveSpans(originalText, matches)),
    [matches, originalText],
  )

  return (
    <div className="dlp-alert" role="alert">
      <div className="dlp-alert-heading">
        <div className="dlp-alert-title-row">
          <SecurityIcon />
          <div>
            <strong>Message bloqué : Donnée sensible détectée</strong>
            <p>{summary}</p>
          </div>
        </div>
        <button
          type="button"
          aria-label={alertCopied ? 'Copié' : 'Copier le message de sécurité'}
          title={alertCopied ? 'Copié' : 'Copier le message de sécurité'}
          onClick={() => onCopyAlert(summary)}
        >
          {alertCopied ? <CheckIcon /> : <CopyIcon />}
        </button>
      </div>
      {showSafe && (
        <section className="dlp-detail-panel" id={`dlp-safe-${message.id}`}>
          <div className="dlp-detail-heading">
            <span>Version sécurisée</span>
            <button
              type="button"
              aria-label={copied ? 'Copié' : 'Copier la version sécurisée'}
              title={copied ? 'Copié' : 'Copier la version sécurisée'}
              onClick={() => onCopySafe(safeText)}
            >
              {copied ? <CheckIcon /> : <CopyIcon />}
            </button>
          </div>
          <HighlightedPre parts={safeParts} />
          <DetectionList matches={matches} />
        </section>
      )}
      {showOriginal && hasOriginal && (
        <section className="dlp-detail-panel sensitive" id={`dlp-original-${message.id}`}>
          <p className="dlp-sensitive-warning">Cette vue affiche les données sensibles que vous avez saisies.</p>
          <HighlightedPre parts={originalParts} />
        </section>
      )}
      <div className="dlp-alert-actions">
        <button
          type="button"
          aria-controls={`dlp-safe-${message.id}`}
          aria-expanded={showSafe}
          onClick={() => setShowSafe((current) => !current)}
        >
          {showSafe ? 'Masquer la version sécurisée' : 'Voir la version sécurisée'}
        </button>
        <button
          type="button"
          aria-controls={`dlp-original-${message.id}`}
          aria-expanded={showOriginal}
          disabled={!hasOriginal}
          title={hasOriginal ? undefined : 'Disponible uniquement avant actualisation'}
          onClick={() => setShowOriginal((current) => !current)}
        >
          {showOriginal ? 'Masquer la localisation' : 'Localiser dans mon message'}
        </button>
      </div>
    </div>
  )
}

function SecurityIcon() {
  return (
    <svg className="dlp-alert-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 3.1 5.5 5.4v5.2c0 4.2 2.6 8 6.5 9.4 3.9-1.4 6.5-5.2 6.5-9.4V5.4L12 3.1Zm0 2.1 4.6 1.6v3.8c0 3-1.8 5.8-4.6 7-2.8-1.2-4.6-4-4.6-7V6.8L12 5.2Z" />
    </svg>
  )
}

function HighlightedPre({ parts }) {
  return (
    <pre className="dlp-code-view"><code>
      {parts.map((part, index) => (
        part.kind === 'mark'
          ? <mark key={index} title={part.match?.type}>{part.text}</mark>
          : <span key={index}>{part.text}</span>
      ))}
    </code></pre>
  )
}

function DetectionList({ matches }) {
  if (!matches.length) return null
  return (
    <ul className="dlp-detections">
      {matches.map((match, index) => (
        <li key={`${match.placeholder || match.type}-${index}`}>
          <span>{match.placeholder}</span>
          <small>{match.type}{match.lineNumber ? ` · ligne ${match.lineNumber}` : ''}</small>
        </li>
      ))}
    </ul>
  )
}

function AssistantMessageHeader({ modelAlias, modelName }) {
  const meta = modelCardMeta(modelAlias)

  return (
    <div className="assistant-header">
      <ModelLogo alias={modelAlias} className={`assistant-logo ${meta.tone}`} fallback={meta.initials} />
      <div className="assistant-meta">
        <strong>{modelName}</strong>
      </div>
    </div>
  )
}

function ErrorMessage({ content }) {
  return (
    <div className="assistant-error" role="alert">
      <strong>Impossible de générer la réponse</strong>
      <p>{content}</p>
    </div>
  )
}

function TypingIndicator() {
  return (
    <div className="typing-indicator" aria-label="Réponse en cours">
      <span></span>
      <span></span>
      <span></span>
    </div>
  )
}

function markCopied(copyKey, setCopiedKey) {
  setCopiedKey(copyKey)
  window.setTimeout(() => setCopiedKey((current) => (current === copyKey ? '' : current)), 1500)
}

function isCopyStateRelevant(copiedKey, messageId) {
  return (
    copiedKey === `message-${messageId}` ||
    copiedKey === `prompt-${messageId}` ||
    copiedKey === `dlp-alert-${messageId}` ||
    copiedKey === `dlp-safe-${messageId}`
  )
}

function areChatMessagesEqual(previous, next) {
  const previousMessage = previous.message
  const nextMessage = next.message
  const sameStableProps = (
    previousMessage === nextMessage &&
    previous.fallbackModelName === next.fallbackModelName &&
    previous.onCopy === next.onCopy &&
    previous.setCopiedKey === next.setCopiedKey
  )

  if (!sameStableProps) return false
  if (previous.copiedKey === next.copiedKey) return true

  const wasCopyRelevant = isCopyStateRelevant(previous.copiedKey, previousMessage.id)
  const isCopyRelevant = isCopyStateRelevant(next.copiedKey, nextMessage.id)

  return !wasCopyRelevant && !isCopyRelevant
}

export default memo(ChatMessage, areChatMessagesEqual)
