package com.example.backend.dto;

import java.time.Instant;

public record ConversationResponse(
        Long id,
        String title,
        String modelAlias,
        String modelDisplayName,
        String status,
        Instant createdAt,
        Instant updatedAt,
        Instant lastMessageAt
) {
}
