package com.example.backend.service;

import com.example.backend.entity.Conversation;
import com.example.backend.entity.Message;
import com.example.backend.repository.ConversationRepository;
import com.example.backend.repository.MessageRepository;
import java.time.Instant;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class MessagePersistenceService {

    private final MessageRepository messageRepository;
    private final ConversationRepository conversationRepository;

    public MessagePersistenceService(MessageRepository messageRepository, ConversationRepository conversationRepository) {
        this.messageRepository = messageRepository;
        this.conversationRepository = conversationRepository;
    }

    @Transactional
    public void completeAssistantMessage(Long messageId, String content) {
        Message message = messageRepository.findById(messageId).orElseThrow();
        message.complete(content);
        touchConversation(message.getConversation());
    }

    @Transactional
    public void failAssistantMessage(Long messageId, String content) {
        Message message = messageRepository.findById(messageId).orElseThrow();
        message.fail(content);
        touchConversation(message.getConversation());
    }

    private void touchConversation(Conversation conversation) {
        conversation.touchLastMessageAt(Instant.now());
        conversationRepository.save(conversation);
    }
}
