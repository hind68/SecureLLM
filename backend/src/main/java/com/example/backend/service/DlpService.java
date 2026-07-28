package com.example.backend.service;

import com.example.backend.integration.dlp.DlpAnalysisResponse;
import com.example.backend.integration.dlp.DlpBlockedException;
import com.example.backend.integration.dlp.DlpClient;
import com.example.backend.integration.dlp.DlpDecision;
import com.example.backend.integration.dlp.DlpInvalidResponseException;
import com.example.backend.integration.dlp.DlpMatch;
import com.example.backend.integration.dlp.DlpUnavailableException;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;

@Service
public class DlpService {

    private static final String SUCCESS_STATUS = "SUCCESS";

    private final DlpClient dlpClient;

    public DlpService(DlpClient dlpClient) {
        this.dlpClient = dlpClient;
    }

    /**
     * Returns the prompt that is allowed to reach LiteLLM. ALLOW and MASK both use
     * masked_text from the DLP service, while BLOCK or malformed responses fail
     * closed before any LLM request is created.
     */
    public String safeTextForLlm(String text, String userId) {
        DlpAnalysisResponse response = dlpClient.analyse(text, userId);
        validateResponse(response);

        if (response.decision() == DlpDecision.BLOCK) {
            throw new DlpBlockedException(response.highestSeverity(), detectedTypes(response));
        }

        if (response.maskedText() == null) {
            throw new DlpInvalidResponseException("DLP response did not include masked_text");
        }

        return response.maskedText();
    }

    private void validateResponse(DlpAnalysisResponse response) {
        if (response == null || response.status() == null || response.decision() == null) {
            throw new DlpInvalidResponseException("DLP response is incomplete");
        }
        if (!SUCCESS_STATUS.equalsIgnoreCase(response.status())) {
            throw new DlpUnavailableException("DLP analysis did not complete successfully");
        }
    }

    private Set<String> detectedTypes(DlpAnalysisResponse response) {
        if (response.matches() == null) {
            return Set.of();
        }
        return response.matches().stream()
                .map(DlpMatch::type)
                .filter(type -> type != null && !type.isBlank())
                .collect(Collectors.toUnmodifiableSet());
    }
}
