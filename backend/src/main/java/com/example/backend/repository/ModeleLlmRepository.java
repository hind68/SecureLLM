package com.example.backend.repository;

import com.example.backend.entity.ModeleLlm;
import com.example.backend.entity.StatutModeleLlm;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ModeleLlmRepository extends JpaRepository<ModeleLlm, Long> {

    List<ModeleLlm> findByStatutOrderByIdAsc(StatutModeleLlm statut);

    boolean existsByAliasInterneAndStatut(String aliasInterne, StatutModeleLlm statut);
}
