package com.example.backend.service;

import com.example.backend.dto.ChatRequest;
import com.example.backend.dto.ChatResponse;
import com.example.backend.entity.FournisseurLlm;
import com.example.backend.entity.ModeleLlm;
import com.example.backend.entity.Utilisateur;
import com.example.backend.enums.StatutFournisseurLlm;
import com.example.backend.enums.StatutModeleLlm;
import com.example.backend.integration.dlp.DlpBlockedException;
import com.example.backend.integration.litellm.LiteLlmService;
import com.example.backend.repository.ModeleLlmRepository;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.web.server.ResponseStatusException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ChatServiceTest {

    @Mock
    private LiteLlmService liteLlmService;

    @Mock
    private ModeleLlmRepository modeleLlmRepository;

    @Mock
    private DlpService dlpService;

    @Mock
    private DemoUserProvider demoUserProvider;

    @Mock
    private Utilisateur demoUser;

    @InjectMocks
    private ChatService chatService;

    @Test
    void getAvailableModelsReturnsActiveAliasesFromDatabase() {
        FournisseurLlm groq = new FournisseurLlm("groq", "Groq", StatutFournisseurLlm.ACTIF);
        FournisseurLlm mistral = new FournisseurLlm("mistral", "Mistral", StatutFournisseurLlm.ACTIF);
        when(modeleLlmRepository.findByStatutOrderByIdAsc(StatutModeleLlm.ACTIF))
                .thenReturn(List.of(
                        new ModeleLlm(groq, "secure-groq", "groq/llama-3.1-8b-instant", "Groq", StatutModeleLlm.ACTIF),
                        new ModeleLlm(mistral, "secure-mistral", "mistral/mistral-small-latest", "Mistral", StatutModeleLlm.ACTIF)
                ));

        List<String> models = chatService.getAvailableModels();

        assertThat(models).containsExactly("secure-groq", "secure-mistral");
    }

    @Test
    void chatRejectsInactiveOrUnknownModel() {
        ChatRequest request = new ChatRequest("unknown-model", "Bonjour");
        when(modeleLlmRepository.existsByAliasInterneAndStatut("unknown-model", StatutModeleLlm.ACTIF))
                .thenReturn(false);

        assertThatThrownBy(() -> chatService.chat(request))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("Unsupported model");
        verify(dlpService, never()).safeTextForLlm("Bonjour", "demo-user");
    }

    @Test
    void chatSendsOnlyDlpSafeTextToLiteLlmForActiveModel() {
        ChatRequest request = new ChatRequest("secure-gemini", "Bonjour secret");
        when(modeleLlmRepository.existsByAliasInterneAndStatut("secure-gemini", StatutModeleLlm.ACTIF))
                .thenReturn(true);
        when(demoUserProvider.currentUser()).thenReturn(demoUser);
        when(demoUser.getExternalId()).thenReturn("demo-user");
        when(dlpService.safeTextForLlm("Bonjour secret", "demo-user")).thenReturn("Bonjour [MASKED]");
        when(liteLlmService.chat("secure-gemini", "Bonjour [MASKED]")).thenReturn("Bonjour depuis Gemini");

        ChatResponse response = chatService.chat(request);

        assertThat(response.model()).isEqualTo("secure-gemini");
        assertThat(response.answer()).isEqualTo("Bonjour depuis Gemini");
        verify(liteLlmService).chat("secure-gemini", "Bonjour [MASKED]");
    }

    @ParameterizedTest
    @CsvSource({
            "'Voici ![Image](/assets/check.png)'",
            "'Voici ![Image](https://example.com/assets/check.png)'"
    })
    void chatSendsPublicMarkdownImageUrlsUnchangedToLiteLlm(String prompt) {
        ChatRequest request = new ChatRequest("secure-gemini", prompt);
        when(modeleLlmRepository.existsByAliasInterneAndStatut("secure-gemini", StatutModeleLlm.ACTIF))
                .thenReturn(true);
        when(demoUserProvider.currentUser()).thenReturn(demoUser);
        when(demoUser.getExternalId()).thenReturn("demo-user");
        when(dlpService.safeTextForLlm(prompt, "demo-user")).thenReturn(prompt);
        when(liteLlmService.chat("secure-gemini", prompt)).thenReturn("OK");

        chatService.chat(request);

        verify(dlpService).safeTextForLlm(prompt, "demo-user");
        verify(liteLlmService).chat("secure-gemini", prompt);
    }

    @ParameterizedTest
    @CsvSource({
            "Mon email est client@example.com,Mon email est [EMAIL],client@example.com",
            "Mon telephone est 0612345678,Mon telephone est [PHONE],0612345678",
            "Token ghp_abcdefghijklmnopqrstuvwxyz123456,Token [TOKEN],ghp_abcdefghijklmnopqrstuvwxyz123456"
    })
    void chatNeverSendsOriginalSensitiveTextToLiteLlm(String original, String masked, String forbidden) {
        ChatRequest request = new ChatRequest("secure-gemini", original);
        when(modeleLlmRepository.existsByAliasInterneAndStatut("secure-gemini", StatutModeleLlm.ACTIF))
                .thenReturn(true);
        when(demoUserProvider.currentUser()).thenReturn(demoUser);
        when(demoUser.getExternalId()).thenReturn("demo-user");
        when(dlpService.safeTextForLlm(original, "demo-user")).thenReturn(masked);
        when(liteLlmService.chat("secure-gemini", masked)).thenReturn("OK");

        chatService.chat(request);

        verify(liteLlmService).chat("secure-gemini", masked);
        verify(liteLlmService, never()).chat("secure-gemini", forbidden);
    }

    @Test
    void chatDoesNotCallLiteLlmWhenDlpBlocks() {
        ChatRequest request = new ChatRequest("secure-gemini", "secret");
        when(modeleLlmRepository.existsByAliasInterneAndStatut("secure-gemini", StatutModeleLlm.ACTIF))
                .thenReturn(true);
        when(demoUserProvider.currentUser()).thenReturn(demoUser);
        when(demoUser.getExternalId()).thenReturn("demo-user");
        when(dlpService.safeTextForLlm("secret", "demo-user"))
                .thenThrow(new DlpBlockedException("HIGH", Set.of("API_KEY")));

        assertThatThrownBy(() -> chatService.chat(request))
                .isInstanceOf(DlpBlockedException.class);

        verify(liteLlmService, never()).chat("secure-gemini", "secret");
    }
}

