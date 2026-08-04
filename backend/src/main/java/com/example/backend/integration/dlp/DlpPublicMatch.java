package com.example.backend.integration.dlp;

public record DlpPublicMatch(
        Long attachmentId,
        String source,
        String type,
        Integer start,
        Integer end,
        Integer lineNumber,
        String placeholder
) {
}
