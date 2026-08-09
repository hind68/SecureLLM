package com.example.backend.service;

import com.example.backend.integration.dlp.DlpAnalysisResponse;
import com.example.backend.integration.dlp.DlpBlockedException;
import com.example.backend.integration.dlp.DlpClient;
import com.example.backend.integration.dlp.DlpDecision;
import com.example.backend.integration.dlp.DlpInvalidResponseException;
import com.example.backend.integration.dlp.DlpMatch;
import com.example.backend.integration.dlp.DlpMultiSourceAnalysisResponse;
import com.example.backend.integration.dlp.DlpSourceResult;
import com.example.backend.integration.dlp.DlpUnavailableException;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

@ExtendWith(MockitoExtension.class)
class DlpServiceTest {

    @Mock
    private DlpClient dlpClient;

    @InjectMocks
    private DlpService dlpService;

    @Test
    void allowReturnsMaskedTextFromDlp() {
        when(dlpClient.analyse("hello", "demo-user"))
                .thenReturn(response(DlpDecision.ALLOW, "hello", List.of()));

        String safeText = dlpService.safeTextForLlm("hello", "demo-user");

        assertThat(safeText).isEqualTo("hello");
    }

    @Test
    void maskReturnsMaskedTextFromDlp() {
        when(dlpClient.analyse("key abc", "demo-user"))
                .thenReturn(response(DlpDecision.MASK, "key [MASKED]", List.of()));

        String safeText = dlpService.safeTextForLlm("key abc", "demo-user");

        assertThat(safeText).isEqualTo("key [MASKED]");
    }

    @Test
    void blockThrowsBeforeAnyCallerCanReachLlm() {
        DlpMatch match = new DlpMatch("moroccan_cin_1", "moroccan_cin", 0, 3, "HIGH", "regex", 1.0, null);
        DlpMatch duplicateMatch = new DlpMatch("moroccan_cin_2", "moroccan_cin", 5, 8, "HIGH", "regex", 1.0, null);
        when(dlpClient.analyse("key abc", "demo-user"))
                .thenReturn(response(DlpDecision.BLOCK, "key [MOROCCAN_CIN_1]", List.of(match, duplicateMatch)));

        assertThatThrownBy(() -> dlpService.safeTextForLlm("key abc", "demo-user"))
                .isInstanceOf(DlpBlockedException.class)
                .satisfies(exception -> {
                    DlpBlockedException blocked = (DlpBlockedException) exception;
                    assertThat(blocked.getHighestSeverity()).isEqualTo("HIGH");
                    assertThat(blocked.getDetectedTypes()).containsExactly("moroccan_cin");
                    assertThat(blocked.getMaskedText()).isEqualTo("key [MOROCCAN_CIN_1]");
                    assertThat(blocked.getMatches())
                            .extracting("type", "start", "end", "lineNumber", "placeholder")
                            .contains(
                                    org.assertj.core.groups.Tuple.tuple("moroccan_cin", 0, 3, 1, "[MOROCCAN_CIN_1]"),
                                    org.assertj.core.groups.Tuple.tuple("moroccan_cin", 5, 8, 1, "[MOROCCAN_CIN_2]")
                            );
                });
    }

    @Test
    void invalidDlpStatusFailsClosed() {
        when(dlpClient.analyse("hello", "demo-user"))
                .thenReturn(new DlpAnalysisResponse("ERROR", DlpDecision.ALLOW, false, null, "hello", "hello", List.of(), List.of()));

        assertThatThrownBy(() -> dlpService.safeTextForLlm("hello", "demo-user"))
                .isInstanceOf(DlpUnavailableException.class);
    }

    @Test
    void allowWithoutMaskedTextFailsClosed() {
        when(dlpClient.analyse("hello", "demo-user"))
                .thenReturn(response(DlpDecision.ALLOW, null, List.of()));

        assertThatThrownBy(() -> dlpService.safeTextForLlm("hello", "demo-user"))
                .isInstanceOf(DlpInvalidResponseException.class);
    }

