# Database

PostgreSQL is provided by Docker Compose for local development.

The first Flyway migrations create the LLM provider catalog:

- `fournisseur_llm`
- `modele_llm`

The Spring Boot backend connects to PostgreSQL on `localhost:5433` when it runs on the host machine. Flyway runs automatically on backend startup.
