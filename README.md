# Secure LLM Gateway

Secure LLM Gateway is an academic/internship project for designing a controlled gateway for using Large Language Models in a banking environment.

## Current Phase

Phase 1 is a LiteLLM proof of concept:

```text
Postman / curl -> LiteLLM Proxy -> OpenAI, Groq, Gemini, or Mistral provider -> Response
```

The goal is to prove that the team can call multiple LLM providers through LiteLLM using a shared local Docker setup.

## LiteLLM Providers

The current LiteLLM configuration exposes active aliases for OpenAI, Groq, Gemini, and Mistral, plus a commented optional alias for Claude:

| Alias | Provider | Provider model |
| --- | --- | --- |
| `secure-gpt` | OpenAI | `openai/gpt-4o-mini` |
| `secure-groq` | Groq | `groq/llama-3.1-8b-instant` |
| `secure-gemini` | Google Gemini | `gemini/gemini-2.5-flash` |
| `secure-claude` | Anthropic Claude | `anthropic/claude-3-5-sonnet-20241022` |
| `secure-mistral` | Mistral | `mistral/mistral-small-latest` |

`secure-claude` is still commented in `litellm/config.yaml`. Uncomment it only after adding `ANTHROPIC_API_KEY` to `.env`.

To choose a provider, change only the `model` field in the request body.

OpenAI example:

```json
{
  "model": "secure-gpt",
  "messages": [
    {
      "role": "user",
      "content": "Bonjour"
    }
  ]
}
```

Groq example:

```json
{
  "model": "secure-groq",
  "messages": [
    {
      "role": "user",
      "content": "Bonjour"
    }
  ]
}
```

Gemini example:

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

Mistral example:

```json
{
  "model": "secure-mistral",
  "messages": [
    {
      "role": "user",
      "content": "Bonjour"
    }
  ]
}
```

## Planned Architecture

Future phases will expand the gateway with:

- React frontend
- More Spring Boot backend features
- LiteLLM orchestration/proxy layer
- PostgreSQL database
- Authentication and roles
- Prompt analysis
- Sensitive data masking/blocking
- Audit logs and request history

This repository currently contains a first minimal Spring Boot backend plus placeholders for the frontend and database.

## Prerequisites

- Git
- Docker Desktop
- An OpenAI API key for `secure-gpt`
- A Groq API key for `secure-groq`
- A Gemini API key for `secure-gemini`
- A Mistral API key for `secure-mistral`
- Optional: an Anthropic API key if `secure-claude` is enabled

## Setup

1. Clone the repository.
2. Copy `.env.example` to `.env`.
3. Put your real provider API keys in `.env`:

   ```env
   OPENAI_API_KEY=sk-your-real-key
   GROQ_API_KEY=gsk-your-real-key
   GEMINI_API_KEY=your-gemini-key
   ANTHROPIC_API_KEY=your-anthropic-key
   MISTRAL_API_KEY=your-mistral-key
   LITELLM_MASTER_KEY=sk-local-litellm
   LITELLM_PORT=4000
   ```

4. Start LiteLLM:

   ```bash
   docker compose up -d litellm
   ```

5. Test LiteLLM with curl:

   ```bash
   curl -X POST http://localhost:4000/v1/chat/completions \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer sk-local-litellm" \
     -d @litellm/examples/request-openai.json
   ```

   To test Groq instead:

   ```bash
   curl -X POST http://localhost:4000/v1/chat/completions \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer sk-local-litellm" \
     -d @litellm/examples/request-groq.json
   ```

   On Windows PowerShell:

   ```powershell
   curl.exe -X POST http://localhost:4000/v1/chat/completions `
     -H "Content-Type: application/json" `
     -H "Authorization: Bearer sk-local-litellm" `
     -d "@litellm/examples/request-openai.json"
   ```

   To test Groq instead:

   ```powershell
   curl.exe -X POST http://localhost:4000/v1/chat/completions `
     -H "Content-Type: application/json" `
     -H "Authorization: Bearer sk-local-litellm" `
     -d "@litellm/examples/request-groq.json"
   ```

6. You can also test manually in Postman:

   - Method: `POST`
   - URL: `http://localhost:4000/v1/chat/completions`
   - Header: `Content-Type: application/json`
   - Header: `Authorization: Bearer sk-local-litellm`
   - Body type: `raw` / `JSON`
   - Body:

   ```json
   {
     "model": "secure-gpt",
     "messages": [
       {
         "role": "user",
         "content": "Bonjour, est-ce que LiteLLM fonctionne ?"
       }
     ]
   }
   ```

## Expected Result

The test should return a JSON response from LiteLLM containing the model answer for the selected alias.

## Spring Boot Backend

The first backend implementation lives in `backend/`. It exposes a small REST API on port `8080` and forwards chat requests to LiteLLM.

Run LiteLLM from the project root first:

```bash
docker compose up -d litellm
```

In IntelliJ, open the backend run configuration and add this environment variable:

```env
LITELLM_MASTER_KEY=your-local-litellm-master-key
```

Use the same value that is configured for LiteLLM. Do not commit the real value.

Then run the Spring Boot application from:

```text
backend/src/main/java/com/example/backend/BackendApplication.java
```

Test the backend:

```bash
curl http://localhost:8080/api/health
```

```bash
curl http://localhost:8080/api/models
```

```bash
curl -X POST http://localhost:8080/api/chat \
  -H "Content-Type: application/json" \
  -d "{\"model\":\"secure-groq\",\"message\":\"Bonjour, reponds en une phrase.\"}"
```

On Windows PowerShell:

```powershell
curl.exe http://localhost:8080/api/health
curl.exe http://localhost:8080/api/models
curl.exe -X POST http://localhost:8080/api/chat `
  -H "Content-Type: application/json" `
  -d "{\"model\":\"secure-groq\",\"message\":\"Bonjour, reponds en une phrase.\"}"
```

## Useful Commands

Start LiteLLM:

```bash
docker compose up -d litellm
```

Stop LiteLLM:

```bash
docker compose down
```

View logs:

```bash
docker compose logs -f litellm
```

## Troubleshooting

### Docker is not running

Start Docker Desktop, then run `docker compose up -d litellm` again.

### Port 4000 is already used

Change `LITELLM_PORT` in `.env`, for example:

```env
LITELLM_PORT=4001
```

Then call the matching port in curl or Postman.

### Missing API key

Make sure `.env` exists and contains the key for the provider you are testing:

```env
OPENAI_API_KEY=sk-your-real-key
GROQ_API_KEY=gsk-your-real-key
GEMINI_API_KEY=your-gemini-key
ANTHROPIC_API_KEY=your-anthropic-key
MISTRAL_API_KEY=your-mistral-key
```

Do not commit `.env`.

### Invalid master key

The request must include:

```http
Authorization: Bearer sk-local-litellm
```

If you change `LITELLM_MASTER_KEY` in `.env`, update the `Authorization` header in your curl command or Postman request accordingly.

### Model or provider error

Check `litellm/config.yaml` and confirm that the configured provider model is available for your API key.