    @Test
    void analyseMessageBuildsSafePromptFromMaskedSourcesOnly() {
        MockMultipartFile file = new MockMultipartFile("files", "client.txt", "text/plain", "email".getBytes());
        List<MultipartFile> files = List.of(file);
        when(dlpClient.analyseMessage("Resume", files, "demo-user"))
                .thenReturn(new DlpMultiSourceAnalysisResponse(
                        "SUCCESS",
                        DlpDecision.MASK,
                        true,
                        "medium",
                        List.of(
                                source("message", DlpDecision.ALLOW, "Resume", List.of()),
                                source("client.txt", DlpDecision.MASK, "Contact [EMAIL_1]", List.of(
                                        new DlpMatch("email_1", "email", 8, 26, "medium", "regex", 1.0, null)
                                ))
                        ),
                        List.of()
                ));

        DlpSafeMessage safe = dlpService.safeMessageForLlm("Resume", files, "demo-user");

        assertThat(safe.safePrompt())
                .startsWith("Resume")
                .contains("Contexte des pieces jointes")
                .contains("[Fichier: client.txt]")
                .contains("Contact [EMAIL_1]")
                .doesNotContain("client@example.com");
        assertThat(safe.attachments()).hasSize(1);
        assertThat(safe.attachments().get(0).decision()).isEqualTo("MASK");
    }

    @Test
    void analyseMessageBlocksWhenOneAttachmentBlocks() {
        MockMultipartFile file = new MockMultipartFile("files", "secret.txt", "text/plain", "secret".getBytes());
        List<MultipartFile> files = List.of(file);
        when(dlpClient.analyseMessage("", files, "demo-user"))
                .thenReturn(new DlpMultiSourceAnalysisResponse(
                        "SUCCESS",
                        DlpDecision.BLOCK,
                        true,
                        "high",
                        List.of(source("secret.txt", DlpDecision.BLOCK, "Token [OPENAI_API_KEY_1]", List.of(
                                new DlpMatch("openai_api_key_1", "openai_api_key", 6, 36, "high", "regex", 1.0, null)
                        ))),
                        List.of()
                ));

        assertThatThrownBy(() -> dlpService.safeMessageForLlm("", files, "demo-user"))
                .isInstanceOf(DlpBlockedException.class)
                .satisfies(exception -> {
                    DlpBlockedException blocked = (DlpBlockedException) exception;
                    assertThat(blocked.getDetectedTypes()).containsExactly("openai_api_key");
                    assertThat(blocked.getAttachments()).extracting("filename", "decision")
                            .containsExactly(org.assertj.core.groups.Tuple.tuple("secret.txt", "BLOCK"));
                });
    }

    @Test
    void analyseMessageBuildsBlockedAttachmentMaskedTextWhenDlpOmitsIt() {
        String extractedText = "Token sk-test-secret";
        MockMultipartFile file = new MockMultipartFile("files", "secret.txt", "text/plain", extractedText.getBytes());
        List<MultipartFile> files = List.of(file);
        when(dlpClient.analyseMessage("", files, "demo-user"))
                .thenReturn(new DlpMultiSourceAnalysisResponse(
                        "SUCCESS",
                        DlpDecision.BLOCK,
                        true,
                        "high",
                        List.of(new DlpSourceResult("secret.txt", "SUCCESS", DlpDecision.BLOCK, true, "high", extractedText, null, List.of(
                                new DlpMatch("openai_api_key_1", "openai_api_key", 6, 20, "high", "regex", 1.0, null)
                        ), List.of())),
                        List.of()
                ));

        assertThatThrownBy(() -> dlpService.safeMessageForLlm("", files, "demo-user"))
                .isInstanceOf(DlpBlockedException.class)
                .satisfies(exception -> {
                    DlpBlockedException blocked = (DlpBlockedException) exception;
                    assertThat(blocked.getAttachments()).hasSize(1);
                    assertThat(blocked.getAttachments().get(0).maskedText()).isEqualTo("Token [OPENAI_API_KEY_1]");
                });
    }

