package com.example.backend.controller;

import com.example.backend.dto.ModelDto;
import com.example.backend.service.ChatService;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class ModelController {

    private final ChatService chatService;

    public ModelController(ChatService chatService) {
        this.chatService = chatService;
    }

    @GetMapping("/models")
    public List<String> models() {
        return chatService.getAvailableModels();
    }

    @GetMapping("/models/details")
    public List<ModelDto> modelDetails() {
        return chatService.getAvailableModelDetails();
    }
}
