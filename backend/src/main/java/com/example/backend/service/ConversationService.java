package com.example.backend.service;

import com.example.backend.dto.ChangeConversationModelRequest;
import com.example.backend.dto.ConversationPageResponse;
import com.example.backend.dto.ConversationResponse;
import com.example.backend.dto.CreateConversationRequest;
import com.example.backend.dto.MessageResponse;
import com.example.backend.dto.SendMessageRequest;
import com.example.backend.dto.UpdateConversationRequest;
import com.example.backend.entity.Conversation;
import com.example.backend.entity.Message;
import com.example.backend.entity.ModeleLlm;
import com.example.backend.enums.RoleMessage;
import com.example.backend.enums.StatutConversation;
import com.example.backend.enums.StatutMessage;
import com.example.backend.enums.StatutModeleLlm;
import com.example.backend.integration.dlp.DlpAnalysisException;
import com.example.backend.integration.dlp.DlpBlockedException;
import com.example.backend.integration.dlp.DlpPublicMatch;
import com.example.backend.integration.dlp.DlpUnavailableException;
import com.example.backend.integration.litellm.LiteLlmMessage;
import com.example.backend.integration.litellm.LiteLlmService;
import com.example.backend.entity.Utilisateur;
import com.example.backend.repository.ConversationRepository;
import com.example.backend.repository.MessageRepository;
import com.example.backend.repository.ModeleLlmRepository;
import jakarta.validation.Valid;
import java.io.IOException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import org.springframework.web.server.ResponseStatusException;

import static org.springframework.http.HttpStatus.BAD_REQUEST;
import static org.springframework.http.HttpStatus.NOT_FOUND;

@Service
public class ConversationService {

    private static final Set<RoleMessage> CONTEXT_ROLES = Set.of(RoleMessage.USER, RoleMessage.ASSISTANT);

    private final ConversationRepository conversationRepository;
    private final MessageRepository messageRepository;
    private final ModeleLlmRepository modeleLlmRepository;
    private final DemoUserProvider demoUserProvider;
    private final LiteLlmService liteLlmService;
    private final DlpService dlpService;
    private final MessagePersistenceService messagePersistenceService;
    private final int maxContextMessages;

    public ConversationService(
            ConversationRepository conversationRepository,
            MessageRepository messageRepository,
            ModeleLlmRepository modeleLlmRepository,
            DemoUserProvider demoUserProvider,
            LiteLlmService liteLlmService,
            DlpService dlpService,
            MessagePersistenceService messagePersistenceService,
            @Value("${gateway.context.max-messages:20}") int maxContextMessages
    ) {
        this.conversationRepository = conversationRepository;
        this.messageRepository = messageRepository;
        this.modeleLlmRepository = modeleLlmRepository;
        this.demoUserProvider = demoUserProvider;
        this.liteLlmService = liteLlmService;
        this.dlpService = dlpService;
        this.messagePersistenceService = messagePersistenceService;
        this.maxContextMessages = maxContextMessages;
    }

    @Transactional
    public ConversationResponse create(@Valid CreateConversationRequest request) {
        Utilisateur user = demoUserProvider.currentUser();
        ModeleLlm model = activeModel(request.modelAlias());
        String title = normalizeTitle(request.title(), "Nouvelle conversation");
        Conversation conversation = conversationRepository.save(new Conversation(user, model, title));
        return toConversationResponse(conversation);
    }

    @Transactional(readOnly = true)
    public ConversationPageResponse list(String modelAlias, String search, boolean archived, int page, int size) {
        Utilisateur user = demoUserProvider.currentUser();
        StatutConversation status = archived ? StatutConversation.ARCHIVEE : StatutConversation.ACTIVE;
        PageRequest pageRequest = PageRequest.of(
                Math.max(page, 0),
                Math.min(Math.max(size, 1), 50),
                Sort.by(Sort.Direction.DESC, "dernierMessageAt")
        );
        Page<ConversationResponse> result = conversationRepository.search(
                user,
                status,
                blankToNull(modelAlias),
                searchPattern(search),
                pageRequest
        ).map(this::toConversationResponse);
        return new ConversationPageResponse(
                result.getContent(),
                result.getNumber(),
                result.getSize(),
                result.getTotalElements(),
                result.getTotalPages()
        );
    }

    @Transactional(readOnly = true)
    public ConversationResponse get(Long id) {
        return toConversationResponse(ownedConversation(id));
    }

