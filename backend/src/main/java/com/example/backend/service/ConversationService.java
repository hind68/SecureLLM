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
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.core.JacksonException;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;

import static org.springframework.http.HttpStatus.BAD_REQUEST;
import static org.springframework.http.HttpStatus.NOT_FOUND;

@Service
/**
 * Coordonne le cycle de vie du chat pour la passerelle de démonstration :
 * propriété des conversations, validation DLP, persistance des messages,
 * streaming LiteLLM et diffusion SSE.
 *
 * <p>Le service traite volontairement le DLP comme une barrière stricte avant
 * tout appel au modèle. Si la couche DLP bloque le contenu ou devient
 * indisponible, l'entrée utilisateur n'est pas envoyée à LiteLLM.</p>
 */
public class ConversationService {

    private static final Logger log = LoggerFactory.getLogger(ConversationService.class);
    private static final Set<RoleMessage> CONTEXT_ROLES = Set.of(RoleMessage.USER, RoleMessage.ASSISTANT);
    public static final int MAX_ATTACHMENTS_PER_MESSAGE = 10;
    public static final String MAX_ATTACHMENTS_MESSAGE = "Vous pouvez joindre jusqu'à 10 fichiers par message. Supprimez un fichier avant d'en ajouter un autre.";

    private final ConversationRepository conversationRepository;
    private final MessageRepository messageRepository;
    private final ModeleLlmRepository modeleLlmRepository;
    private final DemoUserProvider demoUserProvider;
    private final LiteLlmService liteLlmService;
    private final DlpService dlpService;
    private final MessagePersistenceService messagePersistenceService;
    private final AttachmentService attachmentService;
    private final ObjectMapper objectMapper;
    private final int maxContextMessages;

    public ConversationService(
            ConversationRepository conversationRepository,
            MessageRepository messageRepository,
            ModeleLlmRepository modeleLlmRepository,
            DemoUserProvider demoUserProvider,
            LiteLlmService liteLlmService,
            DlpService dlpService,
            MessagePersistenceService messagePersistenceService,
            AttachmentService attachmentService,
            ObjectMapper objectMapper,
            @Value("${gateway.context.max-messages:20}") int maxContextMessages
    ) {
        this.conversationRepository = conversationRepository;
        this.messageRepository = messageRepository;
        this.modeleLlmRepository = modeleLlmRepository;
        this.demoUserProvider = demoUserProvider;
        this.liteLlmService = liteLlmService;
        this.dlpService = dlpService;
        this.messagePersistenceService = messagePersistenceService;
        this.attachmentService = attachmentService;
        this.objectMapper = objectMapper;
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
        attachmentService.deleteFilesForConversation(conversation);
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
    /**
     * Prépare une paire de messages utilisateur/assistant pour le streaming.
     *
     * <p>Cette méthode persiste d'abord le message utilisateur sécurisé, crée
     * un message assistant en cours, puis retourne le contexte exact qui peut
     * être envoyé à LiteLLM. Le contenu sensible est soit masqué par le DLP,
     * soit bloqué avant la fin de cette préparation.</p>
     */
    public StreamPreparation prepareStream(Long conversationId, String content, List<MultipartFile> files) {
        content = content == null ? "" : content.trim();
        List<MultipartFile> safeFiles = files == null ? List.of() : files.stream()
                .filter(file -> file != null && !file.isEmpty())
                .toList();
        if (safeFiles.size() > MAX_ATTACHMENTS_PER_MESSAGE) {
            throw new AttachmentLimitExceededException(MAX_ATTACHMENTS_PER_MESSAGE, safeFiles.size());
        }
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
            // Persister les prompts bloqués permet à l'UI d'afficher
            // l'historique sans transmettre de contenu sensible au fournisseur.
            List<AttachmentMetadata> persistedAttachments = persistBlockedUserMessage(conversation, content, files, exception);
            throw new PersistedDlpBlockedException(exception, persistedAttachments);
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
        List<AttachmentMetadata> persistedAttachments = attachmentService.store(userMessage, files, safeMessage.attachments());
        userMessage.setAttachmentMetadataJson(serializeAttachments(persistedAttachments));

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
    /**
     * Diffuse une réponse au frontend via SSE et persiste l'état final de
     * l'assistant séparément lorsque LiteLLM termine ou échoue.
     */
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
                    // Le callback de stream s'exécute après le retour de cette
                    // méthode, donc la persistance a sa propre transaction. Un
                    // échec de persistance ne doit jamais empêcher l'émetteur
                    // SSE de se terminer, sinon le client reste bloqué (pas de
                    // timeout sur cet émetteur).
                    try {
                        messagePersistenceService.completeAssistantMessage(preparation.assistantMessageId(), answer.toString());
                    } catch (RuntimeException persistenceError) {
                        log.warn("Failed to persist completed assistant message {}", preparation.assistantMessageId(), persistenceError);
                    }
                    trySend(emitter, "done", new StreamDoneResponse(preparation.assistantMessageId(), answer.toString()));
                    emitter.complete();
                },
                error -> {
                    String fallback = answer.isEmpty() ? "Erreur pendant le streaming LiteLLM." : answer.toString();
                    try {
                        messagePersistenceService.failAssistantMessage(preparation.assistantMessageId(), fallback);
                    } catch (RuntimeException persistenceError) {
                        log.warn("Failed to persist failed assistant message {}", preparation.assistantMessageId(), persistenceError);
                    }
                    trySend(emitter, "error", "Erreur pendant le streaming LiteLLM.");
                    emitter.complete();
                }
        );

