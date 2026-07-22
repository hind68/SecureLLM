# Installation Locale

Ce guide explique comment lancer tout le projet Secure LLM Gateway sur une nouvelle machine.

## Prerequis

- Git
- Docker Desktop
- Java 17
- Node.js et npm
- Une cle API pour au moins un fournisseur LLM a tester

## 1. Recuperer le projet

```powershell
git clone <url-du-repository>
cd secureLLM
```

## 2. Creer le fichier `.env`

```powershell
Copy-Item .env.example .env
```

Renseigner les valeurs locales:

```env
OPENAI_API_KEY=your_openai_api_key_here
GROQ_API_KEY=your_groq_api_key_here
GEMINI_API_KEY=your_gemini_api_key_here
MISTRAL_API_KEY=your_mistral_api_key_here
ANTHROPIC_API_KEY=your_anthropic_api_key_here

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

Ne jamais commiter `.env`.

## 3. Demarrer PostgreSQL et LiteLLM

Depuis la racine:

```powershell
docker compose up -d postgres litellm
docker compose ps
```

## 4. Demarrer le backend Spring Boot

Dans un nouveau terminal:

```powershell
cd backend
$env:LITELLM_MASTER_KEY="sk-local-litellm"
$env:SPRING_DATASOURCE_URL="jdbc:postgresql://localhost:5433/secure_llm_gateway"
$env:SPRING_DATASOURCE_USERNAME="secure_llm_user"
$env:SPRING_DATASOURCE_PASSWORD="change_me_local_only"
cmd /c mvnw.cmd spring-boot:run
```

Flyway cree automatiquement les tables sur une base neuve.

Verifier:

```powershell
curl.exe http://localhost:8080/api/health
curl.exe http://localhost:8080/api/models/details
```

## 5. Demarrer le frontend React

Dans un nouveau terminal:

```powershell
cd frontend
npm install
npm run dev
```

Ouvrir:

```text
http://localhost:5173
```

## 6. Ordre de demarrage recommande

1. Docker Desktop
2. `docker compose up -d postgres litellm`
3. Backend Spring Boot
4. Frontend Vite

## 7. Commandes de verification avant push

Frontend:

```powershell
cd frontend
npm run lint
npm run build
```

Backend:

```powershell
cd backend
cmd /c mvnw.cmd test
```

Docker Compose:

```powershell
docker compose config
```

## Problemes frequents

### `Failed to fetch` dans le frontend

Le backend n'est probablement pas lance sur `http://localhost:8080`.

### Erreur de connexion PostgreSQL

Verifier que Docker expose bien PostgreSQL sur `5433`:

```powershell
docker compose ps postgres
```

Verifier aussi:

```env
SPRING_DATASOURCE_URL=jdbc:postgresql://localhost:5433/secure_llm_gateway
```

### Erreur 401 LiteLLM

Le `LITELLM_MASTER_KEY` utilise par le backend doit etre identique a celui de `.env`.

### Erreur fournisseur LLM

Verifier que la cle API du modele choisi existe dans `.env`.
