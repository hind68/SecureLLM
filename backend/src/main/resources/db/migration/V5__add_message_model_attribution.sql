ALTER TABLE message
    ADD COLUMN modele_llm_id BIGINT REFERENCES modele_llm(id);

UPDATE message m
SET modele_llm_id = c.modele_llm_id
FROM conversation c
WHERE m.conversation_id = c.id
  AND m.role = 'ASSISTANT';

CREATE INDEX idx_message_modele_llm
    ON message (modele_llm_id);

CREATE INDEX idx_message_conversation_role_modele
    ON message (conversation_id, role, modele_llm_id);
