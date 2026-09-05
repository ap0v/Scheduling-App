package com.example.fullstacktemplate.security;

import java.io.IOException;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.web.access.AccessDeniedHandler;
import org.springframework.stereotype.Component;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/** Returns API JSON when a valid identity lacks permission for an endpoint. */
@Component
public class ApiAccessDeniedHandler implements AccessDeniedHandler {

    private final ApiErrorResponder errors;

    public ApiAccessDeniedHandler(ApiErrorResponder errors) {
        this.errors = errors;
    }

    @Override
    public void handle(
            HttpServletRequest request,
            HttpServletResponse response,
            AccessDeniedException accessDeniedException
    ) throws IOException {
        errors.write(response, HttpStatus.FORBIDDEN, "access_denied",
                "You do not have permission to access this resource.");
    }
}
