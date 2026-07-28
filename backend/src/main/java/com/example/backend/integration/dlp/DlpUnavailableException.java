package com.example.backend.integration.dlp;

public class DlpUnavailableException extends DlpAnalysisException {

    public DlpUnavailableException(String message) {
        super(message);
    }

    public DlpUnavailableException(String message, Throwable cause) {
        super(message, cause);
    }
}
