INSERT INTO fournisseur_llm (code, nom, statut)
VALUES
    ('openai', 'OpenAI', 'ACTIF'),
    ('groq', 'Groq', 'ACTIF'),
    ('gemini', 'Google Gemini', 'ACTIF'),
    ('mistral', 'Mistral', 'ACTIF');

INSERT INTO modele_llm (fournisseur_llm_id, alias_interne, nom_modele_provider, statut)
SELECT id, 'secure-gpt', 'openai/gpt-4o-mini', 'ACTIF'
FROM fournisseur_llm
WHERE code = 'openai';

INSERT INTO modele_llm (fournisseur_llm_id, alias_interne, nom_modele_provider, statut)
SELECT id, 'secure-groq', 'groq/llama-3.1-8b-instant', 'ACTIF'
FROM fournisseur_llm
WHERE code = 'groq';

INSERT INTO modele_llm (fournisseur_llm_id, alias_interne, nom_modele_provider, statut)
SELECT id, 'secure-gemini', 'gemini/gemini-2.5-flash', 'ACTIF'
FROM fournisseur_llm
WHERE code = 'gemini';

INSERT INTO modele_llm (fournisseur_llm_id, alias_interne, nom_modele_provider, statut)
SELECT id, 'secure-mistral', 'mistral/mistral-small-latest', 'ACTIF'
FROM fournisseur_llm
WHERE code = 'mistral';
