package com.example.backend.controller;

import com.example.backend.service.AttachmentLimitExceededException;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class ApiExceptionHandlerTest {

    @Test
    void attachmentLimitExceededReturnsStructuredValidationError() {
        ApiExceptionHandler handler = new ApiExceptionHandler();

        ApiExceptionHandler.ApiError error = handler.handleAttachmentLimitExceeded(
                new AttachmentLimitExceededException(10, 11)
        );

        assertThat(error.code()).isEqualTo("ATTACHMENT_LIMIT_EXCEEDED");
        assertThat(error.message()).contains("10 fichiers").contains("11 fichiers");
        assertThat(error.maxFiles()).isEqualTo(10);
        assertThat(error.receivedFiles()).isEqualTo(11);
    }
}
