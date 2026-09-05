package com.example.fullstacktemplate.api;

import java.time.Instant;

/**
 * Response record for health check endpoint.
 */
public record HealthResponse(String status, String service, Instant timestamp) {
}
