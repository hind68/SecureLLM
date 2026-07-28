package com.example.backend.integration.dlp;

import com.fasterxml.jackson.annotation.JsonProperty;

public record DlpMatch(
        String id,
        String type,
        Integer start,
        Integer end,
        String severity,
        String source,
        Double score,
        @JsonProperty("presidio_entity_type") String presidioEntityType
) {
}
