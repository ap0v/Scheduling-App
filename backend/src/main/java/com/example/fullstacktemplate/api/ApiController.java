package com.example.fullstacktemplate.api;

import java.time.Instant;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class ApiController {

    /**
     * Health check endpoint to verify the API is running.
     *
     * @return HealthResponse containing the status, application name, and current timestamp.
     */
    @GetMapping("/health")
    public HealthResponse health() 
    {
        return new HealthResponse("UP", "spring-boot-api", Instant.now());
    }

}
