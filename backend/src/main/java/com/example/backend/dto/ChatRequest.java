package com.example.backend.dto;

import jakarta.validation.constraints.NotBlank;

public record ChatRequest(
        @NotBlank String model,
        @NotBlank String message
) {
}
