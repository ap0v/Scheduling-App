package com.example.fullstacktemplate.security;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.example.fullstacktemplate.api.ApiException;
import com.example.fullstacktemplate.scheduling.AuthenticatedUser;
import com.example.fullstacktemplate.scheduling.SupabaseApiClient;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.context.SecurityContextHolder;
import jakarta.servlet.FilterChain;
import tools.jackson.databind.ObjectMapper;

class SupabaseAuthenticationFilterTest {

    @AfterEach
    void clearSecurityContext() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void verifiedTokenBecomesTheAuthenticatedPrincipalForTheRequest() throws Exception {
        SupabaseApiClient supabase = mock(SupabaseApiClient.class);
        AuthenticatedUser user = new AuthenticatedUser(UUID.randomUUID(), "session-token");
        when(supabase.authenticate("Bearer session-token")).thenReturn(user);
        SupabaseAuthenticationFilter filter = filter(supabase);
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/v1/calendars");
        request.addHeader(HttpHeaders.AUTHORIZATION, "Bearer session-token");
        MockHttpServletResponse response = new MockHttpServletResponse();
        AtomicReference<Object> principal = new AtomicReference<>();
        FilterChain chain = (servletRequest, servletResponse) -> principal.set(
                SecurityContextHolder.getContext().getAuthentication().getPrincipal());

        filter.doFilter(request, response, chain);

        assertEquals(user, principal.get());
        assertNull(SecurityContextHolder.getContext().getAuthentication());
        verify(supabase).authenticate("Bearer session-token");
    }

    @Test
    void authenticationFailureUsesTheStableApiErrorEnvelope() throws Exception {
        SupabaseApiClient supabase = mock(SupabaseApiClient.class);
        when(supabase.authenticate(null)).thenThrow(new ApiException(
                HttpStatus.UNAUTHORIZED,
                "missing_access_token",
                "Provide a Supabase access token using the Authorization: Bearer header."));
        SupabaseAuthenticationFilter filter = filter(supabase);
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/v1/calendars");
        MockHttpServletResponse response = new MockHttpServletResponse();
        FilterChain chain = mock(FilterChain.class);

        filter.doFilter(request, response, chain);

        assertEquals(HttpStatus.UNAUTHORIZED.value(), response.getStatus());
        assertEquals("{\"code\":\"missing_access_token\",\"message\":\"Provide a Supabase access token using the Authorization: Bearer header.\"}",
                response.getContentAsString());
        verify(supabase).authenticate(null);
        verifyNoInteractions(chain);
    }

    private SupabaseAuthenticationFilter filter(SupabaseApiClient supabase) {
        return new SupabaseAuthenticationFilter(supabase, new ApiErrorResponder(new ObjectMapper()));
    }
}
