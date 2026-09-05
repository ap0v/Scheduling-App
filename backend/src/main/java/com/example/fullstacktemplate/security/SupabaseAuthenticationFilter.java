package com.example.fullstacktemplate.security;

import com.example.fullstacktemplate.api.ApiException;
import com.example.fullstacktemplate.scheduling.AuthenticatedUser;
import com.example.fullstacktemplate.scheduling.SupabaseApiClient;
import java.io.IOException;
import java.util.List;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * Verifies the caller's Supabase session once for every protected API request.
 *
 * <p>The raw session token remains on the principal so data requests can be
 * forwarded to PostgREST under the caller's RLS policies.</p>
 */
public class SupabaseAuthenticationFilter extends OncePerRequestFilter {

    private static final String API_V1_PREFIX = "/api/v1/";
    private static final String GREETING_PATH = "/api/v1/greeting";

    private final SupabaseApiClient supabase;
    private final ApiErrorResponder errors;

    public SupabaseAuthenticationFilter(SupabaseApiClient supabase, ApiErrorResponder errors) {
        this.supabase = supabase;
        this.errors = errors;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String path = applicationPath(request);
        return HttpMethod.OPTIONS.matches(request.getMethod())
                || !path.startsWith(API_V1_PREFIX)
                || GREETING_PATH.equals(path);
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain
    ) throws ServletException, IOException {
        AuthenticatedUser user;
        try {
            user = supabase.authenticate(request.getHeader(HttpHeaders.AUTHORIZATION));
        } catch (ApiException exception) {
            errors.write(response, exception.status(), exception.code(), exception.getMessage());
            return;
        }

        SecurityContext context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(new UsernamePasswordAuthenticationToken(user, null, List.of()));
        SecurityContextHolder.setContext(context);
        try {
            filterChain.doFilter(request, response);
        } finally {
            SecurityContextHolder.clearContext();
        }
    }

    private String applicationPath(HttpServletRequest request) {
        String contextPath = request.getContextPath();
        String requestUri = request.getRequestURI();
        return requestUri.startsWith(contextPath) ? requestUri.substring(contextPath.length()) : requestUri;
    }
}
