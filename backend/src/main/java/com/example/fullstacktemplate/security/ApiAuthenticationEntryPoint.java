package com.example.fullstacktemplate.security;

import java.io.IOException;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.stereotype.Component;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/** Returns API JSON instead of an HTML login page for unauthenticated requests. */
@Component
public class ApiAuthenticationEntryPoint implements AuthenticationEntryPoint {

    private final ApiErrorResponder errors;

    public ApiAuthenticationEntryPoint(ApiErrorResponder errors) {
        this.errors = errors;
    }

    @Override
    public void commence(
            HttpServletRequest request,
            HttpServletResponse response,
            AuthenticationException authenticationException
    ) throws IOException {
        errors.write(response, HttpStatus.UNAUTHORIZED, "missing_access_token",
                "Provide a Supabase access token using the Authorization: Bearer header.");
    }
}
