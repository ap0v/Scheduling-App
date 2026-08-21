package com.example.fullstacktemplate.scheduling;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.example.fullstacktemplate.api.ApiException;
import com.example.fullstacktemplate.config.SupabaseProperties;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.ObjectMapper;

class SupabaseApiClientTest {

    private final SupabaseApiClient client = new SupabaseApiClient(
            new SupabaseProperties("", ""), new ObjectMapper());

    @Test
    void bearerSchemeIsCaseInsensitive() {
        ApiException exception = assertThrows(ApiException.class,
                () -> client.authenticate("bearer session-token"));

        assertEquals("supabase_not_configured", exception.code());
    }

    @Test
    void malformedSchemeIsRejectedBeforeContactingSupabase() {
        ApiException exception = assertThrows(ApiException.class,
                () -> client.authenticate("Basic credentials"));

        assertEquals("missing_access_token", exception.code());
    }

    @Test
    void projectUrlMustNotContainTheRestEndpointPath() {
        SupabaseApiClient misconfiguredClient = new SupabaseApiClient(
                new SupabaseProperties("https://project-ref.supabase.co/rest/v1", "publishable-key"),
                new ObjectMapper());

        ApiException exception = assertThrows(ApiException.class,
                () -> misconfiguredClient.authenticate("Bearer session-token"));

        assertEquals("invalid_supabase_configuration", exception.code());
    }
}
