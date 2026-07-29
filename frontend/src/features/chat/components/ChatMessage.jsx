import { memo } from 'react'
import { CopyIcon } from '../../../components/common/icons'
import ModelLogo from '../../models/components/ModelLogo'
import MarkdownContent from './MarkdownContent'
import { cleanModelName, modelCardMeta } from '../../../utils/modelMetadata'
import { detectTextDirection } from '../utils/markdown'

function ChatMessage({ copiedKey, message, fallbackModelName, onCopy, setCopiedKey }) {
  const isUser = message.role === 'USER'
  const modelName = cleanModelName(message.modelDisplayName || fallbackModelName, message.modelAlias)
  const isWaiting = !isUser && message.status === 'EN_COURS' && !message.content
  const isFailed = !isUser && message.status === 'ECHEC'
  const messageCopyKey = `message-${message.id}`
  const promptCopyKey = `prompt-${message.id}`
  const textDirection = detectTextDirection(message.content || '')

  async function copyResponse(copyKey = messageCopyKey) {
    const success = await onCopy(message.content || '')
    if (!success) return
    markCopied(copyKey, setCopiedKey)
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
                <button type="button" aria-label="Copier la réponse" onClick={copyResponse}>
                  {copiedKey === messageCopyKey ? <span>Copié</span> : <CopyIcon />}
                </button>
              </div>
            )}
          </>
        )}
      </div>
      {isUser && message.content && (
        <div className="message-actions user-actions">
          <button type="button" aria-label="Copier mon prompt" onClick={() => copyResponse(promptCopyKey)}>
            {copiedKey === promptCopyKey ? <span>Copié</span> : <CopyIcon />}
          </button>
        </div>
      )}
    </article>
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
  return copiedKey === `message-${messageId}` || copiedKey === `prompt-${messageId}`
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
