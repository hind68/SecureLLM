package com.example.backend.controller;

import com.example.backend.dto.ChatRequest;
import com.example.backend.dto.ChatResponse;
import com.example.backend.service.ChatService;
import jakarta.validation.Valid;
import java.util.List;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class GatewayController {

    private final ChatService chatService;

    public GatewayController(ChatService chatService) {
        this.chatService = chatService;
    }

    @GetMapping("/health")
    public Map<String, String> health() {
        return Map.of(
                "status", "OK",
                "service", "secure-llm-backend"
        );
    }

    @GetMapping("/models")
    public List<String> models() {
        return chatService.getAvailableModels();
    }

    @PostMapping("/chat")
    public ChatResponse chat(@Valid @RequestBody ChatRequest request) {
        return chatService.chat(request);
    }
}
