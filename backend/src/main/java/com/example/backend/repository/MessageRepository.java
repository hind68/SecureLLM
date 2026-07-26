package com.example.backend.repository;

import com.example.backend.entity.Conversation;
import com.example.backend.entity.Message;
import com.example.backend.enums.RoleMessage;
import com.example.backend.enums.StatutMessage;
import java.util.Collection;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface MessageRepository extends JpaRepository<Message, Long> {

    List<Message> findByConversationOrderByOrdreAsc(Conversation conversation);

    List<Message> findByConversationAndStatutAndRoleInOrderByOrdreAsc(
            Conversation conversation,
            StatutMessage statut,
            Collection<RoleMessage> roles
    );

    @Query("select coalesce(max(m.ordre), 0) from Message m where m.conversation = :conversation")
    int findMaxOrdre(@Param("conversation") Conversation conversation);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("update Message m set m.reponseA = null where m.conversation = :conversation")
    void clearResponseLinksByConversation(@Param("conversation") Conversation conversation);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("update Message m set m.reponseA = null where m.conversation.id = :conversationId")
    void clearResponseLinksByConversationId(@Param("conversationId") Long conversationId);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("delete from Message m where m.conversation = :conversation")
    void deleteAllByConversation(@Param("conversation") Conversation conversation);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("delete from Message m where m.conversation.id = :conversationId")
    void deleteAllByConversationId(@Param("conversationId") Long conversationId);
}

