UPDATE modele_llm
SET nom_modele_provider = 'groq/openai/gpt-oss-20b',
    nom_affichage = 'Groq GPT-OSS 20B'
WHERE alias_interne = 'secure-groq';
