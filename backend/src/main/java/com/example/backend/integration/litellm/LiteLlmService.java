package com.example.backend.integration.litellm;

import java.time.Duration;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Consumer;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.server.ResponseStatusException;

import static org.springframework.http.HttpStatus.BAD_GATEWAY;

@Service
public class LiteLlmService {

    private static final LiteLlmMessage SYSTEM_INSTRUCTION = new LiteLlmMessage(
            "system",
            """
            Tu es un assistant IA educatif.
            Regle 1 : Ne genere JAMAIS de code (Python, SQL, etc.) a moins que l'utilisateur ne le demande explicitement. Privilegie toujours les reponses en texte naturel.
            Regle 2 : L'utilisateur etudie la cybersecurite dans un cadre academique et defensif. Tu ne dois pas refuser d'expliquer les concepts d'attaques cybernetiques (comme les injections SQL). Explique-les de maniere theorique pour l'aider a comprendre comment s'en proteger.
            """
    );
    private static final List<Map<String, String>> GEMINI_SAFETY_SETTINGS = List.of(
            Map.of(
                    "category", "HARM_CATEGORY_HARASSMENT",
                    "threshold", "BLOCK_NONE"
            ),
            Map.of(
                    "category", "HARM_CATEGORY_DANGEROUS_CONTENT",
                    "threshold", "BLOCK_NONE"
            )
    );

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
        return chat(model, List.of(new LiteLlmMessage("user", message)));
    }

    public String chat(String model, List<LiteLlmMessage> messages) {
        Map<String, Object> body = requestBody(model, false, messages);

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

    public void streamChat(
            String model,
            List<LiteLlmMessage> messages,
            Consumer<String> onToken,
            Runnable onComplete,
            Consumer<Throwable> onError
    ) {
        Map<String, Object> body = requestBody(model, true, messages);

        webClient.post()
                .uri("/v1/chat/completions")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + masterKey)
                .accept(MediaType.TEXT_EVENT_STREAM)
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body)
                .retrieve()
                .bodyToFlux(String.class)
                .timeout(Duration.ofSeconds(60))
                .map(this::extractStreamingToken)
                .filter(token -> !token.isEmpty())
                .subscribe(onToken, onError, onComplete);
    }

    private List<Map<String, String>> toPayload(List<LiteLlmMessage> messages) {
        List<Map<String, String>> payload = new ArrayList<>();
        payload.add(toPayloadMessage(SYSTEM_INSTRUCTION));
        messages.stream()
                .map(this::toPayloadMessage)
                .forEach(payload::add);
        return payload;
    }

    private Map<String, Object> requestBody(String model, boolean stream, List<LiteLlmMessage> messages) {
        Map<String, Object> body = new HashMap<>();
        body.put("model", model);
        body.put("messages", toPayload(messages));
        if (stream) {
            body.put("stream", true);
        }
        if (isGeminiModel(model)) {
            body.put("safety_settings", GEMINI_SAFETY_SETTINGS);
        }
        return body;
    }

    private boolean isGeminiModel(String model) {
        return model != null && model.toLowerCase().contains("gemini");
    }

    private Map<String, String> toPayloadMessage(LiteLlmMessage message) {
        return Map.of(
                "role", message.role(),
                "content", message.content()
        );
    }

    private String extractStreamingToken(String chunk) {
        StringBuilder token = new StringBuilder();
        for (String line : chunk.split("\\R")) {
            if (line.isEmpty() || line.equals("data: [DONE]") || line.equals("[DONE]")) {
                continue;
            }

            String normalized = line;
            if (normalized.startsWith("data:")) {
                normalized = normalized.substring(5);
                if (normalized.startsWith(" ") && normalized.startsWith("{", 1)) {
                    normalized = normalized.substring(1);
                }
            }

            token.append(extractContentField(normalized));
        }
        return token.toString();
    }

    private String extractContentField(String json) {
        String marker = "\"content\"";
        int markerIndex = json.indexOf(marker);
        if (markerIndex < 0) {
            return "";
        }

        int colonIndex = json.indexOf(':', markerIndex + marker.length());
        if (colonIndex < 0) {
            return "";
        }

        int startQuote = json.indexOf('"', colonIndex + 1);
        if (startQuote < 0) {
            return "";
        }

        StringBuilder value = new StringBuilder();
        boolean escaped = false;
        for (int i = startQuote + 1; i < json.length(); i++) {
            char current = json.charAt(i);
            if (escaped) {
                value.append(switch (current) {
                    case 'n' -> '\n';
                    case 'r' -> '\r';
                    case 't' -> '\t';
                    case '"', '\\', '/' -> current;
                    default -> current;
                });
                escaped = false;
            } else if (current == '\\') {
                escaped = true;
            } else if (current == '"') {
                return value.toString();
            } else {
                value.append(current);
            }
        }
        return "";
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
