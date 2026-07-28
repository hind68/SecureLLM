package com.example.backend.service;

import com.example.backend.dto.ChatRequest;
import com.example.backend.dto.ChatResponse;
import com.example.backend.dto.ModelDto;
import com.example.backend.entity.ModeleLlm;
import com.example.backend.enums.StatutModeleLlm;
import com.example.backend.integration.litellm.LiteLlmService;
import com.example.backend.repository.ModeleLlmRepository;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import static org.springframework.http.HttpStatus.BAD_REQUEST;

@Service
public class ChatService {

    private final LiteLlmService liteLlmService;
    private final ModeleLlmRepository modeleLlmRepository;
    private final DlpService dlpService;
    private final DemoUserProvider demoUserProvider;

    public ChatService(
            LiteLlmService liteLlmService,
            ModeleLlmRepository modeleLlmRepository,
            DlpService dlpService,
            DemoUserProvider demoUserProvider
    ) {
        this.liteLlmService = liteLlmService;
        this.modeleLlmRepository = modeleLlmRepository;
        this.dlpService = dlpService;
        this.demoUserProvider = demoUserProvider;
    }

    public List<String> getAvailableModels() {
        return modeleLlmRepository.findByStatutOrderByIdAsc(StatutModeleLlm.ACTIF)
                .stream()
                .map(ModeleLlm::getAliasInterne)
                .toList();
    }

    public List<ModelDto> getAvailableModelDetails() {
        return modeleLlmRepository.findByStatutOrderByIdAsc(StatutModeleLlm.ACTIF)
                .stream()
                .map(model -> new ModelDto(model.getAliasInterne(), model.getNomAffichage()))
                .toList();
    }

    public ChatResponse chat(ChatRequest request) {
        if (!modeleLlmRepository.existsByAliasInterneAndStatut(request.model(), StatutModeleLlm.ACTIF)) {
            throw new ResponseStatusException(BAD_REQUEST, "Unsupported model: " + request.model());
        }

        String safeMessage = dlpService.safeTextForLlm(request.message(), demoUserProvider.currentUser().getExternalId());
        String answer = liteLlmService.chat(request.model(), safeMessage);
        return new ChatResponse(request.model(), answer);
    }
}

