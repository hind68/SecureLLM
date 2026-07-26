package com.example.backend.repository;

import com.example.backend.entity.ModeleLlm;
import com.example.backend.enums.StatutModeleLlm;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ModeleLlmRepository extends JpaRepository<ModeleLlm, Long> {

    List<ModeleLlm> findByStatutOrderByIdAsc(StatutModeleLlm statut);

    Optional<ModeleLlm> findByAliasInterneAndStatut(String aliasInterne, StatutModeleLlm statut);

    boolean existsByAliasInterneAndStatut(String aliasInterne, StatutModeleLlm statut);
}

