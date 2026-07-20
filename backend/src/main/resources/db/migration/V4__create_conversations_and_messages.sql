CREATE TABLE utilisateur (
    id BIGSERIAL PRIMARY KEY,
    external_id VARCHAR(100) NOT NULL UNIQUE,
    nom_affichage VARCHAR(120) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE conversation (
    id BIGSERIAL PRIMARY KEY,
    utilisateur_id BIGINT NOT NULL REFERENCES utilisateur(id),
    modele_llm_id BIGINT NOT NULL REFERENCES modele_llm(id),
    titre VARCHAR(160) NOT NULL,
    statut VARCHAR(20) NOT NULL CHECK (statut IN ('ACTIVE', 'ARCHIVEE')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    dernier_message_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE message (
    id BIGSERIAL PRIMARY KEY,
    conversation_id BIGINT NOT NULL REFERENCES conversation(id),
    role VARCHAR(20) NOT NULL CHECK (role IN ('USER', 'ASSISTANT', 'SYSTEM')),
    ordre INTEGER NOT NULL,
    statut VARCHAR(20) NOT NULL CHECK (statut IN ('EN_COURS', 'TERMINE', 'ECHEC')),
    contenu TEXT NOT NULL,
    reponse_a_message_id BIGINT REFERENCES message(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_message_conversation_ordre UNIQUE (conversation_id, ordre)
);

CREATE INDEX idx_conversation_utilisateur_statut_dernier_message
    ON conversation (utilisateur_id, statut, dernier_message_at DESC);

CREATE INDEX idx_conversation_modele
    ON conversation (modele_llm_id);

CREATE INDEX idx_conversation_titre_lower
    ON conversation (lower(titre));

CREATE INDEX idx_message_conversation_ordre
    ON message (conversation_id, ordre);

CREATE INDEX idx_message_conversation_statut_role_ordre
    ON message (conversation_id, statut, role, ordre);

CREATE INDEX idx_message_reponse_a
    ON message (reponse_a_message_id);

INSERT INTO utilisateur (external_id, nom_affichage)
VALUES ('demo-user', 'Utilisateur demo');
