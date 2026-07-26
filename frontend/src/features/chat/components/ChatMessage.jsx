import { CopyIcon } from '../../../components/common/icons'
import ModelLogo from '../../models/components/ModelLogo'
import MarkdownContent from './MarkdownContent'
import { cleanModelName, modelCardMeta } from '../../../utils/modelMetadata'
import { detectTextDirection } from '../../../utils/markdown'

export default function ChatMessage({ copiedKey, message, fallbackModelName, onCopy, setCopiedKey }) {
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
          <ErrorMessage content={message.content || 'La generation a echoue.'} />
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
                <button type="button" aria-label="Copier la reponse" onClick={copyResponse}>
                  {copiedKey === messageCopyKey ? <span>Copie</span> : <CopyIcon />}
                </button>
              </div>
            )}
          </>
        )}
      </div>
      {isUser && message.content && (
        <div className="message-actions user-actions">
          <button type="button" aria-label="Copier mon prompt" onClick={() => copyResponse(promptCopyKey)}>
            {copiedKey === promptCopyKey ? <span>Copie</span> : <CopyIcon />}
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
      <strong>Impossible de generer la reponse</strong>
      <p>{content}</p>
    </div>
  )
}

function TypingIndicator() {
  return (
    <div className="typing-indicator" aria-label="Reponse en cours">
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
