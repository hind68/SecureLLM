package com.example.backend.dto;

public record AttachmentSecureResponse(
        Long id,
        String filename,
        String mimeType,
        String extractionStatus,
        String maskedText
) {
}
