package com.example.fullstacktemplate.api;

import java.time.Instant;

public record HealthResponse(String status, String service, Instant timestamp) {
}
