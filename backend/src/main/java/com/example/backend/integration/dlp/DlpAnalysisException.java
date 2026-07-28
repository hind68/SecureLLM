package com.example.backend.integration.dlp;

public class DlpAnalysisException extends RuntimeException {

    public DlpAnalysisException(String message) {
        super(message);
    }

    public DlpAnalysisException(String message, Throwable cause) {
        super(message, cause);
    }
}
