# LiteLLM

This folder contains the LiteLLM proxy configuration used by Secure LLM Gateway.

LiteLLM exposes OpenAI-compatible chat completions on:

```text
http://localhost:4000/v1/chat/completions
```

## Model Aliases

Current aliases in `config.yaml`:

| Alias | Provider model | Required key |
| --- | --- | --- |
| `secure-gpt` | `openai/gpt-4o-mini` | `OPENAI_API_KEY` |
| `secure-groq` | `groq/llama-3.1-8b-instant` | `GROQ_API_KEY` |
| `secure-gemini` | `gemini/gemini-2.5-flash` | `GEMINI_API_KEY` |
| `secure-mistral` | `mistral/mistral-small-latest` | `MISTRAL_API_KEY` |

`secure-claude` is present as a commented optional block. Uncomment it only when `ANTHROPIC_API_KEY` is available.

## Secrets

Secrets are loaded from the root `.env` file through environment variables. Do not put real API keys in `config.yaml`.

The proxy is protected by:

```text
Authorization: Bearer <LITELLM_MASTER_KEY>
```

The default local value from `.env.example` is:

```text
sk-local-litellm
```

## Start LiteLLM

From the project root:

```powershell
docker compose up -d litellm
```

To start it with PostgreSQL too:

```powershell
docker compose up -d postgres litellm
```

## Test With PowerShell

```powershell
curl.exe -X POST http://localhost:4000/v1/chat/completions `
  -H "Content-Type: application/json" `
  -H "Authorization: Bearer sk-local-litellm" `
  -d "@litellm/examples/request-groq.json"
```

To test another provider, change only the JSON body model alias.

Example:

```json
{
  "model": "secure-gemini",
  "messages": [
    {
      "role": "user",
      "content": "Bonjour"
    }
  ]
}
```

## Logs

From the project root:

```powershell
docker compose logs -f litellm
```
