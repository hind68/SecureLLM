package com.example.backend.repository;

import com.example.backend.entity.Conversation;
import com.example.backend.entity.Message;
import com.example.backend.entity.RoleMessage;
import com.example.backend.entity.StatutMessage;
import java.util.Collection;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
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

    void deleteByConversation(Conversation conversation);
}
