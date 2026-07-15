package com.example.backend.service;

import com.example.backend.dto.ChatRequest;
import com.example.backend.dto.ChatResponse;
import com.example.backend.entity.ModeleLlm;
import com.example.backend.entity.StatutModeleLlm;
import com.example.backend.repository.ModeleLlmRepository;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import static org.springframework.http.HttpStatus.BAD_REQUEST;

@Service
public class ChatService {

    private final LiteLlmService liteLlmService;
    private final ModeleLlmRepository modeleLlmRepository;

    public ChatService(LiteLlmService liteLlmService, ModeleLlmRepository modeleLlmRepository) {
        this.liteLlmService = liteLlmService;
        this.modeleLlmRepository = modeleLlmRepository;
    }

    public List<String> getAvailableModels() {
        return modeleLlmRepository.findByStatutOrderByIdAsc(StatutModeleLlm.ACTIF)
                .stream()
                .map(ModeleLlm::getAliasInterne)
                .toList();
    }

    public ChatResponse chat(ChatRequest request) {
        if (!modeleLlmRepository.existsByAliasInterneAndStatut(request.model(), StatutModeleLlm.ACTIF)) {
            throw new ResponseStatusException(BAD_REQUEST, "Unsupported model: " + request.model());
        }

        String answer = liteLlmService.chat(request.model(), request.message());
        return new ChatResponse(request.model(), answer);
    }
}