    @Transactional
    public ConversationResponse update(Long id, UpdateConversationRequest request) {
        Conversation conversation = ownedConversation(id);
        conversation.rename(normalizeTitle(request.title(), conversation.getTitre()));
        return toConversationResponse(conversation);
    }

    @Transactional
    public ConversationResponse changeModel(Long id, ChangeConversationModelRequest request) {
        Conversation conversation = ownedConversation(id);
        ModeleLlm model = activeModel(request.modelAlias());
        conversation.changeModel(model);
        return toConversationResponse(conversation);
    }

    @Transactional
    public void archive(Long id) {
        Conversation conversation = ownedConversation(id);
        conversation.archive();
    }

    @Transactional
    public ConversationResponse restore(Long id) {
        Conversation conversation = ownedConversation(id);
        conversation.restore();
        return toConversationResponse(conversation);
    }

    @Transactional
    public void deletePermanent(Long id) {
        Conversation conversation = ownedConversation(id);
        Long conversationId = id;
        Utilisateur user = conversation.getUtilisateur();
        messageRepository.clearResponseLinksByConversationId(conversationId);
        messageRepository.deleteAllByConversationId(conversationId);
        messageRepository.flush();
        int deleted = conversationRepository.deleteOwnedById(conversationId, user);
        if (deleted == 0) {
            throw new ResponseStatusException(NOT_FOUND, "Conversation not found");
        }
    }

    @Transactional(readOnly = true)
    public List<MessageResponse> messages(Long conversationId) {
        Conversation conversation = ownedConversation(conversationId);
        return messageRepository.findByConversationOrderByOrdreAsc(conversation)
                .stream()
                .map(this::toMessageResponse)
                .toList();
    }

    @Transactional
    public StreamPreparation prepareStream(Long conversationId, SendMessageRequest request) {
        return prepareStream(conversationId, request.content(), List.of());
    }

    @Transactional
    public StreamPreparation prepareStream(Long conversationId, String content, List<MultipartFile> files) {
        content = content == null ? "" : content.trim();
        List<MultipartFile> safeFiles = files == null ? List.of() : files.stream()
                .filter(file -> file != null && !file.isEmpty())
                .toList();
        if (content.isBlank()) {
            if (!safeFiles.isEmpty()) {
                return prepareStreamWithFiles(conversationId, content, safeFiles);
            }
            throw new ResponseStatusException(BAD_REQUEST, "Message content must not be blank");
        }
        return prepareStreamWithFiles(conversationId, content, safeFiles);
    }

    private StreamPreparation prepareStreamWithFiles(Long conversationId, String content, List<MultipartFile> files) {

        Conversation conversation = ownedConversation(conversationId);
        if (conversation.getStatut() != StatutConversation.ACTIVE) {
            throw new ResponseStatusException(BAD_REQUEST, "Conversation is archived");
        }

        ModeleLlm generationModel = conversation.getModele();
        DlpSafeMessage safeMessage;
        try {
            if (files.isEmpty()) {
                String safeContent = dlpService.safeTextForLlm(content, conversation.getUtilisateur().getExternalId());
                safeMessage = new DlpSafeMessage(safeContent, content, null, List.of());
            } else {
                safeMessage = dlpService.safeMessageForLlm(content, files, conversation.getUtilisateur().getExternalId());
            }
        } catch (DlpBlockedException exception) {
            persistBlockedUserMessage(conversation, content, exception);
            throw exception;
        }
        int nextOrder = messageRepository.findMaxOrdre(conversation) + 1;
        Message userMessage = messageRepository.save(new Message(
                conversation,
                RoleMessage.USER,
                nextOrder,
                StatutMessage.TERMINE,
                safeMessage.persistedContent(),
                null
        ));
        userMessage.setAttachmentMetadataJson(serializeAttachments(safeMessage.attachments()));

        if ("Nouvelle conversation".equals(conversation.getTitre())) {
            conversation.rename(titleFrom(safeMessage.persistedContent()));
        }

        Message assistantMessage = messageRepository.save(new Message(
                conversation,
                RoleMessage.ASSISTANT,
                nextOrder + 1,
                StatutMessage.EN_COURS,
                "",
                userMessage,
                generationModel
        ));
        conversation.touchLastMessageAt(Instant.now());

        List<LiteLlmMessage> context = buildContext(conversation, userMessage, files.isEmpty() ? safeMessage.safePrompt() : safeMessage.safePrompt());
        return new StreamPreparation(
                generationModel.getAliasInterne(),
                assistantMessage.getId(),
                toMessageResponse(userMessage),
                toMessageResponse(assistantMessage),
                context
        );
    }

