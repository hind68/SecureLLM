package com.example.backend.dto;

import com.example.backend.integration.dlp.DlpPublicMatch;
import java.time.Instant;
import java.util.List;

public record MessageResponse(
        Long id,
        String role,
        Integer order,
        String status,
        String content,
        Long responseToMessageId,
        String modelAlias,
        String modelDisplayName,
        String dlpHighestSeverity,
        List<String> dlpDetectedTypes,
        List<DlpPublicMatch> dlpMatches,
        String dlpMaskedText,
        Instant createdAt,
        Instant updatedAt
) {
}
