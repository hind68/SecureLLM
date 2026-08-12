package com.example.backend.service;

public class AttachmentLimitExceededException extends RuntimeException {

    private final int maxFiles;
    private final int receivedFiles;

    public AttachmentLimitExceededException(int maxFiles, int receivedFiles) {
        super("Vous pouvez joindre jusqu'\u00e0 " + maxFiles + " fichiers par message. "
                + receivedFiles + " fichiers ont \u00e9t\u00e9 s\u00e9lectionn\u00e9s.");
        this.maxFiles = maxFiles;
        this.receivedFiles = receivedFiles;
    }

    public int getMaxFiles() {
        return maxFiles;
    }

    public int getReceivedFiles() {
        return receivedFiles;
    }
}