    @Transactional
    public SseEmitter streamMessage(Long conversationId, SendMessageRequest request) {
        return streamMessage(conversationId, request.content(), List.of());
    }

    @Transactional
    public SseEmitter streamMessage(Long conversationId, String content, List<MultipartFile> files) {
        SseEmitter emitter = new SseEmitter(0L);
        StreamPreparation preparation;
        try {
            preparation = prepareStream(conversationId, content, files);
        } catch (DlpAnalysisException exception) {
            trySend(emitter, "error", streamError(exception));
            emitter.complete();
            return emitter;
        }

        StringBuilder answer = new StringBuilder();

        trySend(emitter, "message", preparation.userMessage());
        trySend(emitter, "message", preparation.assistantMessage());

        liteLlmService.streamChat(
                preparation.modelAlias(),
                preparation.context(),
                token -> {
                    answer.append(token);
                    trySend(emitter, "token", token);
                },
                () -> {
                    messagePersistenceService.completeAssistantMessage(preparation.assistantMessageId(), answer.toString());
                    trySend(emitter, "done", new StreamDoneResponse(preparation.assistantMessageId(), answer.toString()));
                    emitter.complete();
                },
                error -> {
                    String fallback = answer.isEmpty() ? "Erreur pendant le streaming LiteLLM." : answer.toString();
                    messagePersistenceService.failAssistantMessage(preparation.assistantMessageId(), fallback);
                    trySend(emitter, "error", "Erreur pendant le streaming LiteLLM.");
                    emitter.complete();
                }
        );

        return emitter;
    }

    private List<LiteLlmMessage> buildContext(Conversation conversation, Message safeMessage, String safeContent) {
        List<Message> finishedMessages = messageRepository.findByConversationAndStatutAndRoleInOrderByOrdreAsc(
                conversation,
                StatutMessage.TERMINE,
                CONTEXT_ROLES
        );
        int fromIndex = Math.max(0, finishedMessages.size() - maxContextMessages);
        List<LiteLlmMessage> context = new ArrayList<>();
        for (Message message : finishedMessages.subList(fromIndex, finishedMessages.size())) {
            String content = safeContextContent(message, safeMessage, safeContent);
            context.add(new LiteLlmMessage(message.getRole().name().toLowerCase(), content));
        }
        return context;
    }

    private String safeContextContent(Message message, Message currentUserMessage, String currentSafeContent) {
        if (isSameMessage(message, currentUserMessage)) {
            return currentSafeContent;
        }
        return dlpService.safeTextForLlm(message.getContenu(), message.getConversation().getUtilisateur().getExternalId());
    }

    private boolean isSameMessage(Message candidate, Message reference) {
        if (candidate == reference) {
            return true;
        }
        return candidate.getId() != null && candidate.getId().equals(reference.getId());
    }

