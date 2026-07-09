package com.example.backend.dto;

public record ChatResponse(
        String model,
        String answer
) {
}
