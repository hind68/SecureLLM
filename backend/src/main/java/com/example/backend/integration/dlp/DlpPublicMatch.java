package com.example.backend.integration.dlp;

public record DlpPublicMatch(
        String type,
        Integer start,
        Integer end,
        Integer lineNumber,
        String placeholder
) {
}
