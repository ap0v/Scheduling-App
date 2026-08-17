package com.example.fullstacktemplate.api;

import java.time.Instant;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class ApiController {

    @GetMapping("/health")
    public HealthResponse health() {
        return new HealthResponse("UP", "spring-boot-api", Instant.now());
    }

    @GetMapping("/v1/greeting")
    public GreetingResponse greeting(@RequestParam(defaultValue = "World") String name) {
        String displayName = name.isBlank() ? "World" : name.trim();
        return new GreetingResponse("Hello, %s!".formatted(displayName), Instant.now());
    }
}
