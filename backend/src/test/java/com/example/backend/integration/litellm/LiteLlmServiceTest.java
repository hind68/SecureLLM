package com.example.backend.integration.litellm;

import java.lang.reflect.Method;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class LiteLlmServiceTest {

    @Test
    void requestPayloadStartsWithGeneralAssistantSystemInstruction() throws Exception {
        LiteLlmService service = new LiteLlmService("http://localhost:4000", "sk-test");
        Method requestBody = LiteLlmService.class.getDeclaredMethod("requestBody", String.class, boolean.class, List.class);
        requestBody.setAccessible(true);

        Map<?, ?> body = (Map<?, ?>) requestBody.invoke(
                service,
                "secure-groq",
                false,
                List.of(new LiteLlmMessage("user", "Bonjour"))
        );

        List<?> messages = (List<?>) body.get("messages");
        Map<?, ?> system = (Map<?, ?>) messages.get(0);
        Map<?, ?> user = (Map<?, ?>) messages.get(1);
        String content = (String) system.get("content");

        assertThat(system.get("role")).isEqualTo("system");
        assertThat(content)
                .contains("Tu es un assistant généraliste intégré à une plateforme d’entreprise.")
                .contains("Ne limite pas tes réponses à un domaine particulier.")
                .contains("Ne reproduis jamais les placeholders de sécurité")
                .contains("Adapte la langue de la réponse à la langue utilisée par l’utilisateur")
                .contains("Réponds de manière claire, naturelle, professionnelle et pertinente.");
        assertThat(user.get("role")).isEqualTo("user");
        assertThat(user.get("content")).isEqualTo("Bonjour");
    }
}
