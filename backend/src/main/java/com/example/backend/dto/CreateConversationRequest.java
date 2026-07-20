package com.example.backend.dto;

import jakarta.validation.constraints.NotBlank;

public record CreateConversationRequest(
        @NotBlank String modelAlias,
        String title
) {
}