    @Test
    void analyseMessageCalculatesAttachmentLineNumbersFromOriginalExtractedText() {
        String extractedText = String.join("\n",
                "line 1",
                "line 2",
                "Email admin@example.com",
                "line 4",
                "line 5",
                "line 6",
                "line 7",
                "Token sk-test-secret",
                "line 9",
                "line 10",
                "line 11",
                "line 12",
                "line 13",
                "line 14",
                "CIN AB123456"
        );
        String maskedText = String.join("\n",
                "line 1",
                "line 2",
                "Email [EMAIL_1]",
                "line 4",
                "line 5",
                "line 6",
                "line 7",
                "Token [OPENAI_API_KEY_1]",
                "line 9",
                "line 10",
                "line 11",
                "line 12",
                "line 13",
                "line 14",
                "CIN [MOROCCAN_CIN_1]"
        );
        List<DlpMatch> matches = List.of(
                matchAt("email_1", "email", extractedText, "admin@example.com"),
                matchAt("openai_api_key_1", "openai_api_key", extractedText, "sk-test-secret"),
                matchAt("moroccan_cin_1", "moroccan_cin", extractedText, "AB123456")
        );
        MockMultipartFile file = new MockMultipartFile("files", "multi.txt", "text/plain", extractedText.getBytes());
        List<MultipartFile> files = List.of(file);
        when(dlpClient.analyseMessage("", files, "demo-user"))
                .thenReturn(new DlpMultiSourceAnalysisResponse(
                        "SUCCESS",
                        DlpDecision.BLOCK,
                        true,
                        "high",
                        List.of(new DlpSourceResult("multi.txt", "SUCCESS", DlpDecision.BLOCK, true, "high", extractedText, maskedText, matches, List.of())),
                        List.of()
                ));

        assertThatThrownBy(() -> dlpService.safeMessageForLlm("", files, "demo-user"))
                .isInstanceOf(DlpBlockedException.class)
                .satisfies(exception -> {
                    DlpBlockedException blocked = (DlpBlockedException) exception;
                    assertThat(blocked.getAttachments()).hasSize(1);
                    assertThat(blocked.getAttachments().get(0).matches())
                            .extracting("id", "lineNumber")
                            .containsExactly(
                                    org.assertj.core.groups.Tuple.tuple("email_1", 3),
                                    org.assertj.core.groups.Tuple.tuple("openai_api_key_1", 8),
                                    org.assertj.core.groups.Tuple.tuple("moroccan_cin_1", 15)
                            );
                });
    }

    @Test
    void analyseMessageKeepsExtractedTextForPdfAndDocxAttachments() {
        MockMultipartFile pdf = new MockMultipartFile("files", "report.pdf", "application/pdf", "pdf".getBytes());
        MockMultipartFile docx = new MockMultipartFile("files", "contract.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "docx".getBytes());
        List<MultipartFile> files = List.of(pdf, docx);
        String pdfText = "PDF email admin@example.com";
        String docxText = "DOCX token sk-test-secret";
        when(dlpClient.analyseMessage("", files, "demo-user"))
                .thenReturn(new DlpMultiSourceAnalysisResponse(
                        "SUCCESS",
                        DlpDecision.MASK,
                        true,
                        "high",
                        List.of(
                                new DlpSourceResult("report.pdf", "SUCCESS", DlpDecision.MASK, true, "medium", pdfText, "PDF email [EMAIL_1]", List.of(
                                        matchAt("email_1", "email", pdfText, "admin@example.com")
                                ), List.of()),
                                new DlpSourceResult("contract.docx", "SUCCESS", DlpDecision.MASK, true, "high", docxText, "DOCX token [OPENAI_API_KEY_1]", List.of(
                                        matchAt("openai_api_key_1", "openai_api_key", docxText, "sk-test-secret")
                                ), List.of())
                        ),
                        List.of()
                ));

        DlpSafeMessage safe = dlpService.safeMessageForLlm("", files, "demo-user");

        assertThat(safe.attachments()).hasSize(2);
        assertThat(safe.attachments())
                .extracting("filename", "extractedText", "maskedText")
                .containsExactly(
                        org.assertj.core.groups.Tuple.tuple("report.pdf", pdfText, "PDF email [EMAIL_1]"),
                        org.assertj.core.groups.Tuple.tuple("contract.docx", docxText, "DOCX token [OPENAI_API_KEY_1]")
                );
    }

    private DlpAnalysisResponse response(DlpDecision decision, String maskedText, List<DlpMatch> matches) {
        return new DlpAnalysisResponse("SUCCESS", decision, false, "HIGH", maskedText, maskedText, matches, List.of());
    }

    private DlpSourceResult source(String source, DlpDecision decision, String maskedText, List<DlpMatch> matches) {
        return new DlpSourceResult(source, "SUCCESS", decision, !matches.isEmpty(), null, maskedText, maskedText, matches, List.of());
    }

    private DlpMatch matchAt(String id, String type, String text, String value) {
        int start = text.indexOf(value);
        return new DlpMatch(id, type, start, start + value.length(), "high", "regex", 1.0, null);
    }
}
