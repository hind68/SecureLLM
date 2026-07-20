package com.example.backend.service;

import com.example.backend.entity.Utilisateur;
import com.example.backend.repository.UtilisateurRepository;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

import static org.springframework.http.HttpStatus.INTERNAL_SERVER_ERROR;

@Component
public class DemoUserProvider {

    public static final String DEMO_EXTERNAL_ID = "demo-user";

    private final UtilisateurRepository utilisateurRepository;

    public DemoUserProvider(UtilisateurRepository utilisateurRepository) {
        this.utilisateurRepository = utilisateurRepository;
    }

    public Utilisateur currentUser() {
        return utilisateurRepository.findByExternalId(DEMO_EXTERNAL_ID)
                .orElseThrow(() -> new ResponseStatusException(
                        INTERNAL_SERVER_ERROR,
                        "Demo user is missing. Run Flyway migrations."
                ));
    }
}
