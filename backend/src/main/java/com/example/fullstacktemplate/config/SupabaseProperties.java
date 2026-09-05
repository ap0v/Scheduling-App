package com.example.fullstacktemplate.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Server-side connection settings for Supabase's Auth and PostgREST APIs.
 *
 * <p>The publishable key identifies the project; authorization is supplied by
 * the caller's Supabase access token and is therefore still subject to RLS.</p>
 */
@ConfigurationProperties(prefix = "app.supabase")
public record SupabaseProperties(String url, String publishableKey) {

    public SupabaseProperties {
        url = url == null ? "" : url.trim();
        publishableKey = publishableKey == null ? "" : publishableKey.trim();
    }

    public boolean isConfigured() {
        return !url.isBlank() && !publishableKey.isBlank();
    }
}
