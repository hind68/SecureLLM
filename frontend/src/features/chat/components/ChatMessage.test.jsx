import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import ChatMessage from './ChatMessage'

describe('ChatMessage', () => {
  it('renders a persisted DLP block as a final error without loading dots', () => {
    const html = renderToStaticMarkup(
      <ChatMessage
        copiedKey=""
        fallbackModelName="GPT"
        message={{
          id: 42,
          role: 'USER',
          status: 'DLP_BLOCKED',
          content: 'Ma CIN est AB123456',
          dlpOriginalText: 'Ma CIN est AB123456',
          dlpMaskedText: 'Ma CIN est [MOROCCAN_CIN_1]',
          dlpHighestSeverity: 'HIGH',
          dlpDetectedTypes: ['moroccan_cin'],
          dlpMatches: [{ type: 'moroccan_cin', start: 10, end: 18, lineNumber: 1, placeholder: '[MOROCCAN_CIN_1]' }],
        }}
        onCopy={vi.fn()}
        setCopiedKey={vi.fn()}
      />,
    )

    expect(html).toContain('Votre message a été bloqué')
    expect(html).toContain('Ma CIN est AB123456')
    expect(html).toContain('Une donnée sensible de type CIN a été détectée.')
    expect(html).toContain('Copier mon prompt')
    expect(html).toContain('Copier le message de sécurité')
    expect(html).toContain('Voir la version sécurisée')
    expect(html).toContain('message user')
    expect(html).toContain('message assistant dlp-blocked-response')
    expect(html).not.toContain('disabled')
    expect(html).not.toContain('typing-indicator')
  })

  it('shows copied confirmation for the DLP alert copy button', () => {
    const html = renderToStaticMarkup(
      <ChatMessage
        copiedKey="dlp-alert-42"
        fallbackModelName="GPT"
        message={{
          id: 42,
          role: 'USER',
          status: 'DLP_BLOCKED',
          content: 'Ma CIN est AB123456',
          dlpOriginalText: 'Ma CIN est AB123456',
          dlpMaskedText: 'Ma CIN est [MOROCCAN_CIN_1]',
          dlpHighestSeverity: 'HIGH',
          dlpDetectedTypes: ['moroccan_cin'],
          dlpMatches: [{ type: 'moroccan_cin', start: 10, end: 18, lineNumber: 1, placeholder: '[MOROCCAN_CIN_1]' }],
        }}
        onCopy={vi.fn()}
        setCopiedKey={vi.fn()}
      />,
    )

    expect(html).toContain('aria-label="Copié"')
    expect(html).toContain('check-icon')
  })

  it('renders a reloaded DLP block with masked content and disabled original localization', () => {
    const html = renderToStaticMarkup(
      <ChatMessage
        copiedKey=""
        fallbackModelName="GPT"
        message={{
          id: 43,
          role: 'USER',
          status: 'DLP_BLOCKED',
          content: 'Ma CIN est [MOROCCAN_CIN_1]',
          dlpMaskedText: 'Ma CIN est [MOROCCAN_CIN_1]',
          dlpHighestSeverity: 'HIGH',
          dlpDetectedTypes: ['moroccan_cin'],
          dlpMatches: [{ type: 'moroccan_cin', start: 10, end: 18, lineNumber: 1, placeholder: '[MOROCCAN_CIN_1]' }],
        }}
        onCopy={vi.fn()}
        setCopiedKey={vi.fn()}
      />,
    )

    expect(html).toContain('Ma CIN est [MOROCCAN_CIN_1]')
    expect(html).not.toContain('AB123456')
    expect(html).toContain('disabled')
  })

  it('shows copied confirmation only for the copied assistant message', () => {
    const html = renderToStaticMarkup(
      <ChatMessage
        copiedKey="message-7"
        fallbackModelName="GPT"
        message={{
          id: 7,
          role: 'ASSISTANT',
          status: 'TERMINE',
          content: 'Réponse',
          modelAlias: 'secure-gpt',
        }}
        onCopy={vi.fn()}
        setCopiedKey={vi.fn()}
      />,
    )

    expect(html).toContain('aria-label="Copié"')
    expect(html).toContain('check-icon')
    expect(html).not.toContain('copy-icon')
  })
})
