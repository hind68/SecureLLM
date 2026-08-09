package com.example.backend.service;

import com.example.backend.dto.AttachmentInspectionResponse;
import com.example.backend.dto.AttachmentSecureResponse;
import com.example.backend.entity.Attachment;
import com.example.backend.entity.Message;
import com.example.backend.entity.Utilisateur;
import com.example.backend.enums.RoleMessage;
import com.example.backend.enums.StatutMessage;
import com.example.backend.repository.AttachmentRepository;
import java.lang.reflect.Field;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class AttachmentServiceTest {

    private AttachmentRepository attachmentRepository;
    private DemoUserProvider demoUserProvider;
    private Utilisateur user;
    private AttachmentService attachmentService;

    @BeforeEach
    void setUp() {
        attachmentRepository = mock(AttachmentRepository.class);
        demoUserProvider = mock(DemoUserProvider.class);
        user = mock(Utilisateur.class);
        when(demoUserProvider.currentUser()).thenReturn(user);
        attachmentService = new AttachmentService(attachmentRepository, demoUserProvider, "storage/attachments-test");
    }

    @Test
    void secureReturnsStoredFileMaskedTextOnly() {
        Attachment attachment = attachment(
                "safe.txt",
                "line one\nsecret sk-test-secret",
                "line one\nsecret [OPENAI_API_KEY_1]",
                ""
        );
        when(attachmentRepository.findOwnedById(42L, user)).thenReturn(Optional.of(attachment));

        AttachmentSecureResponse secure = attachmentService.secure(42L);

        assertThat(secure.attachmentId()).isEqualTo(42L);
        assertThat(secure.maskedText())
                .isEqualTo("line one\nsecret [OPENAI_API_KEY_1]")
                .contains("[OPENAI_API_KEY_1]")
                .doesNotContain("Pieces jointes:");
    }

    @Test
    void inspectionPreservesStoredLineNumbersForMultilineFiles() {
        String extracted = String.join("\n",
                "line one",
                "email admin@example.com",
                "line three",
                "token sk-test-secret"
        );
        String matches = String.join("\n",
                "secrets.log\temail_1\temail\t15\t32\t2\tmedium\t[EMAIL_1]",
                "secrets.log\topenai_api_key_1\topenai_api_key\t50\t64\t4\thigh\t[OPENAI_API_KEY_1]"
        );
        Attachment attachment = attachment("secrets.log", extracted, "masked", matches);
        when(attachmentRepository.findOwnedById(42L, user)).thenReturn(Optional.of(attachment));

        AttachmentInspectionResponse inspection = attachmentService.inspection(42L);

        assertThat(inspection.attachmentId()).isEqualTo(42L);
        assertThat(inspection.extractedText()).isEqualTo(extracted);
        assertThat(inspection.matches())
                .extracting("type", "lineNumber", "placeholder")
                .containsExactly(
                        org.assertj.core.groups.Tuple.tuple("email", 2, "[EMAIL_1]"),
                        org.assertj.core.groups.Tuple.tuple("openai_api_key", 4, "[OPENAI_API_KEY_1]")
                );
    }

    @Test
    void inspectionDropsStoredMatchesWhenExtractedTextIsMissing() {
        Attachment attachment = attachment("secrets.log", "", "", "secrets.log\temail_1\temail\t0\t18\t1\tmedium\t[EMAIL_1]");
        when(attachmentRepository.findOwnedById(42L, user)).thenReturn(Optional.of(attachment));

        AttachmentInspectionResponse inspection = attachmentService.inspection(42L);

        assertThat(inspection.extractedText()).isEmpty();
        assertThat(inspection.matches()).isEmpty();
    }

    @Test
    void secureBuildsMaskedTextFromStoredMatchesWhenMissing() {
        String extracted = "Email admin@example.com\nToken sk-test-secret";
        String matches = String.join("\n",
                "secrets.log\temail_1\temail\t6\t23\t1\tmedium\t[EMAIL_1]",
                "secrets.log\topenai_api_key_1\topenai_api_key\t30\t44\t2\thigh\t[OPENAI_API_KEY_1]"
        );
        Attachment attachment = attachment("secrets.log", extracted, "", matches);
        when(attachmentRepository.findOwnedById(42L, user)).thenReturn(Optional.of(attachment));

        AttachmentSecureResponse secure = attachmentService.secure(42L);

        assertThat(secure.maskedText()).isEqualTo("Email [EMAIL_1]\nToken [OPENAI_API_KEY_1]");
    }

    private Attachment attachment(String filename, String extractedText, String maskedText, String matchesJson) {
        Message message = new Message(null, RoleMessage.USER, 1, StatutMessage.TERMINE, "prompt", null);
        Attachment attachment = new Attachment(
                message,
                filename,
                "conversation/message/" + filename,
                "text/plain",
                extractedText.length(),
                "MASK",
                "SUCCESS",
                extractedText,
                maskedText,
                matchesJson
        );
        setId(attachment, 42L);
        return attachment;
    }

    private void setId(Attachment attachment, Long id) {
        try {
            Field field = Attachment.class.getDeclaredField("id");
            field.setAccessible(true);
            field.set(attachment, id);
        } catch (ReflectiveOperationException exception) {
            throw new AssertionError(exception);
        }
    }
}
