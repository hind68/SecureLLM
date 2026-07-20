package com.example.backend.dto;

import jakarta.validation.constraints.Size;

public record UpdateConversationRequest(
        @Size(max = 160) String title
) {
}
