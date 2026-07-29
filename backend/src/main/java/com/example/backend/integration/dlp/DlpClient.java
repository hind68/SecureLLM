package com.example.backend.integration.dlp;

import io.netty.channel.ChannelOption;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.client.reactive.ReactorClientHttpConnector;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.netty.http.client.HttpClient;

@Component
public class DlpClient {

    private static final MediaType APPLICATION_JSON_UTF8 = new MediaType("application", "json", StandardCharsets.UTF_8);

    private final WebClient webClient;
    private final Duration readTimeout;

    public DlpClient(
            @Value("${dlp.base-url}") String baseUrl,
            @Value("${dlp.connect-timeout:2s}") Duration connectTimeout,
            @Value("${dlp.read-timeout:10s}") Duration readTimeout
    ) {
        HttpClient httpClient = HttpClient.create()
                .option(ChannelOption.CONNECT_TIMEOUT_MILLIS, Math.toIntExact(connectTimeout.toMillis()))
                .responseTimeout(readTimeout);
        this.webClient = WebClient.builder()
                .baseUrl(baseUrl)
                .clientConnector(new ReactorClientHttpConnector(httpClient))
                .build();
        this.readTimeout = readTimeout;
    }

    /**
     * Calls the DLP analyser before any LLM request. Any transport, timeout, HTTP,
     * or JSON-shape problem is converted to an unavailable error so callers can
     * apply the gateway fail-closed policy without leaking prompt content.
     */
    public DlpAnalysisResponse analyse(String text, String userId) {
        try {
            return webClient.post()
                    .uri("/analyse")
                    .contentType(APPLICATION_JSON_UTF8)
                    .accept(APPLICATION_JSON_UTF8)
                    .bodyValue(new DlpAnalysisRequest(text, userId))
                    .retrieve()
                    .onStatus(
                            status -> status.isError(),
                            response -> response.releaseBody()
                                    .thenReturn(new DlpUnavailableException("DLP service returned an error"))
                    )
                    .bodyToMono(DlpAnalysisResponse.class)
                    .block(readTimeout);
        } catch (DlpAnalysisException exception) {
            throw exception;
        } catch (RuntimeException exception) {
            throw new DlpUnavailableException("DLP service is unavailable", exception);
        }
    }
}
