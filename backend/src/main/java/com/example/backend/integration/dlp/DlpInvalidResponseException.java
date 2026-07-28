package com.example.backend.integration.dlp;

public class DlpInvalidResponseException extends DlpUnavailableException {

    public DlpInvalidResponseException(String message) {
        super(message);
    }
}
