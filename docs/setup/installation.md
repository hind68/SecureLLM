# Installation

This document explains how to prepare the local environment for Phase 1 of Secure LLM Gateway.

## Requirements

- Git
- Docker Desktop
- An OpenAI API key for the OpenAI test
- A Groq API key for the Groq test

## Steps

1. Clone the repository.
2. Copy `.env.example` to `.env`.
3. Replace `your_openai_api_key_here` and `your_groq_api_key_here` with real provider API keys.
4. Start LiteLLM:

   ```bash
   docker compose up -d litellm
   ```

5. Check that the container is running:

   ```bash
   docker compose ps
   ```

6. Run the first request with curl:

   ```bash
   curl -X POST http://localhost:4000/v1/chat/completions \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer sk-local-litellm" \
     -d @litellm/examples/request-openai.json
   ```

On Windows PowerShell, use:

```powershell
curl.exe -X POST http://localhost:4000/v1/chat/completions `
  -H "Content-Type: application/json" `
  -H "Authorization: Bearer sk-local-litellm" `
  -d "@litellm/examples/request-openai.json"
```

7. To stop LiteLLM:

   ```bash
   docker compose down
   ```
