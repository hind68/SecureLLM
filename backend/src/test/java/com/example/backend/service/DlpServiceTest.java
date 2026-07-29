package com.example.backend.service;

import com.example.backend.integration.dlp.DlpAnalysisResponse;
import com.example.backend.integration.dlp.DlpBlockedException;
import com.example.backend.integration.dlp.DlpClient;
import com.example.backend.integration.dlp.DlpDecision;
import com.example.backend.integration.dlp.DlpInvalidResponseException;
import com.example.backend.integration.dlp.DlpMatch;
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
                .thenReturn(new DlpAnalysisResponse("ERROR", DlpDecision.ALLOW, false, null, "hello", List.of(), List.of()));

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

    private DlpAnalysisResponse response(DlpDecision decision, String maskedText, List<DlpMatch> matches) {
        return new DlpAnalysisResponse("SUCCESS", decision, false, "HIGH", maskedText, matches, List.of());
    }
}
