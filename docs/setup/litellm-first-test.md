# Premier test LiteLLM

Ce guide explique comment lancer le premier test LiteLLM sur une machine de developpement.

## Objectif

Verifier que le flux suivant fonctionne:

```text
curl ou Postman -> LiteLLM Proxy -> OpenAI, Groq, Gemini ou Mistral -> reponse JSON
```

## 1. Preparer le fichier d'environnement

Copier le fichier d'exemple:

```bash
cp .env.example .env
```

Sous Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Ouvrir ensuite `.env` et remplacer les valeurs d'exemple par les vraies cles API:

```env
OPENAI_API_KEY=sk-votre-cle-reelle
GROQ_API_KEY=gsk-votre-cle-reelle
GEMINI_API_KEY=votre-cle-gemini
MISTRAL_API_KEY=votre-cle-mistral
LITELLM_MASTER_KEY=sk-local-litellm
LITELLM_PORT=4000
```

Ne jamais partager ni commiter le fichier `.env`.

## 2. Demarrer LiteLLM

Lancer le conteneur:

```bash
docker compose up -d litellm
```

Verifier que le service est actif:

```bash
docker compose ps
```

## 3. Tester avec curl

Sur Linux ou macOS:

```bash
curl -X POST http://localhost:4000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-local-litellm" \
  -d @litellm/examples/request-openai.json
```

Sur Windows PowerShell:

```powershell
curl.exe -X POST http://localhost:4000/v1/chat/completions `
  -H "Content-Type: application/json" `
  -H "Authorization: Bearer sk-local-litellm" `
  -d "@litellm/examples/request-openai.json"
```

La requete appelle:

```text
POST http://localhost:4000/v1/chat/completions
```

avec le modele:

```text
secure-gpt
```

Pour tester Groq avec curl, remplacer seulement le fichier JSON:

Sur Linux ou macOS:

```bash
curl -X POST http://localhost:4000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-local-litellm" \
  -d @litellm/examples/request-groq.json
```

Sur Windows PowerShell:

```powershell
curl.exe -X POST http://localhost:4000/v1/chat/completions `
  -H "Content-Type: application/json" `
  -H "Authorization: Bearer sk-local-litellm" `
  -d "@litellm/examples/request-groq.json"
```

## 4. Tester avec Postman

1. Ouvrir Postman.
2. Creer une nouvelle requete.
3. Choisir la methode `POST`.
4. Utiliser l'URL `http://localhost:4000/v1/chat/completions`.
5. Ajouter les headers:

   ```text
   Content-Type: application/json
   Authorization: Bearer sk-local-litellm
   ```

6. Dans l'onglet Body, choisir `raw` puis `JSON`.
7. Coller ce corps de requete:

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

8. Cliquer sur Send et verifier que la reponse contient un message genere par le modele.

## 5. Tester Groq avec Postman

Pour tester Groq, garder la meme methode, la meme URL et les memes headers:

```text
POST http://localhost:4000/v1/chat/completions
Content-Type: application/json
Authorization: Bearer sk-local-litellm
```

Utiliser ce body JSON:

```json
{
  "model": "secure-groq",
  "messages": [
    {
      "role": "user",
      "content": "Bonjour, est-ce que Groq fonctionne avec LiteLLM ?"
    }
  ]
}
```

## 6. Tester Gemini avec Postman

Pour tester Gemini, garder la meme methode, la meme URL et les memes headers:

```text
POST http://localhost:4000/v1/chat/completions
Content-Type: application/json
Authorization: Bearer sk-local-litellm
```

Utiliser ce body JSON:

```json
{
  "model": "secure-gemini",
  "messages": [
    {
      "role": "user",
      "content": "Bonjour, est-ce que Gemini fonctionne avec LiteLLM ?"
    }
  ]
}
```

## 7. Tester Mistral avec Postman

Pour tester Mistral, garder la meme methode, la meme URL et les memes headers:

```text
POST http://localhost:4000/v1/chat/completions
Content-Type: application/json
Authorization: Bearer sk-local-litellm
```

Utiliser ce body JSON:

```json
{
  "model": "secure-mistral",
  "messages": [
    {
      "role": "user",
      "content": "Bonjour, est-ce que Mistral fonctionne avec LiteLLM ?"
    }
  ]
}
```

## 8. Resultat attendu

LiteLLM doit retourner une reponse JSON contenant un tableau `choices` avec une reponse du modele choisi.

## 9. Arreter LiteLLM

```bash
docker compose down
```
