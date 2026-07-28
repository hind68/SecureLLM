package com.example.backend.integration.dlp;

import com.fasterxml.jackson.annotation.JsonProperty;

public record DlpAnalysisRequest(
        String text,
        @JsonProperty("user_id") String userId
) {
}
