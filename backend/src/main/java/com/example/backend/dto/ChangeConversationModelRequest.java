package com.example.backend.dto;

import jakarta.validation.constraints.NotBlank;

public record ChangeConversationModelRequest(
        @NotBlank String modelAlias
) {
}
