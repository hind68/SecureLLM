# Phase 1 LiteLLM PoC

## Temporary Architecture

Phase 1 validates the simplest possible LLM access path:

```text
Postman / curl
        |
        v
LiteLLM Proxy
        |
        v
OpenAI, Groq, Gemini, or Mistral provider
        |
        v
Response
```

The client sends an OpenAI-compatible chat completion request to LiteLLM. LiteLLM receives the request with a local model alias, maps it to the configured provider model, forwards the request to that provider, and returns the provider response.

Current aliases:

- `secure-gpt` routes to OpenAI `gpt-4o-mini`
- `secure-groq` routes to Groq `llama-3.1-8b-instant`
- `secure-gemini` routes to Gemini `gemini-2.5-flash`
- `secure-mistral` routes to Mistral `mistral-small-latest`
- `secure-claude` is prepared but still commented

This confirms LiteLLM extensibility before adding the Spring Boot backend. The backend will later call LiteLLM instead of calling each LLM provider directly.

## Scope

Included in this phase:

- Docker Compose setup for LiteLLM
- LiteLLM config with OpenAI, Groq, Gemini, and Mistral model aliases
- Manual curl commands for testing
- Manual Postman request instructions
- Documentation for team setup

Not included yet:

- Spring Boot backend
- React frontend
- Additional PostgreSQL domain tables
- Authentication and roles
- Prompt filtering
- Sensitive data masking/blocking
- Audit logs and history

These components will be added progressively in future phases after the LiteLLM proxy flow is validated.
