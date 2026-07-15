import { useEffect, useMemo, useState } from 'react'
import './App.css'

const API_BASE_URL = 'http://localhost:8080/api'

const MODEL_LABELS = {
  'secure-groq': 'Groq',
  'secure-gemini': 'Gemini',
  'secure-mistral': 'Mistral',
  'secure-gpt': 'OpenAI',
}

function App() {
  const [models, setModels] = useState([])
  const [selectedModel, setSelectedModel] = useState('')
  const [message, setMessage] = useState('')
  const [messages, setMessages] = useState([])
  const [error, setError] = useState('')
  const [isLoadingModels, setIsLoadingModels] = useState(true)
  const [isSending, setIsSending] = useState(false)

  const canSend = useMemo(
    () => selectedModel && message.trim() && !isSending,
    [selectedModel, message, isSending],
  )

  useEffect(() => {
    async function loadModels() {
      try {
        setError('')
        const response = await fetch(`${API_BASE_URL}/models`)

        if (!response.ok) {
          throw new Error(`Backend returned ${response.status}`)
        }

        const data = await response.json()

        if (!Array.isArray(data) || data.length === 0) {
          throw new Error('No model available from backend')
        }

        setModels(data)
        setSelectedModel(data[0])
      } catch {
        setError('Impossible de charger les modeles. Verifiez que Spring Boot tourne sur http://localhost:8080.')
      } finally {
        setIsLoadingModels(false)
      }
    }

    loadModels()
  }, [])

  async function handleSubmit(event) {
    event.preventDefault()

    const prompt = message.trim()

    if (!prompt) {
      setError('Le message ne peut pas etre vide.')
      return
    }

    if (!selectedModel) {
      setError('Aucun modele disponible.')
      return
    }

    const activeModel = selectedModel

    setMessages((currentMessages) => [
      ...currentMessages,
      {
        id: crypto.randomUUID(),
        role: 'user',
        content: prompt,
        model: activeModel,
      },
    ])
    setMessage('')
    setError('')
    setIsSending(true)

    try {
      const response = await fetch(`${API_BASE_URL}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: activeModel,
          message: prompt,
        }),
      })

      if (!response.ok) {
        throw new Error(`Backend returned ${response.status}`)
      }

      const data = await response.json()

      if (!data.answer) {
        throw new Error('Missing answer in backend response')
      }

      setMessages((currentMessages) => [
        ...currentMessages,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: data.answer,
          model: data.model || activeModel,
        },
      ])
    } catch {
      setError('La requete a echoue. Verifiez React, Spring Boot, LiteLLM et le provider selectionne.')
      setMessages((currentMessages) => [
        ...currentMessages,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: 'Je ne peux pas joindre le backend pour le moment.',
          model: activeModel,
          isError: true,
        },
      ])
    } finally {
      setIsSending(false)
    }
  }

  function handleKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      event.currentTarget.form?.requestSubmit()
    }
  }

  return (
    <div className="chat-shell">
      <main className={`workspace ${messages.length > 0 ? 'has-messages' : ''}`}>
        {messages.length === 0 ? (
          <section className="hero-composer" aria-labelledby="home-title">
            <h1 id="home-title">Comment puis-je vous aider ?</h1>
            <PromptBox
              canSend={canSend}
              isLoadingModels={isLoadingModels}
              isSending={isSending}
              message={message}
              models={models}
              onKeyDown={handleKeyDown}
              onMessageChange={setMessage}
              onModelChange={setSelectedModel}
              onSubmit={handleSubmit}
              selectedModel={selectedModel}
            />
          </section>
        ) : (
          <>
            <section className="conversation" aria-live="polite">
              {messages.map((chatMessage) => (
                <article
                  className={`message ${chatMessage.role === 'user' ? 'message-user' : 'message-assistant'}`}
                  key={chatMessage.id}
                >
                  {chatMessage.role === 'assistant' && (
                    <div className="message-avatar" aria-hidden="true">S</div>
                  )}
                  <div className={`message-content ${chatMessage.isError ? 'message-error' : ''}`}>
                    <div className="message-meta">
                      {chatMessage.role === 'user'
                        ? 'Vous'
                        : MODEL_LABELS[chatMessage.model] || chatMessage.model}
                    </div>
                    <p>{chatMessage.content}</p>
                  </div>
                </article>
              ))}

              {isSending && (
                <article className="message message-assistant">
                  <div className="message-avatar" aria-hidden="true">S</div>
                  <div className="message-content">
                    <div className="typing">
                      <span></span>
                      <span></span>
                      <span></span>
                    </div>
                  </div>
                </article>
              )}
            </section>

            <section className="bottom-composer">
              <PromptBox
                canSend={canSend}
                isLoadingModels={isLoadingModels}
                isSending={isSending}
                message={message}
                models={models}
                onKeyDown={handleKeyDown}
                onMessageChange={setMessage}
                onModelChange={setSelectedModel}
                onSubmit={handleSubmit}
                selectedModel={selectedModel}
              />
            </section>
          </>
        )}

        {error && (
          <div className="toast-error" role="alert">
            {error}
          </div>
        )}
      </main>
    </div>
  )
}

function PromptBox({
  canSend,
  isLoadingModels,
  isSending,
  message,
  models,
  onKeyDown,
  onMessageChange,
  onModelChange,
  onSubmit,
  selectedModel,
}) {
  return (
    <form className="prompt-bar" onSubmit={onSubmit}>
      <textarea
        aria-label="Prompt"
        disabled={isSending}
        onChange={(event) => onMessageChange(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Poser une question"
        rows={1}
        value={message}
      />
      <select
        aria-label="Modele"
        className="model-select"
        disabled={isLoadingModels || isSending}
        onChange={(event) => onModelChange(event.target.value)}
        value={selectedModel}
      >
        {isLoadingModels && <option>Chargement</option>}
        {!isLoadingModels &&
          models.map((model) => (
            <option key={model} value={model}>
              {MODEL_LABELS[model] || model}
            </option>
          ))}
      </select>
      <button className="send-button" type="submit" disabled={!canSend}>
        {isSending ? '...' : 'Envoyer'}
      </button>
    </form>
  )
}

export default App
