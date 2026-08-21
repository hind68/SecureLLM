package com.example.backend.integration.litellm;

import tools.jackson.databind.ObjectMapper;
import java.lang.reflect.Method;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import static org.assertj.core.api.Assertions.assertThat;

class LiteLlmServiceTest {

    @Test
    void requestPayloadStartsWithGeneralAssistantSystemInstruction() throws Exception {
        List<?> messages = payloadMessages(List.of(new LiteLlmMessage("user", "Bonjour")));
        Map<?, ?> system = (Map<?, ?>) messages.get(0);
        Map<?, ?> user = (Map<?, ?>) messages.get(1);
        String content = (String) system.get("content");

        assertThat(system.get("role")).isEqualTo("system");
        assertThat(content)
                .contains("Tu es un assistant généraliste intégré à une plateforme d’entreprise.")
                .contains("Ne limite pas tes réponses à un domaine particulier.")
                .contains("Ne reproduis jamais les placeholders de sécurité")
                .contains("Réponds de manière claire, naturelle, professionnelle et pertinente.");
        assertThat(user.get("role")).isEqualTo("user");
        assertThat(user.get("content")).isEqualTo("Bonjour");
    }

    @Test
    void systemInstructionDefinesSharedLanguagePolicyForAllModels() throws Exception {
        List<?> messages = payloadMessages(List.of(
                new LiteLlmMessage("user", "Explique-moi ce point."),
                new LiteLlmMessage("assistant", "Bien sûr."),
                new LiteLlmMessage("user", "Answer in English: pourquoi ?")
        ));
        String content = (String) ((Map<?, ?>) messages.get(0)).get("content");

        assertThat(content)
                .contains("réponds dans la même langue que le dernier message utilisateur")
                .contains("si l’utilisateur demande explicitement une langue, respecte cette demande")
                .contains("ne choisis pas la langue en fonction d’anciens messages non pertinents")
                .contains("supporte au minimum le français, l’anglais et l’arabe")
                .contains("pour l’arabe, produis un texte arabe naturel et correctement orienté")
                .contains("ne mélange pas plusieurs langues sans raison");
        assertThat(((Map<?, ?>) messages.get(messages.size() - 1)).get("content"))
                .isEqualTo("Answer in English: pourquoi ?");
    }

    @ParameterizedTest
    @CsvSource({
            "question française,Explique ce sujet simplement.",
            "English question,Explain this topic simply.",
            "Arabic question,اشرح هذا الموضوع ببساطة.",
            "language switch,Now answer in English.",
            "explicit instruction,Réponds en anglais: explique cette idée."
    })
    void payloadKeepsTheLastUserMessageThatDrivesResponseLanguage(String ignoredCaseName, String lastUserMessage) throws Exception {
        List<?> messages = payloadMessages(List.of(
                new LiteLlmMessage("user", "Bonjour"),
                new LiteLlmMessage("assistant", "Bonjour."),
                new LiteLlmMessage("user", lastUserMessage)
        ));

        assertThat(((Map<?, ?>) messages.get(messages.size() - 1)).get("content"))
                .isEqualTo(lastUserMessage);
    }

    @Test
    void extractStreamingTokenReadsContentFromNormalSseDataLine() throws Exception {
        assertThat(extractStreamingToken(newService(), "data: {\"choices\":[{\"delta\":{\"content\":\"Hello\"}}]}"))
                .isEqualTo("Hello");
    }

    @Test
    void extractStreamingTokenSkipsDoneSentinel() throws Exception {
        assertThat(extractStreamingToken(newService(), "data: [DONE]")).isEmpty();
    }

    @Test
    void extractStreamingTokenDecodesUnicodeEscape() throws Exception {
        assertThat(extractStreamingToken(newService(), "data: {\"choices\":[{\"delta\":{\"content\":\"caf\\u00e9\"}}]}"))
                .isEqualTo("café");
    }

    @Test
    void extractStreamingTokenReturnsEmptyForNullContent() throws Exception {
        assertThat(extractStreamingToken(newService(), "data: {\"choices\":[{\"delta\":{\"content\":null}}]}"))
                .isEmpty();
    }

    @Test
    void extractStreamingTokenHandlesMultipleConcatenatedDataLinesInOneChunk() throws Exception {
        String chunk = "data: {\"choices\":[{\"delta\":{\"content\":\"Hel\"}}]}\n"
                + "data: {\"choices\":[{\"delta\":{\"content\":\"lo\"}}]}";

        assertThat(extractStreamingToken(newService(), chunk)).isEqualTo("Hello");
    }

    @Test
    void extractStreamingTokenIgnoresContentKeyOutsideDeltaPath() throws Exception {
        String chunk = "data: {\"id\":\"abc\",\"model\":{\"content\":\"not-the-real-content\"},"
                + "\"choices\":[{\"delta\":{\"content\":\"Real\"}}]}";

        assertThat(extractStreamingToken(newService(), chunk)).isEqualTo("Real");
    }

    @Test
    void extractStreamingTokenIgnoresNonJsonFragmentsWithoutThrowing() throws Exception {
        assertThat(extractStreamingToken(newService(), "data: not-json")).isEmpty();
    }

    private LiteLlmService newService() {
        return new LiteLlmService("http://localhost:4000", "sk-test", new ObjectMapper());
    }

    private String extractStreamingToken(LiteLlmService service, String chunk) throws Exception {
        Method method = LiteLlmService.class.getDeclaredMethod("extractStreamingToken", String.class);
        method.setAccessible(true);
        return (String) method.invoke(service, chunk);
    }

    private List<?> payloadMessages(List<LiteLlmMessage> inputMessages) throws Exception {
        LiteLlmService service = newService();
        Method requestBody = LiteLlmService.class.getDeclaredMethod("requestBody", String.class, boolean.class, List.class);
        requestBody.setAccessible(true);

        Map<?, ?> body = (Map<?, ?>) requestBody.invoke(
                service,
                "secure-groq",
                false,
                inputMessages
        );
        return (List<?>) body.get("messages");
    }
}