        return emitter;
    }

    @Transactional
    public SseEmitter streamSecureAttachment(Long conversationId, Long attachmentId) {
        String maskedText = attachmentService.maskedTextForConversationAttachment(attachmentId, conversationId);
        if (maskedText.isBlank()) {
            throw new ResponseStatusException(BAD_REQUEST, "Secure attachment content is empty");
        }
        return streamMessage(conversationId, maskedText, List.of());
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
        // Repasser l'historique stocké par le DLP avant de construire le
        // contexte empêche les anciens contenus de contourner la politique.
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

    private List<AttachmentMetadata> persistBlockedUserMessage(Conversation conversation, String content, List<MultipartFile> files, DlpBlockedException exception) {
        int nextOrder = messageRepository.findMaxOrdre(conversation) + 1;
        String maskedText = exception.getMaskedText() == null ? "" : exception.getMaskedText();
        Message userMessage = new Message(
                conversation,
                RoleMessage.USER,
                nextOrder,
                StatutMessage.DLP_BLOCKED,
                maskedText,
                null,
                conversation.getModele()
        );
        userMessage.blockByDlp(
                exception.getHighestSeverity(),
                serializeDetectedTypes(exception.getDetectedTypes()),
                serializeDlpMatches(exception.getMatches()),
                maskedText
        );
        Message persisted = messageRepository.save(userMessage);
        if (persisted == null) {
            persisted = userMessage;
        }
        List<AttachmentMetadata> persistedAttachments = attachmentService.store(persisted, files, exception.getAttachments());
        persisted.setAttachmentMetadataJson(serializeAttachments(persistedAttachments));
        if ("Nouvelle conversation".equals(conversation.getTitre())) {
            conversation.rename(titleFromMasked(maskedText));
        }
        conversation.touchLastMessageAt(Instant.now());
        return persistedAttachments;
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
                .map(match -> valueOrEmptyLong(match.attachmentId()) + "\t"
                        + encodeMatchField(match.source()) + "\t"
                        + encodeMatchField(match.id()) + "\t"
                        + encodeMatchField(match.type()) + "\t"
                        + valueOrEmpty(match.start()) + "\t"
                        + valueOrEmpty(match.end()) + "\t"
                        + valueOrEmpty(match.lineNumber()) + "\t"
                        + encodeMatchField(match.severity()) + "\t"
                        + encodeMatchField(match.placeholder()))
                .collect(Collectors.joining("\n"));
    }

    private static final TypeReference<List<AttachmentMetadata>> ATTACHMENT_METADATA_LIST_TYPE = new TypeReference<>() {
    };

    private String serializeAttachments(List<AttachmentMetadata> attachments) {
        if (attachments == null || attachments.isEmpty()) {
            return "";
        }
        return objectMapper.writeValueAsString(attachments);
    }

    private List<AttachmentMetadata> parseAttachments(String value) {
        if (value == null || value.isBlank()) {
            return List.of();
        }
        try {
            return objectMapper.readValue(value, ATTACHMENT_METADATA_LIST_TYPE);
        } catch (JacksonException exception) {
            log.warn("Unable to parse stored attachment metadata; returning empty list", exception);
            return List.of();
        }
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
        if (parts.length == 5) {
            return new DlpPublicMatch(
                    null,
                    null,
                    null,
                    decodeMatchField(parts[0]),
                    parseInteger(parts[1]),
                    parseInteger(parts[2]),
                    parseInteger(parts[3]),
                    null,
                    decodeMatchField(parts[4])
            );
        }
        if (parts.length == 7) {
            return new DlpPublicMatch(
                    parseLongObject(parts[0]),
                    decodeMatchField(parts[1]),
                    null,
                    decodeMatchField(parts[2]),
                    parseInteger(parts[3]),
                    parseInteger(parts[4]),
                    parseInteger(parts[5]),
                    null,
                    decodeMatchField(parts[6])
            );
        }
        if (parts.length == 8) {
            return new DlpPublicMatch(
                    parseLongObject(parts[0]),
                    decodeMatchField(parts[1]),
                    null,
                    decodeMatchField(parts[2]),
                    parseInteger(parts[3]),
                    parseInteger(parts[4]),
                    parseInteger(parts[5]),
                    decodeMatchField(parts[6]),
                    decodeMatchField(parts[7])
            );
        }
        if (parts.length != 9) {
            return null;
        }
        return new DlpPublicMatch(
                parseLongObject(parts[0]),
                decodeMatchField(parts[1]),
                decodeMatchField(parts[2]),
                decodeMatchField(parts[3]),
                parseInteger(parts[4]),
                parseInteger(parts[5]),
                parseInteger(parts[6]),
                decodeMatchField(parts[7]),
                decodeMatchField(parts[8])
        );
    }

    private String encodeMatchField(String value) {
        // Les métadonnées DLP restent dans des colonnes texte pour rester
        // compatibles avec les migrations existantes ; l'échappement évite que
        // les tabulations et retours ligne cassent le parsing.
        return value == null ? "" : value.replace("%", "%25").replace("\t", "%09").replace("\n", "%0A").replace("\r", "%0D");
    }

    private String decodeMatchField(String value) {
        return value.replace("%0D", "\r").replace("%0A", "\n").replace("%09", "\t").replace("%25", "%");
    }

    private String valueOrEmpty(Integer value) {
        return value == null ? "" : String.valueOf(value);
    }

    private String valueOrEmptyLong(Long value) {
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

    private Long parseLongObject(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        try {
            return Long.valueOf(value);
        } catch (NumberFormatException exception) {
            return null;
        }
    }

    private void trySend(SseEmitter emitter, String event, Object value) {
        try {
            emitter.send(SseEmitter.event().name(event).data(value));
        } catch (IOException ignored) {
            // Les déconnexions navigateur sont normales en SSE ; terminer
            // l'emitter suffit car le callback LiteLLM gère la persistance.
            emitter.complete();
        }
    }

    private StreamErrorResponse streamError(DlpAnalysisException exception) {
        if (exception instanceof DlpBlockedException blockedException) {
            List<AttachmentMetadata> attachments = blockedException instanceof PersistedDlpBlockedException persisted
                    ? persisted.persistedAttachments()
                    : blockedException.getAttachments().stream().map(attachment -> attachment.metadata(null)).toList();
            return new StreamErrorResponse(
                    "DLP_BLOCKED",
                    "Votre message contient une donnée sensible et ne peut pas être envoyé.",
                    blockedException.getDetectedTypes(),
                    blockedException.getHighestSeverity(),
                    blockedException.getMaskedText(),
                    blockedException.getMatches(),
                    attachments
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

    private static class PersistedDlpBlockedException extends DlpBlockedException {
        private final List<AttachmentMetadata> persistedAttachments;

        PersistedDlpBlockedException(DlpBlockedException source, List<AttachmentMetadata> persistedAttachments) {
            super(
                    source.getHighestSeverity(),
                    source.getDetectedTypes(),
                    source.getMaskedText(),
                    source.getMatches(),
                    source.getAttachments()
            );
            this.persistedAttachments = persistedAttachments == null ? List.of() : List.copyOf(persistedAttachments);
        }

        List<AttachmentMetadata> persistedAttachments() {
            return persistedAttachments;
        }
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

