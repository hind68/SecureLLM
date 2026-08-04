package com.example.backend.service;

import com.example.backend.dto.ChangeConversationModelRequest;
import com.example.backend.dto.CreateConversationRequest;
import com.example.backend.dto.SendMessageRequest;
import com.example.backend.entity.Conversation;
import com.example.backend.entity.FournisseurLlm;
import com.example.backend.entity.Message;
import com.example.backend.entity.ModeleLlm;
import com.example.backend.enums.RoleMessage;
import com.example.backend.enums.StatutFournisseurLlm;
import com.example.backend.enums.StatutMessage;
import com.example.backend.enums.StatutModeleLlm;
import com.example.backend.integration.dlp.DlpBlockedException;
import com.example.backend.integration.dlp.DlpUnavailableException;
import com.example.backend.integration.litellm.LiteLlmMessage;
import com.example.backend.integration.litellm.LiteLlmService;
import com.example.backend.entity.Utilisateur;
import com.example.backend.repository.ConversationRepository;
import com.example.backend.repository.MessageRepository;
import com.example.backend.repository.ModeleLlmRepository;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Consumer;
import java.util.stream.Stream;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.MethodSource;
import org.mockito.ArgumentCaptor;
import org.mockito.InOrder;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.web.server.ResponseStatusException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
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
    private DlpService dlpService;

    @Mock
    private MessagePersistenceService messagePersistenceService;

    @Mock
    private AttachmentService attachmentService;

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
        geminiModel = new ModeleLlm(gemini, "secure-gemini", "gemini/gemini-3.6-flash", "Gemini", StatutModeleLlm.ACTIF);
        conversation = new Conversation(demoUser, model, "Bonjour");
        service = new ConversationService(
                conversationRepository,
                messageRepository,
                modeleLlmRepository,
                demoUserProvider,
                liteLlmService,
                dlpService,
                messagePersistenceService,
                attachmentService,
                10
        );
        lenient().when(demoUser.getExternalId()).thenReturn("demo-user");
        lenient().when(dlpService.safeTextForLlm(any(), eq("demo-user"))).thenAnswer(invocation -> invocation.getArgument(0));
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
    void deletePermanentRemovesMessagesBeforeConversation() {
        when(demoUserProvider.currentUser()).thenReturn(demoUser);
        when(conversationRepository.findOwnedById(10L, demoUser)).thenReturn(Optional.of(conversation));
        when(conversationRepository.deleteOwnedById(10L, demoUser)).thenReturn(1);

        service.deletePermanent(10L);

        InOrder order = inOrder(messageRepository, conversationRepository);
        order.verify(messageRepository).clearResponseLinksByConversationId(10L);
        order.verify(messageRepository).deleteAllByConversationId(10L);
        order.verify(messageRepository).flush();
        order.verify(conversationRepository).deleteOwnedById(10L, demoUser);
    }

    @Test
    void deletePermanentRejectsUnknownConversationWithoutDeletingMessages() {
        when(demoUserProvider.currentUser()).thenReturn(demoUser);
        when(conversationRepository.findOwnedById(99L, demoUser)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.deletePermanent(99L))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("Conversation not found");

        verify(messageRepository, never()).deleteAllByConversationId(99L);
        verify(conversationRepository, never()).deleteOwnedById(99L, demoUser);
    }

    @Test
    void archiveOnlyChangesConversationStatus() {
        when(demoUserProvider.currentUser()).thenReturn(demoUser);
        when(conversationRepository.findOwnedById(10L, demoUser)).thenReturn(Optional.of(conversation));

        service.archive(10L);

        assertThat(conversation.getStatut()).isEqualTo(com.example.backend.enums.StatutConversation.ARCHIVEE);
        verify(messageRepository, never()).deleteAllByConversationId(10L);
        verify(conversationRepository, never()).deleteOwnedById(10L, demoUser);
    }

    @Test
    void restoreChangesArchivedConversationBackToActive() {
        conversation.archive();
        when(demoUserProvider.currentUser()).thenReturn(demoUser);
        when(conversationRepository.findOwnedById(10L, demoUser)).thenReturn(Optional.of(conversation));

        var response = service.restore(10L);

        assertThat(conversation.getStatut()).isEqualTo(com.example.backend.enums.StatutConversation.ACTIVE);
        assertThat(response.status()).isEqualTo("ACTIVE");
        verify(messageRepository, never()).deleteAllByConversationId(10L);
        verify(conversationRepository, never()).deleteOwnedById(10L, demoUser);
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
    void prepareStreamUsesMaskedCurrentPromptOnlyForLiteLlmContext() {
        AtomicReference<Message> savedUserMessage = new AtomicReference<>();
        when(demoUserProvider.currentUser()).thenReturn(demoUser);
        when(conversationRepository.findOwnedById(10L, demoUser)).thenReturn(Optional.of(conversation));
        when(messageRepository.findMaxOrdre(conversation)).thenReturn(0);
        when(dlpService.safeTextForLlm("Mon secret est 1234", "demo-user")).thenReturn("Mon secret est [MASKED]");
        when(messageRepository.save(any(Message.class))).thenAnswer(invocation -> {
            Message message = invocation.getArgument(0);
            if (message.getRole() == RoleMessage.USER) {
                savedUserMessage.set(message);
            }
            return message;
        });
        when(messageRepository.findByConversationAndStatutAndRoleInOrderByOrdreAsc(eq(conversation), eq(StatutMessage.TERMINE), any()))
                .thenAnswer(invocation -> List.of(savedUserMessage.get()));

        var preparation = service.prepareStream(10L, new SendMessageRequest("Mon secret est 1234"));

        assertThat(preparation.userMessage().content()).isEqualTo("Mon secret est 1234");
        assertThat(preparation.context())
                .extracting(LiteLlmMessage::content)
                .containsExactly("Mon secret est [MASKED]");
    }

    @Test
    void streamMessageSendsAllowedTextToLiteLlm() {
        List<LiteLlmMessage> payload = streamAndCaptureLiteLlmPayload(
                List.of(),
                "Texte normal",
                "Texte normal"
        );

        assertThat(payload)
                .extracting(LiteLlmMessage::content)
                .contains("Texte normal");
    }

    @Test
    void streamMessageNeverSendsMaskedCurrentEmailToLiteLlm() {
        List<LiteLlmMessage> payload = streamAndCaptureLiteLlmPayload(
                List.of(),
                "Mon email est client@example.com",
                "Mon email est [EMAIL]"
        );

        assertThat(payload)
                .extracting(LiteLlmMessage::content)
                .doesNotContain("Mon email est client@example.com")
                .contains("Mon email est [EMAIL]");
        assertThat(joinPayload(payload)).doesNotContain("client@example.com");
    }

    @ParameterizedTest
    @MethodSource("historicalSensitiveMessages")
    void streamMessageNeverSendsSensitiveHistoryToLiteLlm(String original, String masked, String forbidden) {
        Message previousUser = new Message(conversation, RoleMessage.USER, 1, StatutMessage.TERMINE, original, null);
        List<LiteLlmMessage> payload = streamAndCaptureLiteLlmPayload(
                List.of(previousUser),
                "redonne-moi cette information",
                "redonne-moi cette information",
                original,
                masked
        );

        assertThat(joinPayload(payload)).doesNotContain(forbidden);
        assertThat(payload)
                .extracting(LiteLlmMessage::content)
                .contains(masked, "redonne-moi cette information");
    }

    @Test
    void streamMessageNeverSendsPreviouslyBlockedMessageToLiteLlm() {
        Message blocked = new Message(conversation, RoleMessage.USER, 1, StatutMessage.DLP_BLOCKED, "", null);
        blocked.blockByDlp("HIGH", "moroccan_cin");
        Message allowed = new Message(conversation, RoleMessage.USER, 2, StatutMessage.TERMINE, "Message autorise", null);

        List<LiteLlmMessage> payload = streamAndCaptureLiteLlmPayload(
                List.of(blocked, allowed),
                "Suite autorisee",
                "Suite autorisee"
        );

        String joinedPayload = joinPayload(payload);
        assertThat(joinedPayload)
                .doesNotContain("Ma CIN")
                .doesNotContain("moroccan_cin")
                .doesNotContain("DLP_BLOCKED");
        assertThat(payload)
                .extracting(LiteLlmMessage::content)
                .contains("Message autorise", "Suite autorisee");
    }

    @Test
    void messagesExposePersistedDlpBlockedStateForHistoryReload() {
        Message blocked = new Message(conversation, RoleMessage.USER, 1, StatutMessage.DLP_BLOCKED, "Ma CIN est [MOROCCAN_CIN_1]", null);
        blocked.blockByDlp(
                "HIGH",
                "moroccan_cin,credit_card",
                "moroccan_cin\t10\t18\t1\t[MOROCCAN_CIN_1]",
                "Ma CIN est [MOROCCAN_CIN_1]"
        );
        when(demoUserProvider.currentUser()).thenReturn(demoUser);
        when(conversationRepository.findOwnedById(10L, demoUser)).thenReturn(Optional.of(conversation));
        when(messageRepository.findByConversationOrderByOrdreAsc(conversation)).thenReturn(List.of(blocked));

        var messages = service.messages(10L);

        assertThat(messages).hasSize(1);
        assertThat(messages.get(0).status()).isEqualTo("DLP_BLOCKED");
        assertThat(messages.get(0).dlpHighestSeverity()).isEqualTo("HIGH");
        assertThat(messages.get(0).dlpDetectedTypes()).containsExactly("moroccan_cin", "credit_card");
        assertThat(messages.get(0).content()).isEqualTo("Ma CIN est [MOROCCAN_CIN_1]");
        assertThat(messages.get(0).dlpMaskedText()).isEqualTo("Ma CIN est [MOROCCAN_CIN_1]");
        assertThat(messages.get(0).dlpMatches())
                .extracting("type", "start", "end", "lineNumber", "placeholder")
                .containsExactly(org.assertj.core.groups.Tuple.tuple("moroccan_cin", 10, 18, 1, "[MOROCCAN_CIN_1]"));
    }

    @Test
    void streamMessagePersistsOriginalBlockedMessageMaskedTextAndPublicOffsetsOnly() {
        conversation.rename("Nouvelle conversation");
        when(demoUserProvider.currentUser()).thenReturn(demoUser);
        when(conversationRepository.findOwnedById(10L, demoUser)).thenReturn(Optional.of(conversation));
        when(dlpService.safeTextForLlm("Ma CIN est AB123456", "demo-user"))
                .thenThrow(new DlpBlockedException(
                        "HIGH",
                        Set.of("moroccan_cin"),
                        "Ma CIN est [MOROCCAN_CIN_1]",
                        List.of(new com.example.backend.integration.dlp.DlpPublicMatch(null, null, "moroccan_cin", 10, 18, 1, "[MOROCCAN_CIN_1]"))
                ));

        service.streamMessage(10L, new SendMessageRequest("Ma CIN est AB123456"));

        ArgumentCaptor<Message> messageCaptor = ArgumentCaptor.captor();
        verify(messageRepository).save(messageCaptor.capture());
        Message saved = messageCaptor.getValue();
        assertThat(saved.getContenu()).isEqualTo("Ma CIN est [MOROCCAN_CIN_1]");
        assertThat(saved.getDlpMaskedText()).isEqualTo("Ma CIN est [MOROCCAN_CIN_1]");
        assertThat(saved.getDlpMatches())
                .contains("moroccan_cin")
                .contains("\t10\t18\t1\t")
                .contains("[MOROCCAN_CIN_1]")
                .doesNotContain("AB123456", "value", "rawValue");
        assertThat(conversation.getTitre()).contains("[MOROCCAN_CIN_1]").doesNotContain("AB123456");
    }

    @ParameterizedTest
    @CsvSource({
            "Le mot CIN peut designer une carte nationale sans numero.",
            "Cette API publique documente un modele de test.",
            "La carte du site montre les sections techniques.",
            "Le numero de ticket INC-2026-0001 est interne.",
            "Le nom du modele est secure-gemini."
    })
    void streamMessageKeepsStreamingForNormalTechnicalPhrasesWhenDlpAllows(String prompt) {
        List<LiteLlmMessage> payload = streamAndCaptureLiteLlmPayload(
                List.of(),
                prompt,
                prompt
        );

        assertThat(payload)
                .extracting(LiteLlmMessage::content)
                .contains(prompt);
    }

    @ParameterizedTest
    @CsvSource({
            "Ma CIN est AB123456,moroccan_cin",
            "Ma carte est 4111111111111111,credit_card",
            "Ma cle API est sk-proj-abcdefghijklmnopqrstuvwxyz1234567890,openai_api_key"
    })
    void streamMessageDoesNotCallLiteLlmWhenDlpBlocksSensitiveInput(String prompt, String type) {
        when(demoUserProvider.currentUser()).thenReturn(demoUser);
        when(conversationRepository.findOwnedById(10L, demoUser)).thenReturn(Optional.of(conversation));
        when(dlpService.safeTextForLlm(prompt, "demo-user"))
                .thenThrow(new DlpBlockedException("HIGH", Set.of(type)));

        service.streamMessage(10L, new SendMessageRequest(prompt));

        verify(liteLlmService, never()).streamChat(any(), any(), any(), any(), any());
        assertBlockedMessageSaved(type);
    }

    @ParameterizedTest
    @CsvSource({
            "timeout",
            "http-500",
            "invalid-json",
            "unknown-decision",
            "status-error"
    })
    void streamMessageDoesNotCallLiteLlmWhenDlpIsUnavailable(String failureMode) {
        when(demoUserProvider.currentUser()).thenReturn(demoUser);
        when(conversationRepository.findOwnedById(10L, demoUser)).thenReturn(Optional.of(conversation));
        when(dlpService.safeTextForLlm("Bonjour", "demo-user"))
                .thenThrow(new DlpUnavailableException("DLP failure: " + failureMode));

        service.streamMessage(10L, new SendMessageRequest("Bonjour"));

        verify(liteLlmService, never()).streamChat(any(), any(), any(), any(), any());
        verify(messageRepository, never()).save(any(Message.class));
    }

    @Test
    void streamMessageDlpFailureDoesNotEmitPartialTokens() {
        when(demoUserProvider.currentUser()).thenReturn(demoUser);
        when(conversationRepository.findOwnedById(10L, demoUser)).thenReturn(Optional.of(conversation));
        when(dlpService.safeTextForLlm("Ma CIN est AB123456", "demo-user"))
                .thenThrow(new DlpBlockedException("HIGH", Set.of("moroccan_cin")));

        service.streamMessage(10L, new SendMessageRequest("Ma CIN est AB123456"));

        verify(liteLlmService, never()).streamChat(any(), any(), any(), any(), any());
        verify(messagePersistenceService, never()).completeAssistantMessage(any(), any());
        verify(messagePersistenceService, never()).failAssistantMessage(any(), any());
        assertBlockedMessageSaved("moroccan_cin");
    }

    @Test
    void streamMessageDoesNotCallLiteLlmWhenDlpBlocks() {
        when(demoUserProvider.currentUser()).thenReturn(demoUser);
        when(conversationRepository.findOwnedById(10L, demoUser)).thenReturn(Optional.of(conversation));
        when(dlpService.safeTextForLlm("secret", "demo-user"))
                .thenThrow(new DlpBlockedException("HIGH", Set.of("API_KEY")));

        service.streamMessage(10L, new SendMessageRequest("secret"));

        verify(liteLlmService, never()).streamChat(any(), any(), any(), any(), any());
        assertBlockedMessageSaved("API_KEY");
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

    private List<LiteLlmMessage> streamAndCaptureLiteLlmPayload(
            List<Message> previousMessages,
            String prompt,
            String safePrompt
    ) {
        return streamAndCaptureLiteLlmPayload(previousMessages, prompt, safePrompt, null, null);
    }

    private List<LiteLlmMessage> streamAndCaptureLiteLlmPayload(
            List<Message> previousMessages,
            String prompt,
            String safePrompt,
            String historicalOriginal,
            String historicalMasked
    ) {
        when(demoUserProvider.currentUser()).thenReturn(demoUser);
        when(conversationRepository.findOwnedById(10L, demoUser)).thenReturn(Optional.of(conversation));
        when(messageRepository.findMaxOrdre(conversation)).thenReturn(previousMessages.size());
        when(dlpService.safeTextForLlm(prompt, "demo-user")).thenReturn(safePrompt);
        if (historicalOriginal != null) {
            when(dlpService.safeTextForLlm(historicalOriginal, "demo-user")).thenReturn(historicalMasked);
        }
        AtomicReference<Message> savedUserMessage = new AtomicReference<>();
        when(messageRepository.save(any(Message.class))).thenAnswer(invocation -> {
            Message message = invocation.getArgument(0);
            if (message.getRole() == RoleMessage.USER) {
                savedUserMessage.set(message);
            }
            return message;
        });
        when(messageRepository.findByConversationAndStatutAndRoleInOrderByOrdreAsc(eq(conversation), eq(StatutMessage.TERMINE), any()))
                .thenAnswer(invocation -> {
                    List<Message> messages = previousMessages.stream()
                            .filter(message -> message.getStatut() == StatutMessage.TERMINE)
                            .collect(java.util.stream.Collectors.toCollection(java.util.ArrayList::new));
                    if (savedUserMessage.get() != null) {
                        messages.add(savedUserMessage.get());
                    }
                    return messages;
                });

        ArgumentCaptor<List<LiteLlmMessage>> payloadCaptor = ArgumentCaptor.captor();
        doAnswer(invocation -> {
            Runnable onComplete = invocation.getArgument(3);
            onComplete.run();
            return null;
        }).when(liteLlmService).streamChat(eq("secure-groq"), payloadCaptor.capture(), any(), any(), any());

        service.streamMessage(10L, new SendMessageRequest(prompt));

        verify(liteLlmService, times(1)).streamChat(eq("secure-groq"), any(), any(), any(), any());
        return payloadCaptor.getValue();
    }

    private String joinPayload(List<LiteLlmMessage> payload) {
        return payload.stream()
                .map(LiteLlmMessage::content)
                .reduce("", (left, right) -> left + "\n" + right);
    }

    private void assertBlockedMessageSaved(String type) {
        ArgumentCaptor<Message> messageCaptor = ArgumentCaptor.captor();
        verify(messageRepository, times(1)).save(messageCaptor.capture());
        Message saved = messageCaptor.getValue();
        assertThat(saved.getRole()).isEqualTo(RoleMessage.USER);
        assertThat(saved.getStatut()).isEqualTo(StatutMessage.DLP_BLOCKED);
        assertThat(saved.getContenu()).doesNotContain("Ma CIN est AB123456");
        assertThat(saved.getDlpHighestSeverity()).isEqualTo("HIGH");
        assertThat(saved.getDlpDetectedTypes()).contains(type);
    }

    private static Stream<Arguments> historicalSensitiveMessages() {
        return Stream.of(
                Arguments.of("Mon email est client@example.com", "Mon email est [EMAIL]", "client@example.com"),
                Arguments.of("Mon telephone est 0612345678", "Mon telephone est [PHONE]", "0612345678"),
                Arguments.of("Mon RIB est 007780000004567890123456", "Mon RIB est [RIB]", "007780000004567890123456"),
                Arguments.of("Mon IBAN est MA64011519000001205000534921", "Mon IBAN est [IBAN]", "MA64011519000001205000534921"),
                Arguments.of("La personne est Jean Dupont", "La personne est [PERSON]", "Jean Dupont"),
                Arguments.of("Adresse IP 192.168.1.24", "Adresse IP [IP_ADDRESS]", "192.168.1.24"),
                Arguments.of("Token ghp_abcdefghijklmnopqrstuvwxyz123456", "Token [TOKEN]", "ghp_abcdefghijklmnopqrstuvwxyz123456")
        );
    }
}

