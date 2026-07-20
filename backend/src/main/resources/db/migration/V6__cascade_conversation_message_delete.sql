ALTER TABLE message
    DROP CONSTRAINT IF EXISTS message_reponse_a_message_id_fkey;

ALTER TABLE message
    ADD CONSTRAINT message_reponse_a_message_id_fkey
    FOREIGN KEY (reponse_a_message_id)
    REFERENCES message(id)
    ON DELETE SET NULL;

ALTER TABLE message
    DROP CONSTRAINT IF EXISTS message_conversation_id_fkey;

ALTER TABLE message
    ADD CONSTRAINT message_conversation_id_fkey
    FOREIGN KEY (conversation_id)
    REFERENCES conversation(id)
    ON DELETE CASCADE;
