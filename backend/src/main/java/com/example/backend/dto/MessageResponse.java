package com.example.backend.dto;

import java.time.Instant;

public record MessageResponse(
        Long id,
        String role,
        Integer order,
        String status,
        String content,
        Long responseToMessageId,
        String modelAlias,
        String modelDisplayName,
        Instant createdAt,
        Instant updatedAt
) {
}
