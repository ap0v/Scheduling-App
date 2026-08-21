package com.example.fullstacktemplate.scheduling;

import java.util.UUID;

/** The authenticated Supabase user and the verified access token used for RLS. */
public record AuthenticatedUser(UUID profileId, String accessToken) {
}
