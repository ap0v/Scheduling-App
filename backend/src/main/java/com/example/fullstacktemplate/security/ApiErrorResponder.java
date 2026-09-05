package com.example.fullstacktemplate.security;

import com.example.fullstacktemplate.api.ApiError;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import jakarta.servlet.http.HttpServletResponse;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.ObjectMapper;

/** Writes the API's consistent JSON error envelope from the security layer. */
@Component
public class ApiErrorResponder {

    private final ObjectMapper objectMapper;

    public ApiErrorResponder(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    public void write(HttpServletResponse response, HttpStatus status, String code, String message)
            throws IOException {
        if (response.isCommitted()) {
            return;
        }

        response.setStatus(status.value());
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        try {
            response.getWriter().write(objectMapper.writeValueAsString(new ApiError(code, message)));
        } catch (JacksonException exception) {
            throw new IOException("Could not write the API error response.", exception);
        }
    }
}
