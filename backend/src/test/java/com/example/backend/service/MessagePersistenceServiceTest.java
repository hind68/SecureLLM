package com.example.backend.service;

import com.example.backend.entity.Conversation;
import com.example.backend.entity.FournisseurLlm;
import com.example.backend.entity.Message;
import com.example.backend.entity.ModeleLlm;
import com.example.backend.entity.Utilisateur;
import com.example.backend.enums.RoleMessage;
import com.example.backend.enums.StatutFournisseurLlm;
import com.example.backend.enums.StatutMessage;
import com.example.backend.enums.StatutModeleLlm;
import com.example.backend.repository.ConversationRepository;
import com.example.backend.repository.MessageRepository;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class MessagePersistenceServiceTest {

    @Mock
    private MessageRepository messageRepository;

    @Mock
    private ConversationRepository conversationRepository;

    @Mock
    private Utilisateur demoUser;

    private MessagePersistenceService service;
    private Conversation conversation;
    private Message message;

    @BeforeEach
    void setUp() {
        service = new MessagePersistenceService(messageRepository, conversationRepository);
        FournisseurLlm fournisseur = new FournisseurLlm("groq", "Groq", StatutFournisseurLlm.ACTIF);
        ModeleLlm model = new ModeleLlm(fournisseur, "secure-groq", "groq/llama-3.1-8b-instant", "Groq", StatutModeleLlm.ACTIF);
        conversation = new Conversation(demoUser, model, "Bonjour");
        message = new Message(conversation, RoleMessage.ASSISTANT, 1, StatutMessage.EN_COURS, "", null, model);
    }

    @Test
    void completeAssistantMessageUpdatesMessageAndTouchesConversation() {
        when(messageRepository.findById(1L)).thenReturn(Optional.of(message));

        service.completeAssistantMessage(1L, "Reponse");

        assertThat(message.getContenu()).isEqualTo("Reponse");
        assertThat(message.getStatut()).isEqualTo(StatutMessage.TERMINE);
        verify(conversationRepository).save(conversation);
    }

    @Test
    void failAssistantMessageUpdatesMessageAndTouchesConversation() {
        when(messageRepository.findById(1L)).thenReturn(Optional.of(message));

        service.failAssistantMessage(1L, "Erreur");

        assertThat(message.getContenu()).isEqualTo("Erreur");
        assertThat(message.getStatut()).isEqualTo(StatutMessage.ECHEC);
        verify(conversationRepository).save(conversation);
    }

    @Test
    void completeAssistantMessageDoesNothingWhenMessageNotFound() {
        when(messageRepository.findById(1L)).thenReturn(Optional.empty());

        assertThatCode(() -> service.completeAssistantMessage(1L, "Reponse")).doesNotThrowAnyException();

        verify(conversationRepository, never()).save(any());
    }

    @Test
    void failAssistantMessageDoesNothingWhenMessageNotFound() {
        when(messageRepository.findById(1L)).thenReturn(Optional.empty());

        assertThatCode(() -> service.failAssistantMessage(1L, "Erreur")).doesNotThrowAnyException();

        verify(conversationRepository, never()).save(any());
    }
}
