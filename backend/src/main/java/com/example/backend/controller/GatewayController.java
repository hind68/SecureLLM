package com.example.backend.controller;

import com.example.backend.dto.ChatRequest;
import com.example.backend.dto.ChatResponse;
import com.example.backend.dto.ChangeConversationModelRequest;
import com.example.backend.dto.ConversationPageResponse;
import com.example.backend.dto.ConversationResponse;
import com.example.backend.dto.CreateConversationRequest;
import com.example.backend.dto.MessageResponse;
import com.example.backend.dto.ModelDto;
import com.example.backend.dto.SendMessageRequest;
import com.example.backend.dto.UpdateConversationRequest;
import com.example.backend.service.ChatService;
import com.example.backend.service.ConversationService;
import jakarta.validation.Valid;
import java.util.List;
import java.util.Map;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

@RestController
@RequestMapping("/api")
public class GatewayController {

    private final ChatService chatService;
    private final ConversationService conversationService;

    public GatewayController(ChatService chatService, ConversationService conversationService) {
        this.chatService = chatService;
        this.conversationService = conversationService;
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

    @GetMapping("/models/details")
    public List<ModelDto> modelDetails() {
        return chatService.getAvailableModelDetails();
    }

    @PostMapping("/chat")
    public ChatResponse chat(@Valid @RequestBody ChatRequest request) {
        return chatService.chat(request);
    }

    @PostMapping("/conversations")
    public ConversationResponse createConversation(@Valid @RequestBody CreateConversationRequest request) {
        return conversationService.create(request);
    }

    @GetMapping("/conversations")
    public ConversationPageResponse conversations(
            @RequestParam(required = false) String modelAlias,
            @RequestParam(required = false) String search,
            @RequestParam(defaultValue = "false") boolean archived,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size
    ) {
        return conversationService.list(modelAlias, search, archived, page, size);
    }

    @GetMapping("/conversations/{id}")
    public ConversationResponse conversation(@PathVariable Long id) {
        return conversationService.get(id);
    }

    @PatchMapping("/conversations/{id}")
    public ConversationResponse updateConversation(
            @PathVariable Long id,
            @Valid @RequestBody UpdateConversationRequest request
    ) {
        return conversationService.update(id, request);
    }

    @PatchMapping("/conversations/{id}/model")
    public ConversationResponse changeConversationModel(
            @PathVariable Long id,
            @Valid @RequestBody ChangeConversationModelRequest request
    ) {
        return conversationService.changeModel(id, request);
    }

    @DeleteMapping("/conversations/{id}")
    public void archiveConversation(@PathVariable Long id) {
        conversationService.archive(id);
    }

    @PatchMapping("/conversations/{id}/restore")
    public ConversationResponse restoreConversation(@PathVariable Long id) {
        return conversationService.restore(id);
    }

    @DeleteMapping("/conversations/{id}/permanent")
    public void deleteConversation(@PathVariable Long id) {
        conversationService.deletePermanent(id);
    }

    @GetMapping("/conversations/{id}/messages")
    public List<MessageResponse> conversationMessages(@PathVariable Long id) {
        return conversationService.messages(id);
    }

    @PostMapping(value = "/conversations/{id}/messages/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter streamConversationMessage(
            @PathVariable Long id,
            @Valid @RequestBody SendMessageRequest request
    ) {
        return conversationService.streamMessage(id, request);
    }
}
