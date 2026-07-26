import { DownArrowIcon } from '../../../components/common/icons'
import ChatMessage from './ChatMessage'

export default function ChatThread({
  activeModelName,
  activeModelAlias,
  bottomRef,
  copiedKey,
  goToBottom,
  hasActiveMessages,
  isComposerTransitioning,
  isLastBlockVisible,
  messages,
  messagesRef,
  onCopy,
  onMessagesScroll,
  setCopiedKey,
}) {
  return (
    <>
      <section
        className="messages"
        ref={messagesRef}
        onScroll={onMessagesScroll}
        aria-live="polite"
      >
        {(!hasActiveMessages || isComposerTransitioning) && (
          <div className={`welcome-stack ${hasActiveMessages ? 'leaving' : ''}`}>
            <div className="empty-state">
              <h2>Comment puis-je vous aider ?</h2>
            </div>
          </div>
        )}

        {messages.map((item) => (
          <ChatMessage
            copiedKey={copiedKey}
            fallbackModelName={activeModelName || activeModelAlias}
            key={item.id}
            message={item}
            onCopy={onCopy}
            setCopiedKey={setCopiedKey}
          />
        ))}
        <div ref={bottomRef} className="bottom-anchor" />
      </section>

      {!isLastBlockVisible && hasActiveMessages && (
        <button className="go-bottom-button" type="button" onClick={goToBottom}>
          <DownArrowIcon />
        </button>
      )}
    </>
  )
}
