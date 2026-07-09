# LiteLLM

This folder contains the Phase 1 LiteLLM proof of concept.

## Model Aliases

The local model aliases are:

- `secure-gpt` maps to `openai/gpt-4o-mini`
- `secure-groq` maps to `groq/llama-3.1-8b-instant`

## Configuration

The LiteLLM proxy reads `config.yaml` from this folder. Secrets are loaded from `.env` through environment variables and must not be committed.

Required provider keys:

- `OPENAI_API_KEY` for `secure-gpt`
- `GROQ_API_KEY` for `secure-groq`

## Test Endpoint

```text
POST http://localhost:4000/v1/chat/completions
```

Required authorization header:

```http
Authorization: Bearer sk-local-litellm
```
