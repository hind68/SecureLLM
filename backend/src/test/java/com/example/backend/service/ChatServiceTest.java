package com.example.backend.service;

import com.example.backend.dto.ChatRequest;
import com.example.backend.dto.ChatResponse;
import com.example.backend.entity.FournisseurLlm;
import com.example.backend.entity.ModeleLlm;
import com.example.backend.entity.StatutFournisseurLlm;
import com.example.backend.entity.StatutModeleLlm;
import com.example.backend.repository.ModeleLlmRepository;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.web.server.ResponseStatusException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ChatServiceTest {

    @Mock
    private LiteLlmService liteLlmService;

    @Mock
    private ModeleLlmRepository modeleLlmRepository;

    @InjectMocks
    private ChatService chatService;

    @Test
    void getAvailableModelsReturnsActiveAliasesFromDatabase() {
        FournisseurLlm groq = new FournisseurLlm("groq", "Groq", StatutFournisseurLlm.ACTIF);
        FournisseurLlm mistral = new FournisseurLlm("mistral", "Mistral", StatutFournisseurLlm.ACTIF);
        when(modeleLlmRepository.findByStatutOrderByIdAsc(StatutModeleLlm.ACTIF))
                .thenReturn(List.of(
                        new ModeleLlm(groq, "secure-groq", "groq/llama-3.1-8b-instant", StatutModeleLlm.ACTIF),
                        new ModeleLlm(mistral, "secure-mistral", "mistral/mistral-small-latest", StatutModeleLlm.ACTIF)
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
    }

    @Test
    void chatCallsLiteLlmForActiveModel() {
        ChatRequest request = new ChatRequest("secure-gemini", "Bonjour");
        when(modeleLlmRepository.existsByAliasInterneAndStatut("secure-gemini", StatutModeleLlm.ACTIF))
                .thenReturn(true);
        when(liteLlmService.chat("secure-gemini", "Bonjour")).thenReturn("Bonjour depuis Gemini");

        ChatResponse response = chatService.chat(request);

        assertThat(response.model()).isEqualTo("secure-gemini");
        assertThat(response.answer()).isEqualTo("Bonjour depuis Gemini");
        verify(liteLlmService).chat("secure-gemini", "Bonjour");
    }
}
