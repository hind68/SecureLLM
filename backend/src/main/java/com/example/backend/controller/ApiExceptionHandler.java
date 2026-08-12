package com.example.backend.controller;

import com.example.backend.integration.dlp.DlpBlockedException;
import com.example.backend.integration.dlp.DlpPublicMatch;
import com.example.backend.integration.dlp.DlpUnavailableException;
import com.example.backend.service.AttachmentLimitExceededException;
import java.util.List;
import java.util.Set;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.server.ResponseStatusException;

@RestControllerAdvice
public class ApiExceptionHandler {

    @ExceptionHandler(DlpBlockedException.class)
    @ResponseStatus(HttpStatus.UNPROCESSABLE_CONTENT)
    public ApiError handleDlpBlocked(DlpBlockedException exception) {
        return new ApiError(
                "DLP_BLOCKED",
                "Votre message contient une donnée sensible et ne peut pas être envoyé.",
                exception.getDetectedTypes(),
                exception.getHighestSeverity(),
                exception.getMaskedText(),
                exception.getMatches(),
                null,
                null
        );
    }

    @ExceptionHandler(DlpUnavailableException.class)
    @ResponseStatus(HttpStatus.SERVICE_UNAVAILABLE)
    public ApiError handleDlpUnavailable() {
        return new ApiError(
                "DLP_UNAVAILABLE",
                "Le contrôle de sécurité est indisponible. Le message n’a pas été envoyé au modèle.",
                Set.of(),
                null,
                null,
                List.of(),
                null,
                null
        );
    }

    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<ApiError> handleResponseStatus(ResponseStatusException exception) {
        HttpStatus status = HttpStatus.resolve(exception.getStatusCode().value());
        return ResponseEntity
                .status(status == null ? HttpStatus.BAD_REQUEST : status)
                .body(new ApiError(
                        "REQUEST_INVALID",
                        exception.getReason(),
                        Set.of(),
                        null,
                        null,
                        List.of(),
                        null,
                        null
                ));
    }

    @ExceptionHandler(AttachmentLimitExceededException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public ApiError handleAttachmentLimitExceeded(AttachmentLimitExceededException exception) {
        return new ApiError(
                "ATTACHMENT_LIMIT_EXCEEDED",
                exception.getMessage(),
                Set.of(),
                null,
                null,
                List.of(),
                exception.getMaxFiles(),
                exception.getReceivedFiles()
        );
    }

    public record ApiError(
            String code,
            String message,
            Set<String> detectedTypes,
            String highestSeverity,
            String maskedText,
            List<DlpPublicMatch> matches,
            Integer maxFiles,
            Integer receivedFiles
    ) {
    }
}
