package com.example.backend.service;

import com.example.backend.dto.ChangeConversationModelRequest;
import com.example.backend.dto.CreateConversationRequest;
import com.example.backend.dto.SendMessageRequest;
import com.example.backend.entity.Conversation;
import com.example.backend.entity.FournisseurLlm;
import com.example.backend.entity.Message;
import com.example.backend.entity.ModeleLlm;
import com.example.backend.entity.RoleMessage;
import com.example.backend.entity.StatutFournisseurLlm;
import com.example.backend.entity.StatutMessage;
import com.example.backend.entity.StatutModeleLlm;
import com.example.backend.entity.Utilisateur;
import com.example.backend.repository.ConversationRepository;
import com.example.backend.repository.MessageRepository;
import com.example.backend.repository.ModeleLlmRepository;
import java.util.List;
import java.util.Optional;
import java.util.function.Consumer;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.web.server.ResponseStatusException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ConversationServiceTest {

    @Mock
    private ConversationRepository conversationRepository;

    @Mock
    private MessageRepository messageRepository;

    @Mock
    private ModeleLlmRepository modeleLlmRepository;

    @Mock
    private DemoUserProvider demoUserProvider;

    @Mock
    private LiteLlmService liteLlmService;

    @Mock
    private MessagePersistenceService messagePersistenceService;

    @Mock
    private Utilisateur demoUser;

    private ConversationService service;
    private ModeleLlm model;
    private ModeleLlm geminiModel;
    private Conversation conversation;

    @BeforeEach
    void setUp() {
        FournisseurLlm fournisseur = new FournisseurLlm("groq", "Groq", StatutFournisseurLlm.ACTIF);
        FournisseurLlm gemini = new FournisseurLlm("gemini", "Google Gemini", StatutFournisseurLlm.ACTIF);
        model = new ModeleLlm(fournisseur, "secure-groq", "groq/llama-3.1-8b-instant", "Groq", StatutModeleLlm.ACTIF);
        geminiModel = new ModeleLlm(gemini, "secure-gemini", "gemini/gemini-2.5-flash", "Gemini", StatutModeleLlm.ACTIF);
        conversation = new Conversation(demoUser, model, "Bonjour");
        service = new ConversationService(
                conversationRepository,
                messageRepository,
                modeleLlmRepository,
                demoUserProvider,
                liteLlmService,
                messagePersistenceService,
                10
        );
    }

    @Test
    void createConversationUsesActiveModelAndDemoUser() {
        when(demoUserProvider.currentUser()).thenReturn(demoUser);
        when(modeleLlmRepository.findByAliasInterneAndStatut("secure-groq", StatutModeleLlm.ACTIF))
                .thenReturn(Optional.of(model));
        when(conversationRepository.save(any(Conversation.class))).thenAnswer(invocation -> invocation.getArgument(0));

        var response = service.create(new CreateConversationRequest("secure-groq", "Test"));

        assertThat(response.modelAlias()).isEqualTo("secure-groq");
        assertThat(response.title()).isEqualTo("Test");
        verify(conversationRepository).save(any(Conversation.class));
    }

    @Test
    void createConversationRejectsUnknownOrInactiveModel() {
        when(demoUserProvider.currentUser()).thenReturn(demoUser);
        when(modeleLlmRepository.findByAliasInterneAndStatut("unknown", StatutModeleLlm.ACTIF))
                .thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.create(new CreateConversationRequest("unknown", "Test")))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("Unknown or inactive model");
    }

    @Test
    void prepareStreamPersistsUserMessageAndBuildsContextInOrder() {
        when(demoUserProvider.currentUser()).thenReturn(demoUser);
        when(conversationRepository.findOwnedById(10L, demoUser)).thenReturn(Optional.of(conversation));
        when(messageRepository.findMaxOrdre(conversation)).thenReturn(2);
        when(messageRepository.save(any(Message.class))).thenAnswer(invocation -> invocation.getArgument(0));
        Message previousUser = new Message(conversation, RoleMessage.USER, 1, StatutMessage.TERMINE, "Bonjour", null);
        Message previousAssistant = new Message(conversation, RoleMessage.ASSISTANT, 2, StatutMessage.TERMINE, "Salut", previousUser);
        when(messageRepository.findByConversationAndStatutAndRoleInOrderByOrdreAsc(eq(conversation), eq(StatutMessage.TERMINE), any()))
                .thenReturn(List.of(previousUser, previousAssistant));

        var preparation = service.prepareStream(10L, new SendMessageRequest("Suite"));

        assertThat(preparation.modelAlias()).isEqualTo("secure-groq");
        assertThat(preparation.assistantMessage().modelAlias()).isEqualTo("secure-groq");
        assertThat(preparation.assistantMessage().modelDisplayName()).isEqualTo("Groq");
        assertThat(preparation.context())
                .extracting(LiteLlmMessage::content)
                .containsExactly("Bonjour", "Salut");
    }

    @Test
    void changeModelUpdatesCurrentConversationModelWhenTargetIsActive() {
        when(demoUserProvider.currentUser()).thenReturn(demoUser);
        when(conversationRepository.findOwnedById(10L, demoUser)).thenReturn(Optional.of(conversation));
        when(modeleLlmRepository.findByAliasInterneAndStatut("secure-gemini", StatutModeleLlm.ACTIF))
                .thenReturn(Optional.of(geminiModel));

        var response = service.changeModel(10L, new ChangeConversationModelRequest("secure-gemini"));

        assertThat(response.modelAlias()).isEqualTo("secure-gemini");
        assertThat(response.modelDisplayName()).isEqualTo("Gemini");
    }

    @Test
    void changeModelRejectsUnknownOrInactiveModel() {
        when(demoUserProvider.currentUser()).thenReturn(demoUser);
        when(conversationRepository.findOwnedById(10L, demoUser)).thenReturn(Optional.of(conversation));
        when(modeleLlmRepository.findByAliasInterneAndStatut("inactive", StatutModeleLlm.ACTIF))
                .thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.changeModel(10L, new ChangeConversationModelRequest("inactive")))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("Unknown or inactive model");
    }

    @Test
    void prepareStreamUsesNewCurrentModelAndKeepsExistingContext() {
        conversation.changeModel(geminiModel);
        when(demoUserProvider.currentUser()).thenReturn(demoUser);
        when(conversationRepository.findOwnedById(10L, demoUser)).thenReturn(Optional.of(conversation));
        when(messageRepository.findMaxOrdre(conversation)).thenReturn(2);
        when(messageRepository.save(any(Message.class))).thenAnswer(invocation -> invocation.getArgument(0));
        Message previousUser = new Message(conversation, RoleMessage.USER, 1, StatutMessage.TERMINE, "Question Groq", null);
        Message previousAssistant = new Message(conversation, RoleMessage.ASSISTANT, 2, StatutMessage.TERMINE, "Reponse Groq", previousUser, model);
        when(messageRepository.findByConversationAndStatutAndRoleInOrderByOrdreAsc(eq(conversation), eq(StatutMessage.TERMINE), any()))
                .thenReturn(List.of(previousUser, previousAssistant));

        var preparation = service.prepareStream(10L, new SendMessageRequest("Question Gemini"));

        assertThat(preparation.modelAlias()).isEqualTo("secure-gemini");
        assertThat(preparation.assistantMessage().modelAlias()).isEqualTo("secure-gemini");
        assertThat(preparation.context())
                .extracting(LiteLlmMessage::content)
                .containsExactly("Question Groq", "Reponse Groq");
    }

    @Test
    void streamMessageCompletesAssistantMessageWhenLiteLlmFinishes() {
        when(demoUserProvider.currentUser()).thenReturn(demoUser);
        when(conversationRepository.findOwnedById(10L, demoUser)).thenReturn(Optional.of(conversation));
        when(messageRepository.findMaxOrdre(conversation)).thenReturn(0);
        when(messageRepository.save(any(Message.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(messageRepository.findByConversationAndStatutAndRoleInOrderByOrdreAsc(eq(conversation), eq(StatutMessage.TERMINE), any()))
                .thenReturn(List.of(new Message(conversation, RoleMessage.USER, 1, StatutMessage.TERMINE, "Question", null)));
        doAnswer(invocation -> {
            Consumer<String> onToken = invocation.getArgument(2);
            Runnable onComplete = invocation.getArgument(3);
            onToken.accept("Reponse");
            onComplete.run();
            return null;
        }).when(liteLlmService).streamChat(eq("secure-groq"), any(), any(), any(), any());

        service.streamMessage(10L, new SendMessageRequest("Question"));

        verify(messagePersistenceService).completeAssistantMessage(any(), eq("Reponse"));
    }

    @Test
    void streamMessageMarksAssistantMessageFailedWhenLiteLlmFails() {
        when(demoUserProvider.currentUser()).thenReturn(demoUser);
        when(conversationRepository.findOwnedById(10L, demoUser)).thenReturn(Optional.of(conversation));
        when(messageRepository.findMaxOrdre(conversation)).thenReturn(0);
        when(messageRepository.save(any(Message.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(messageRepository.findByConversationAndStatutAndRoleInOrderByOrdreAsc(eq(conversation), eq(StatutMessage.TERMINE), any()))
                .thenReturn(List.of());
        doAnswer(invocation -> {
            Consumer<Throwable> onError = invocation.getArgument(4);
            onError.accept(new RuntimeException("boom"));
            return null;
        }).when(liteLlmService).streamChat(eq("secure-groq"), any(), any(), any(), any());

        service.streamMessage(10L, new SendMessageRequest("Question"));

        verify(messagePersistenceService).failAssistantMessage(any(), eq("Erreur pendant le streaming LiteLLM."));
    }

    @Test
    void conversationLookupIsScopedToDemoUser() {
        when(demoUserProvider.currentUser()).thenReturn(demoUser);
        when(conversationRepository.findOwnedById(99L, demoUser)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.messages(99L))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("Conversation not found");
    }
}
