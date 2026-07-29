import { StopIcon } from '../../../components/common/icons'

export default function ChatComposer({
  canSend,
  composerRef,
  draft,
  hasActiveMessages,
  isComposerMaxed,
  isGenerating,
  onDraftChange,
  onKeyDown,
  onSubmit,
  onStop,
  textareaRef,
}) {
  return (
    <form
      ref={composerRef}
      className={`composer ${hasActiveMessages ? 'composer-bottom' : 'composer-welcome composer-center'} ${isComposerMaxed ? 'composer-maxed' : ''} ${isGenerating ? 'is-generating' : ''}`}
      onSubmit={onSubmit}
    >
      <textarea
        ref={textareaRef}
        aria-disabled={isGenerating}
        onChange={(event) => onDraftChange(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Poser une question"
        readOnly={isGenerating}
        rows={1}
        value={draft}
      />
      <button
        className={isGenerating ? 'stop-button' : ''}
        type={isGenerating ? 'button' : 'submit'}
        aria-label={isGenerating ? 'Interrompre la génération' : 'Envoyer'}
        title={isGenerating ? 'Interrompre la génération' : 'Envoyer'}
        disabled={!isGenerating && !canSend}
        onClick={isGenerating ? onStop : undefined}
      >
        {isGenerating ? <StopIcon /> : <span className="send-arrow" aria-hidden="true"></span>}
      </button>
    </form>
  )
}
