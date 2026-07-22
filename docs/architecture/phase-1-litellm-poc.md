# Architecture Actuelle

Le projet a evolue du premier PoC LiteLLM vers un flux complet local:

```text
React frontend
      |
      v
Spring Boot backend
      |
      +--> PostgreSQL
      |
      v
LiteLLM Proxy
      |
      v
OpenAI, Groq, Gemini ou Mistral
      |
      v
Reponse streammee vers React
```

## Roles des composants

### React

Le frontend permet de:

- choisir un modele;
- creer et reprendre des conversations;
- filtrer l'historique;
- recevoir les reponses en streaming SSE;
- afficher les reponses Markdown.

### Spring Boot

Le backend expose l'API sous:

```text
http://localhost:8080/api
```

Il gere:

- le catalogue des modeles actifs;
- la validation du modele demande;
- les conversations et messages;
- le changement de modele dans une conversation;
- l'archivage et la suppression permanente;
- l'appel a LiteLLM.

### PostgreSQL

PostgreSQL est lance avec Docker Compose.

Depuis la machine hote:

```text
localhost:5433
```

Depuis Docker:

```text
postgres:5432
```

Flyway cree le schema automatiquement au demarrage du backend.

### LiteLLM

LiteLLM reste le point d'extension vers les fournisseurs LLM.

Aliases actifs:

- `secure-gpt` -> OpenAI `gpt-4o-mini`
- `secure-groq` -> Groq `llama-3.1-8b-instant`
- `secure-gemini` -> Gemini `gemini-2.5-flash`
- `secure-mistral` -> Mistral `mistral-small-latest`

Alias prepare mais commente:

- `secure-claude` -> Anthropic `claude-3-5-sonnet-20241022`

## Flux d'un message

1. React envoie le message a Spring Boot.
2. Spring Boot valide le modele actif dans PostgreSQL.
3. Spring Boot enregistre le message utilisateur.
4. Spring Boot appelle LiteLLM avec le contexte de conversation.
5. LiteLLM appelle le fournisseur choisi.
6. Spring Boot stream les tokens vers React.
7. Spring Boot enregistre la reponse assistant avec le modele qui l'a generee.

## Ce qui n'est pas encore inclus

- Authentification reelle et roles;
- Keycloak/JWT;
- DLP;
- audit bancaire complet;
- frontend dockerise;
- backend dockerise.

Ces elements seront ajoutes dans des lots ulterieurs.
