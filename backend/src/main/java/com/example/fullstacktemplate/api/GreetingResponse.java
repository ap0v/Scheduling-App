package com.example.fullstacktemplate.api;

import java.time.Instant;

public record GreetingResponse(String message, Instant timestamp) {
}