    private Conversation ownedConversation(Long id) {
        return conversationRepository.findOwnedById(id, demoUserProvider.currentUser())
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "Conversation not found"));
    }

    private ModeleLlm activeModel(String modelAlias) {
        return modeleLlmRepository.findByAliasInterneAndStatut(modelAlias, StatutModeleLlm.ACTIF)
                .orElseThrow(() -> new ResponseStatusException(BAD_REQUEST, "Unknown or inactive model: " + modelAlias));
    }

    private ConversationResponse toConversationResponse(Conversation conversation) {
        return new ConversationResponse(
                conversation.getId(),
                conversation.getTitre(),
                conversation.getModele().getAliasInterne(),
                conversation.getModele().getNomAffichage(),
                conversation.getStatut().name(),
                conversation.getCreatedAt(),
                conversation.getUpdatedAt(),
                conversation.getDernierMessageAt()
        );
    }

    private MessageResponse toMessageResponse(Message message) {
        Long responseToId = message.getReponseA() == null ? null : message.getReponseA().getId();
        String modelAlias = message.getModele() == null ? null : message.getModele().getAliasInterne();
        String modelDisplayName = message.getModele() == null ? null : message.getModele().getNomAffichage();
        return new MessageResponse(
                message.getId(),
                message.getRole().name(),
                message.getOrdre(),
                message.getStatut().name(),
                message.getContenu(),
                responseToId,
                modelAlias,
                modelDisplayName,
                message.getDlpHighestSeverity(),
                parseDetectedTypes(message.getDlpDetectedTypes()),
                parseDlpMatches(message.getDlpMatches()),
                message.getDlpMaskedText(),
                parseAttachments(message.getAttachmentMetadataJson()),
                message.getCreatedAt(),
                message.getUpdatedAt()
        );
    }

    private void persistBlockedUserMessage(Conversation conversation, String content, DlpBlockedException exception) {
        int nextOrder = messageRepository.findMaxOrdre(conversation) + 1;
        String maskedText = exception.getMaskedText() == null ? "" : exception.getMaskedText();
        Message userMessage = new Message(
                conversation,
                RoleMessage.USER,
                nextOrder,
                StatutMessage.DLP_BLOCKED,
                maskedText,
                null
        );
        userMessage.blockByDlp(
                exception.getHighestSeverity(),
                serializeDetectedTypes(exception.getDetectedTypes()),
                serializeDlpMatches(exception.getMatches()),
                maskedText
        );
        userMessage.setAttachmentMetadataJson(serializeAttachments(exception.getAttachments()));
        messageRepository.save(userMessage);
        if ("Nouvelle conversation".equals(conversation.getTitre())) {
            conversation.rename(titleFromMasked(maskedText));
        }
        conversation.touchLastMessageAt(Instant.now());
    }

    private String serializeDetectedTypes(Set<String> detectedTypes) {
        if (detectedTypes == null || detectedTypes.isEmpty()) {
            return "";
        }
        return detectedTypes.stream()
                .filter(type -> type != null && !type.isBlank())
                .sorted(Comparator.naturalOrder())
                .collect(Collectors.joining(","));
    }

    private List<String> parseDetectedTypes(String detectedTypes) {
        if (detectedTypes == null || detectedTypes.isBlank()) {
            return List.of();
        }
        return Arrays.stream(detectedTypes.split(","))
                .map(String::trim)
                .filter(type -> !type.isBlank())
                .toList();
    }

    private String serializeDlpMatches(List<DlpPublicMatch> matches) {
        if (matches == null || matches.isEmpty()) {
            return "";
        }
        return matches.stream()
                .map(match -> encodeMatchField(match.type()) + "\t"
                        + valueOrEmpty(match.start()) + "\t"
                        + valueOrEmpty(match.end()) + "\t"
                        + valueOrEmpty(match.lineNumber()) + "\t"
                        + encodeMatchField(match.placeholder()))
                .collect(Collectors.joining("\n"));
    }

    private String serializeAttachments(List<AttachmentMetadata> attachments) {
        if (attachments == null || attachments.isEmpty()) {
            return "";
        }
        return attachments.stream()
                .map(attachment -> encodeMatchField(attachment.filename()) + "\t"
                        + encodeMatchField(attachment.mimeType()) + "\t"
                        + attachment.size() + "\t"
                        + encodeMatchField(attachment.decision()) + "\t"
                        + attachment.safeCharacters() + "\t"
                        + attachment.estimatedTokens() + "\t"
                        + encodeMatchField(attachment.extractionStatus()))
                .collect(Collectors.joining("\n"));
    }

    private List<AttachmentMetadata> parseAttachments(String value) {
        if (value == null || value.isBlank()) {
            return List.of();
        }
        return Arrays.stream(value.split("\\R"))
                .map(this::parseAttachment)
                .filter(attachment -> attachment != null)
                .toList();
    }

    private AttachmentMetadata parseAttachment(String line) {
        String[] parts = line.split("\\t", -1);
        if (parts.length != 7) {
            return null;
        }
        return new AttachmentMetadata(
                decodeMatchField(parts[0]),
                decodeMatchField(parts[1]),
                parseLong(parts[2]),
                decodeMatchField(parts[3]),
                parseInteger(parts[4]) == null ? 0 : parseInteger(parts[4]),
                parseInteger(parts[5]) == null ? 0 : parseInteger(parts[5]),
                decodeMatchField(parts[6])
        );
    }

    private List<DlpPublicMatch> parseDlpMatches(String matches) {
        if (matches == null || matches.isBlank()) {
            return List.of();
        }
        return Arrays.stream(matches.split("\\R"))
                .map(this::parseDlpMatch)
                .filter(match -> match != null)
                .toList();
    }

    private DlpPublicMatch parseDlpMatch(String line) {
        String[] parts = line.split("\\t", -1);
        if (parts.length != 5) {
            return null;
        }
        return new DlpPublicMatch(
                decodeMatchField(parts[0]),
                parseInteger(parts[1]),
                parseInteger(parts[2]),
                parseInteger(parts[3]),
                decodeMatchField(parts[4])
        );
    }

    private String encodeMatchField(String value) {
        return value == null ? "" : value.replace("%", "%25").replace("\t", "%09").replace("\n", "%0A").replace("\r", "%0D");
    }

    private String decodeMatchField(String value) {
        return value.replace("%0D", "\r").replace("%0A", "\n").replace("%09", "\t").replace("%25", "%");
    }

    private String valueOrEmpty(Integer value) {
        return value == null ? "" : String.valueOf(value);
    }

    private Integer parseInteger(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        try {
            return Integer.valueOf(value);
        } catch (NumberFormatException exception) {
            return null;
        }
    }

    private long parseLong(String value) {
        if (value == null || value.isBlank()) {
            return 0L;
        }
        try {
            return Long.parseLong(value);
        } catch (NumberFormatException exception) {
            return 0L;
        }
    }

    private void trySend(SseEmitter emitter, String event, Object value) {
        try {
            emitter.send(SseEmitter.event().name(event).data(value));
        } catch (IOException ignored) {
            emitter.complete();
        }
    }

    private StreamErrorResponse streamError(DlpAnalysisException exception) {
        if (exception instanceof DlpBlockedException blockedException) {
            return new StreamErrorResponse(
                    "DLP_BLOCKED",
                    "Votre message contient une donnée sensible et ne peut pas être envoyé.",
                    blockedException.getDetectedTypes(),
                    blockedException.getHighestSeverity(),
                    blockedException.getMaskedText(),
                    blockedException.getMatches(),
                    blockedException.getAttachments()
            );
        }
        if (exception instanceof DlpUnavailableException) {
            return new StreamErrorResponse(
                    "DLP_UNAVAILABLE",
                    "Le contrôle de sécurité est indisponible. Le message n’a pas été envoyé au modèle.",
                    Set.of(),
                    null,
                    null,
                    List.of(),
                    List.of()
            );
        }
        return new StreamErrorResponse(
                "DLP_ERROR",
                "Le contrôle de sécurité n’a pas pu analyser le message. Le message n’a pas été envoyé au modèle.",
                Set.of(),
                null,
                null,
                List.of(),
                List.of()
        );
    }

    private String normalizeTitle(String title, String fallback) {
        String value = title == null || title.isBlank() ? fallback : title.trim();
        return value.length() > 160 ? value.substring(0, 160) : value;
    }

    private String titleFrom(String content) {
        String compact = content.replaceAll("\\s+", " ").trim();
        if (compact.regionMatches(true, 0, "Pieces jointes:", 0, "Pieces jointes:".length())) {
            return "Nouvelle conversation";
        }
        String[] words = compact.split("\\s+");
        List<String> meaningfulWords = new ArrayList<>();
        for (String word : words) {
            String cleaned = word.replaceAll("[^\\p{L}\\p{N}]", "");
            if (cleaned.length() >= 4) {
                meaningfulWords.add(cleaned);
            }
            if (meaningfulWords.size() == 6) {
                break;
            }
        }
        if (!meaningfulWords.isEmpty()) {
            return "Discussion: " + String.join(" ", meaningfulWords);
        }
        if (compact.length() <= 48) {
            return "Discussion: " + compact;
        }
        return "Discussion: " + compact.substring(0, 45) + "...";
    }

    private String titleFromMasked(String content) {
        String compact = content == null ? "" : content.replaceAll("\\s+", " ").trim();
        if (compact.isBlank()) {
            return "Discussion bloquée";
        }
        String title = "Discussion: " + compact;
        return title.length() <= 160 ? title : title.substring(0, 157) + "...";
    }

    private String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private String searchPattern(String value) {
        String normalized = blankToNull(value);
        return normalized == null ? null : "%" + normalized.toLowerCase() + "%";
    }

    public record StreamPreparation(
            String modelAlias,
            Long assistantMessageId,
            MessageResponse userMessage,
            MessageResponse assistantMessage,
            List<LiteLlmMessage> context
    ) {
    }

    public record StreamDoneResponse(
            Long messageId,
            String content
    ) {
    }

    public record StreamErrorResponse(
            String code,
            String message,
            Set<String> detectedTypes,
            String highestSeverity,
            String maskedText,
            List<DlpPublicMatch> matches,
            List<AttachmentMetadata> attachments
    ) {
    }
}

