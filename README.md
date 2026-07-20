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
- More PostgreSQL-backed domain tables
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
3. Put your local Docker/PostgreSQL values and provider API keys in `.env`:

   ```env
   OPENAI_API_KEY=sk-your-real-key
   GROQ_API_KEY=gsk-your-real-key
   GEMINI_API_KEY=your-gemini-key
   ANTHROPIC_API_KEY=your-anthropic-key
   MISTRAL_API_KEY=your-mistral-key
   LITELLM_MASTER_KEY=sk-local-litellm
   LITELLM_PORT=4000

   POSTGRES_DB=secure_llm_gateway
   POSTGRES_USER=secure_llm_user
   POSTGRES_PASSWORD=change_me_local_only
   POSTGRES_HOST_PORT=5433

   SPRING_DATASOURCE_URL=jdbc:postgresql://localhost:5433/secure_llm_gateway
   SPRING_DATASOURCE_USERNAME=secure_llm_user
   SPRING_DATASOURCE_PASSWORD=change_me_local_only
   ```

4. Start PostgreSQL and LiteLLM:

   ```bash
   docker compose up -d postgres litellm
   ```

5. Check PostgreSQL health:

   ```bash
   docker compose ps postgres
   ```

On a new database, Flyway runs automatically when the Spring Boot backend starts. It creates the model catalog, then the conversation tables, and inserts the active LiteLLM aliases from `litellm/config.yaml` plus a local demo user.

6. Test LiteLLM with curl:

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

7. You can also test manually in Postman:

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

The backend implementation lives in `backend/`. It exposes a REST API on port `8080`, persists conversations in PostgreSQL, and forwards contextual chat requests to LiteLLM.

Run PostgreSQL and LiteLLM from the project root first:

```bash
docker compose up -d postgres litellm
```

In IntelliJ, open the backend run configuration and add these environment variables:

```env
LITELLM_MASTER_KEY=your-local-litellm-master-key
SPRING_DATASOURCE_URL=jdbc:postgresql://localhost:5433/secure_llm_gateway
SPRING_DATASOURCE_USERNAME=secure_llm_user
SPRING_DATASOURCE_PASSWORD=change_me_local_only
```

Use the same `LITELLM_MASTER_KEY` value that is configured for LiteLLM. Use the PostgreSQL password from your local `.env`. Do not commit real values.

The backend uses Flyway migrations from:

```text
backend/src/main/resources/db/migration
```

Hibernate is configured with `spring.jpa.hibernate.ddl-auto=validate`, so schema changes must be made through Flyway migrations.

Current migrations:

- `V1__create_llm_catalog.sql`: LLM providers and model aliases.
- `V2__seed_active_litellm_models.sql`: active LiteLLM aliases.
- `V3__add_model_display_name.sql`: display name for model catalog entries.
- `V4__create_conversations_and_messages.sql`: demo user, conversations, messages and history indexes.
- `V5__add_message_model_attribution.sql`: model attribution on assistant messages for multi-model conversations.

The demo user is temporary and centralized in the backend. It is used only until authentication/JWT integration is added.

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

## Persistent Conversations API

The existing `/api/chat` endpoint is kept for compatibility. New contextual conversations use these endpoints:

- `POST /api/conversations`
- `GET /api/conversations?modelAlias=secure-groq&search=test&page=0&size=20`
- `GET /api/conversations/{id}`
- `PATCH /api/conversations/{id}`
- `PATCH /api/conversations/{id}/model`
- `DELETE /api/conversations/{id}`
- `GET /api/conversations/{id}/messages`
- `POST /api/conversations/{id}/messages/stream`

Postman scenario:

1. Create a conversation:

   ```http
   POST http://localhost:8080/api/conversations
   Content-Type: application/json
   ```

   ```json
   {
     "modelAlias": "secure-groq",
     "title": "Test Groq persistant"
   }
   ```

2. Send a streamed contextual message using the returned `id`:

   ```http
   POST http://localhost:8080/api/conversations/{id}/messages/stream
   Content-Type: application/json
   Accept: text/event-stream
   ```

   ```json
   {
     "content": "Bonjour, reponds en une phrase."
   }
   ```

   The stream emits structured events: `message`, `token`, `done`, and `error`.

3. Resume history:

   ```http
   GET http://localhost:8080/api/conversations/{id}/messages
   ```

4. Change the current model for the next answers in the same conversation:

   ```http
   PATCH http://localhost:8080/api/conversations/{id}/model
   Content-Type: application/json
   ```

   ```json
   {
     "modelAlias": "secure-gemini"
   }
   ```

   The existing context is preserved and sent to the new active model. Previous assistant messages keep the model that actually generated them.

5. Filter conversation history:

   ```http
   GET http://localhost:8080/api/conversations?modelAlias=secure-groq&search=Groq
   ```

   A multi-model conversation appears in this filtered list if its current model matches the filter or if it contains at least one assistant response generated by the filtered model.

6. Rename or archive:

   ```http
   PATCH http://localhost:8080/api/conversations/{id}
   Content-Type: application/json
   ```

   ```json
   {
     "title": "Nouveau titre"
   }
   ```

   ```http
   DELETE http://localhost:8080/api/conversations/{id}
   ```

## React Frontend

The Vite frontend uses `fetch` only. It can create and resume conversations, filter history by model or title, stream assistant responses progressively, render Markdown safely, rename conversations, archive them, and choose whether a model switch starts a new conversation or continues the current one.

Run it from `frontend/`:

```bash
npm install
npm run dev
```

## Useful Commands

Start PostgreSQL and LiteLLM:

```bash
docker compose up -d postgres litellm
```

Stop Docker services:

```bash
docker compose down
```

View logs:

```bash
docker compose logs -f litellm
```

View PostgreSQL logs:

```bash
docker compose logs -f postgres
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
