package com.example.fullstacktemplate.scheduling;

import com.example.fullstacktemplate.api.ApiException;
import com.example.fullstacktemplate.config.SupabaseProperties;
import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Map;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.NullNode;

/**
 * Small HTTP client for the Supabase Auth and PostgREST APIs.
 *
 * <p>Every data call uses the caller's verified access token rather than a
 * service-role key. That keeps the SQL migration's Row Level Security policies
 * active for the backend API as well as for browser clients.</p>
 */
@Component
public class SupabaseApiClient {

    private static final Duration REQUEST_TIMEOUT = Duration.ofSeconds(15);

    private final SupabaseProperties properties;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;

    @Autowired
    public SupabaseApiClient(SupabaseProperties properties, ObjectMapper objectMapper) {
        this(properties, objectMapper, HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(5))
                .build());
    }

    SupabaseApiClient(SupabaseProperties properties, ObjectMapper objectMapper, HttpClient httpClient) {
        this.properties = properties;
        this.objectMapper = objectMapper;
        this.httpClient = httpClient;
    }

    /** Verifies the bearer token with Supabase Auth and returns its user id. */
    public AuthenticatedUser authenticate(String authorizationHeader) {
        String accessToken = extractBearerToken(authorizationHeader);
        JsonNode user = request("GET", "/auth/v1/user", accessToken, Map.of(), null, null);
        String id = user.path("id").asString();

        try {
            return new AuthenticatedUser(UUID.fromString(id), accessToken);
        } catch (IllegalArgumentException exception) {
            throw new ApiException(HttpStatus.BAD_GATEWAY, "invalid_supabase_response",
                    "Supabase Auth returned a user without a valid id.");
        }
    }

    public JsonNode get(String table, AuthenticatedUser user, Map<String, String> query) {
        return request("GET", restPath(table), user.accessToken(), query, null, null);
    }

    public JsonNode rpc(String function, AuthenticatedUser user, JsonNode body) {
        return request("POST", "/rest/v1/rpc/" + function, user.accessToken(), Map.of(), body, null);
    }

    public JsonNode insert(String table, AuthenticatedUser user, JsonNode body) {
        return request("POST", restPath(table), user.accessToken(), Map.of(), body,
                "return=representation");
    }

    public JsonNode upsert(String table, AuthenticatedUser user, JsonNode body, Map<String, String> query) {
        return request("POST", restPath(table), user.accessToken(), query, body,
                "resolution=merge-duplicates,return=representation");
    }

    public JsonNode update(String table, AuthenticatedUser user, Map<String, String> query, JsonNode body) {
        return request("PATCH", restPath(table), user.accessToken(), query, body,
                "return=representation");
    }

    /**
     * Performs a mutation without a RETURNING representation. This is required
     * when an update intentionally makes the row fail its SELECT RLS policy,
     * such as a schema-managed soft delete.
     */
    public void updateMinimal(String table, AuthenticatedUser user, Map<String, String> query, JsonNode body) {
        request("PATCH", restPath(table), user.accessToken(), query, body, "return=minimal");
    }

    public JsonNode delete(String table, AuthenticatedUser user, Map<String, String> query) {
        return request("DELETE", restPath(table), user.accessToken(), query, null,
                "return=representation");
    }

    private JsonNode request(
            String method,
            String path,
            String accessToken,
            Map<String, String> query,
            JsonNode body,
            String prefer
    ) {
        ensureConfigured();

        HttpRequest.BodyPublisher publisher = HttpRequest.BodyPublishers.noBody();
        if (body != null) {
            try {
                publisher = HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(body));
            } catch (JacksonException exception) {
                throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "json_serialization_failed",
                        "Could not prepare the request for Supabase.");
            }
        }

        HttpRequest.Builder request = HttpRequest.newBuilder(buildUri(path, query))
                .timeout(REQUEST_TIMEOUT)
                .header("apikey", properties.publishableKey())
                .header("Authorization", "Bearer " + accessToken)
                .header("Accept", "application/json");
        if (body != null) {
            request.header("Content-Type", "application/json");
        }
        if (prefer != null) {
            request.header("Prefer", prefer);
        }

        try {
            HttpResponse<String> response = httpClient.send(
                    request.method(method, publisher).build(),
                    HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                throw supabaseFailure(response.statusCode(), response.body());
            }
            return parseBody(response.body());
        } catch (IOException exception) {
            throw new ApiException(HttpStatus.BAD_GATEWAY, "supabase_unavailable",
                    "Could not reach Supabase.");
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "supabase_request_interrupted",
                    "The request to Supabase was interrupted.");
        }
    }

    private void ensureConfigured() {
        if (!properties.isConfigured()) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "supabase_not_configured",
                    "Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY before using scheduling APIs.");
        }
    }

    private URI buildUri(String path, Map<String, String> query) {
        String normalizedBase = properties.url().replaceAll("/+$", "");
        URI baseUri;
        try {
            baseUri = URI.create(normalizedBase);
        } catch (IllegalArgumentException exception) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "invalid_supabase_configuration",
                    "SUPABASE_URL is not a valid URL.");
        }
        if (baseUri.getScheme() == null || baseUri.getHost() == null
                || (baseUri.getPath() != null && !baseUri.getPath().isBlank())
                || baseUri.getQuery() != null || baseUri.getFragment() != null) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "invalid_supabase_configuration",
                    "SUPABASE_URL must be the Supabase project base URL, without /auth/v1 or /rest/v1.");
        }

        StringBuilder address = new StringBuilder(normalizedBase).append(path);
        if (!query.isEmpty()) {
            address.append('?');
            boolean first = true;
            for (Map.Entry<String, String> parameter : query.entrySet()) {
                if (!first) {
                    address.append('&');
                }
                address.append(URLEncoder.encode(parameter.getKey(), StandardCharsets.UTF_8));
                address.append('=');
                address.append(URLEncoder.encode(parameter.getValue(), StandardCharsets.UTF_8));
                first = false;
            }
        }

        return URI.create(address.toString());
    }

    private JsonNode parseBody(String body) {
        if (body == null || body.isBlank()) {
            return NullNode.getInstance();
        }

        try {
            return objectMapper.readTree(body);
        } catch (JacksonException exception) {
            throw new ApiException(HttpStatus.BAD_GATEWAY, "invalid_supabase_response",
                    "Supabase returned an invalid JSON response.");
        }
    }

    private ApiException supabaseFailure(int statusCode, String body) {
        String remoteMessage = "";
        try {
            JsonNode error = objectMapper.readTree(body);
            remoteMessage = error.path("message").asString("").trim();
        } catch (JacksonException ignored) {
            // A non-JSON error page is still handled below without exposing it.
        }

        String suffix = remoteMessage.isBlank() ? "." : ": " + remoteMessage;
        if (statusCode == 400 || statusCode == 422) {
            return new ApiException(HttpStatus.BAD_REQUEST, "supabase_rejected_request",
                    "Supabase rejected the request" + suffix);
        }
        if (statusCode == 401) {
            return new ApiException(HttpStatus.UNAUTHORIZED, "invalid_access_token",
                    "A valid Supabase access token is required.");
        }
        if (statusCode == 403) {
            return new ApiException(HttpStatus.FORBIDDEN, "supabase_access_denied",
                    "Supabase denied access to this resource.");
        }
        if (statusCode == 409) {
            return new ApiException(HttpStatus.CONFLICT, "supabase_conflict",
                    "Supabase could not apply the change" + suffix);
        }
        return new ApiException(HttpStatus.BAD_GATEWAY, "supabase_request_failed",
                "Supabase could not complete the request.");
    }

    private String extractBearerToken(String authorizationHeader) {
        int schemeLength = "Bearer".length();
        if (authorizationHeader == null
                || authorizationHeader.length() <= schemeLength
                || !authorizationHeader.regionMatches(true, 0, "Bearer", 0, schemeLength)
                || !Character.isWhitespace(authorizationHeader.charAt(schemeLength))) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "missing_access_token",
                    "Provide a Supabase access token using the Authorization: Bearer header.");
        }

        String token = authorizationHeader.substring(schemeLength).trim();
        if (token.isEmpty()) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "missing_access_token",
                    "Provide a non-empty Supabase access token.");
        }
        return token;
    }

    private String restPath(String table) {
        return "/rest/v1/" + table;
    }
}
