package com.example.backend.service;

import com.example.backend.dto.ChatRequest;
import com.example.backend.dto.ChatResponse;
import java.util.List;
import java.util.Set;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import static org.springframework.http.HttpStatus.BAD_REQUEST;

@Service
public class ChatService {

    private static final List<String> AVAILABLE_MODELS = List.of(
            "secure-groq",
            "secure-mistral",
            "secure-gemini"
    );

    private static final Set<String> ALLOWED_MODELS = Set.copyOf(AVAILABLE_MODELS);

    private final LiteLlmService liteLlmService;

    public ChatService(LiteLlmService liteLlmService) {
        this.liteLlmService = liteLlmService;
    }

    public List<String> getAvailableModels() {
        return AVAILABLE_MODELS;
    }

    public ChatResponse chat(ChatRequest request) {
        if (!ALLOWED_MODELS.contains(request.model())) {
            throw new ResponseStatusException(BAD_REQUEST, "Unsupported model: " + request.model());
        }

        String answer = liteLlmService.chat(request.model(), request.message());
        return new ChatResponse(request.model(), answer);
    }
}
