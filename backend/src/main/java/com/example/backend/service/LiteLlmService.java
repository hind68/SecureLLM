package com.example.backend.service;

import java.time.Duration;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.server.ResponseStatusException;

import static org.springframework.http.HttpStatus.BAD_GATEWAY;

@Service
public class LiteLlmService {

    private final WebClient webClient;
    private final String masterKey;

    public LiteLlmService(
            @Value("${litellm.base-url}") String baseUrl,
            @Value("${litellm.master-key:}") String masterKey
    ) {
        this.webClient = WebClient.builder()
                .baseUrl(baseUrl)
                .build();
        this.masterKey = masterKey;
    }

    public String chat(String model, String message) {
        Map<String, Object> body = Map.of(
                "model", model,
                "messages", List.of(Map.of(
                        "role", "user",
                        "content", message
                ))
        );

        Map<?, ?> response = webClient.post()
                .uri("/v1/chat/completions")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + masterKey)
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body)
                .retrieve()
                .bodyToMono(Map.class)
                .block(Duration.ofSeconds(60));

        String answer = extractAnswer(response);
        if (answer.isBlank()) {
            throw new ResponseStatusException(BAD_GATEWAY, "LiteLLM response did not contain an answer");
        }

        return answer;
    }

    private String extractAnswer(Map<?, ?> response) {
        if (response == null) {
            return "";
        }

        Object choicesValue = response.get("choices");
        if (!(choicesValue instanceof List<?> choices) || choices.isEmpty()) {
            return "";
        }

        Object firstChoice = choices.get(0);
        if (!(firstChoice instanceof Map<?, ?> choice)) {
            return "";
        }

        Object messageValue = choice.get("message");
        if (!(messageValue instanceof Map<?, ?> message)) {
            return "";
        }

        Object content = message.get("content");
        return content instanceof String text ? text : "";
    }
}
