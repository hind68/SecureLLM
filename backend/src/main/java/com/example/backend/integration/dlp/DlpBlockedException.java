package com.example.backend.integration.dlp;

import java.util.Set;
import java.util.List;

public class DlpBlockedException extends DlpAnalysisException {

    private final String highestSeverity;
    private final Set<String> detectedTypes;
    private final String maskedText;
    private final List<DlpPublicMatch> matches;

    public DlpBlockedException(String highestSeverity, Set<String> detectedTypes) {
        this(highestSeverity, detectedTypes, null, List.of());
    }

    public DlpBlockedException(String highestSeverity, Set<String> detectedTypes, String maskedText, List<DlpPublicMatch> matches) {
        super("Message blocked by DLP policy");
        this.highestSeverity = highestSeverity;
        this.detectedTypes = detectedTypes == null ? Set.of() : Set.copyOf(detectedTypes);
        this.maskedText = maskedText;
        this.matches = matches == null ? List.of() : List.copyOf(matches);
    }

    public String getHighestSeverity() {
        return highestSeverity;
    }

    public Set<String> getDetectedTypes() {
        return detectedTypes;
    }

    public String getMaskedText() {
        return maskedText;
    }

    public List<DlpPublicMatch> getMatches() {
        return matches;
    }
}
