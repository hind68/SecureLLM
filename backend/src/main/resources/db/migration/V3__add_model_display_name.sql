ALTER TABLE modele_llm
    ADD COLUMN nom_affichage VARCHAR(100);

UPDATE modele_llm
SET nom_affichage = CASE alias_interne
    WHEN 'secure-gpt' THEN 'OpenAI GPT-4o mini'
    WHEN 'secure-groq' THEN 'Groq Llama 3.1 8B'
    WHEN 'secure-gemini' THEN 'Gemini 2.5 Flash'
    WHEN 'secure-mistral' THEN 'Mistral Small'
    ELSE alias_interne
END;

ALTER TABLE modele_llm
    ALTER COLUMN nom_affichage SET NOT NULL;
