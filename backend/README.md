# SecureLLM Backend

This folder contains the Spring Boot backend for Secure LLM Gateway.

It exposes:

```text
http://localhost:8080/api
```

The backend:

- validates available model aliases from PostgreSQL;
- persists conversations and messages;
- streams assistant responses from LiteLLM with SSE;
- calls LiteLLM on `http://localhost:4000/v1/chat/completions`.

## Requirements

- Java 17
- Docker services running from the project root:

```powershell
docker compose up -d postgres litellm
```

## Environment Variables

Use the same values as the root `.env` file:

```powershell
$env:LITELLM_MASTER_KEY="sk-local-litellm"
$env:SPRING_DATASOURCE_URL="jdbc:postgresql://localhost:5433/secure_llm_gateway"
$env:SPRING_DATASOURCE_USERNAME="secure_llm_user"
$env:SPRING_DATASOURCE_PASSWORD="change_me_local_only"
```

Do not commit real secrets.

## Run

From this folder:

```powershell
cmd /c mvnw.cmd spring-boot:run
```

The backend starts on:

```text
http://localhost:8080
```

Flyway runs automatically on startup.

## Verify

```powershell
curl.exe http://localhost:8080/api/health
curl.exe http://localhost:8080/api/models/details
```

Simple chat:

```powershell
curl.exe -X POST http://localhost:8080/api/chat `
  -H "Content-Type: application/json" `
  -d "{\"model\":\"secure-groq\",\"message\":\"Bonjour, reponds en une phrase.\"}"
```

## Main Endpoints

- `GET /api/health`
- `GET /api/models`
- `GET /api/models/details`
- `POST /api/chat`
- `POST /api/conversations`
- `GET /api/conversations`
- `GET /api/conversations/{id}`
- `PATCH /api/conversations/{id}`
- `PATCH /api/conversations/{id}/model`
- `DELETE /api/conversations/{id}` archives a conversation
- `DELETE /api/conversations/{id}/permanent` deletes a conversation permanently
- `GET /api/conversations/{id}/messages`
- `POST /api/conversations/{id}/messages/stream`

## Tests

```powershell
cmd /c mvnw.cmd test
```

The first run can download Maven dependencies.
