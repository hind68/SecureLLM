package com.example.backend.entity;

import com.example.backend.enums.StatutConversation;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import java.time.Instant;

@Entity
@Table(name = "conversation")
public class Conversation {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "utilisateur_id", nullable = false)
    private Utilisateur utilisateur;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "modele_llm_id", nullable = false)
    private ModeleLlm modele;

    @Column(nullable = false, length = 160)
    private String titre;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private StatutConversation statut;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Column(name = "dernier_message_at", nullable = false)
    private Instant dernierMessageAt;

    protected Conversation() {
    }

    public Conversation(Utilisateur utilisateur, ModeleLlm modele, String titre) {
        this.utilisateur = utilisateur;
        this.modele = modele;
        this.titre = titre;
        this.statut = StatutConversation.ACTIVE;
    }

    @PrePersist
    void onCreate() {
        Instant now = Instant.now();
        createdAt = now;
        updatedAt = now;
        if (dernierMessageAt == null) {
            dernierMessageAt = now;
        }
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = Instant.now();
    }

    public void rename(String titre) {
        this.titre = titre;
    }

    public void archive() {
        this.statut = StatutConversation.ARCHIVEE;
    }

    public void restore() {
        this.statut = StatutConversation.ACTIVE;
    }

    public void changeModel(ModeleLlm modele) {
        this.modele = modele;
    }

    public void touchLastMessageAt(Instant instant) {
        this.dernierMessageAt = instant;
    }

    public Long getId() {
        return id;
    }

    public Utilisateur getUtilisateur() {
        return utilisateur;
    }

    public ModeleLlm getModele() {
        return modele;
    }

    public String getTitre() {
        return titre;
    }

    public StatutConversation getStatut() {
        return statut;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public Instant getDernierMessageAt() {
        return dernierMessageAt;
    }
}


