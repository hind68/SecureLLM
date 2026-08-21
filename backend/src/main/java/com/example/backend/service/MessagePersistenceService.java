package com.example.backend.service;

import com.example.backend.entity.Conversation;
import com.example.backend.entity.Message;
import com.example.backend.repository.ConversationRepository;
import com.example.backend.repository.MessageRepository;
import java.time.Instant;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
/**
 * Persiste l'état des messages assistant depuis les callbacks de streaming.
 *
 * <p>Les callbacks SSE de fin/erreur s'exécutent après le retour de la méthode
 * contrôleur ; ils ont donc besoin d'une transaction dédiée au lieu de dépendre
 * de celle qui a préparé le stream.</p>
 */
public class MessagePersistenceService {

    private static final Logger log = LoggerFactory.getLogger(MessagePersistenceService.class);

    private final MessageRepository messageRepository;
    private final ConversationRepository conversationRepository;

    public MessagePersistenceService(MessageRepository messageRepository, ConversationRepository conversationRepository) {
        this.messageRepository = messageRepository;
        this.conversationRepository = conversationRepository;
    }

    @Transactional
    /**
     * Marque un message assistant streamé comme terminé et rafraîchit le
     * timestamp de tri de la conversation.
     *
     * <p>Appelée depuis le callback de fin de stream LiteLLM (thread Reactor,
     * après que l'émetteur SSE a déjà été retourné au conteneur servlet) : ne
     * lève jamais si le message a disparu entre-temps, pour que l'appelant
     * puisse toujours terminer proprement l'émetteur.</p>
     */
    public void completeAssistantMessage(Long messageId, String content) {
        Optional<Message> message = messageRepository.findById(messageId);
        if (message.isEmpty()) {
            log.warn("Assistant message {} vanished before stream completion; skipping persistence", messageId);
            return;
        }
        message.get().complete(content);
        touchConversation(message.get().getConversation());
    }

    @Transactional
    /**
     * Stocke le meilleur contenu assistant disponible en cas d'échec du
     * streaming afin que l'historique reste cohérent.
     *
     * <p>Même contrat que {@link #completeAssistantMessage} : ne lève jamais
     * pour un message introuvable, afin de ne jamais bloquer la terminaison
     * de l'émetteur SSE appelant.</p>
     */
    public void failAssistantMessage(Long messageId, String content) {
        Optional<Message> message = messageRepository.findById(messageId);
        if (message.isEmpty()) {
            log.warn("Assistant message {} vanished before stream failure handling; skipping persistence", messageId);
            return;
        }
        message.get().fail(content);
        touchConversation(message.get().getConversation());
    }

    private void touchConversation(Conversation conversation) {
        conversation.touchLastMessageAt(Instant.now());
        conversationRepository.save(conversation);
    }
}
