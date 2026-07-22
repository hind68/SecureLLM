# Database

PostgreSQL is provided by Docker Compose for local development.

Default host connection:

```text
jdbc:postgresql://localhost:5433/secure_llm_gateway
```

Docker network connection:

```text
postgres:5432
```

## Environment Variables

The root `.env` file controls the local database:

```env
POSTGRES_DB=secure_llm_gateway
POSTGRES_USER=secure_llm_user
POSTGRES_PASSWORD=change_me_local_only
POSTGRES_HOST_PORT=5433

SPRING_DATASOURCE_URL=jdbc:postgresql://localhost:5433/secure_llm_gateway
SPRING_DATASOURCE_USERNAME=secure_llm_user
SPRING_DATASOURCE_PASSWORD=change_me_local_only
```

If `POSTGRES_HOST_PORT` changes, update `SPRING_DATASOURCE_URL` with the same host port.

## Start PostgreSQL

From the project root:

```powershell
docker compose up -d postgres
docker compose ps postgres
```

Logs:

```powershell
docker compose logs -f postgres
```

## Flyway

Flyway runs automatically when the Spring Boot backend starts.

Migrations are stored in:

```text
backend/src/main/resources/db/migration
```

Current schema creates:

- `fournisseur_llm`
- `modele_llm`
- `utilisateur`
- `conversation`
- `message`

The model catalog is seeded with the active LiteLLM aliases:

- `secure-gpt`
- `secure-groq`
- `secure-gemini`
- `secure-mistral`

The demo user is temporary and should be replaced by the authenticated JWT user in a later security phase.

## Conversation Deletion

Archiving and permanent deletion are different operations:

- `DELETE /api/conversations/{id}` archives the conversation.
- `DELETE /api/conversations/{id}/permanent` deletes the conversation and its messages.

The latest migration configures linked messages so permanent conversation deletion works on a clean database.

## Reset Local Database

This removes local PostgreSQL data:

```powershell
docker compose down -v
docker compose up -d postgres litellm
```

Then restart the backend so Flyway recreates the schema.
