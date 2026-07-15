CREATE TABLE fournisseur_llm (
    id BIGSERIAL PRIMARY KEY,
    code VARCHAR(50) NOT NULL UNIQUE,
    nom VARCHAR(100) NOT NULL,
    statut VARCHAR(20) NOT NULL CHECK (statut IN ('ACTIF', 'INACTIF')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE modele_llm (
    id BIGSERIAL PRIMARY KEY,
    fournisseur_llm_id BIGINT NOT NULL REFERENCES fournisseur_llm(id),
    alias_interne VARCHAR(100) NOT NULL UNIQUE,
    nom_modele_provider VARCHAR(150) NOT NULL,
    statut VARCHAR(20) NOT NULL CHECK (statut IN ('ACTIF', 'INACTIF')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_modele_llm_fournisseur ON modele_llm(fournisseur_llm_id);
CREATE INDEX idx_modele_llm_statut ON modele_llm(statut);
