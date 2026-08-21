package com.example.fullstacktemplate.scheduling;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.example.fullstacktemplate.api.ApiException;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

class SchedulingServiceTest {

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final SupabaseApiClient supabase = mock(SupabaseApiClient.class);
    private final SchedulingService service = new SchedulingService(supabase, objectMapper);

    @Test
    void createCalendarRejectsClientSuppliedOwner() {
        ObjectNode request = objectMapper.createObjectNode()
                .put("name", "Personal")
                .put("owner_profile_id", UUID.randomUUID().toString());

        ApiException exception = assertThrows(ApiException.class,
                () -> service.createCalendar(user(), request));

        assertEquals(HttpStatus.BAD_REQUEST, exception.status());
        assertEquals("unsupported_calendar_field", exception.code());
        verifyNoInteractions(supabase);
    }

    @Test
    void updateEventRequiresAnObservedRowVersion() {
        ObjectNode request = objectMapper.createObjectNode().put("title", "Changed title");

        ApiException exception = assertThrows(ApiException.class,
                () -> service.updateEvent(user(), UUID.randomUUID(), request));

        assertEquals(HttpStatus.BAD_REQUEST, exception.status());
        assertEquals("invalid_row_version", exception.code());
        verifyNoInteractions(supabase);
    }

    @Test
    void deleteEventRejectsNegativeVersionBeforeReadingTheEvent() {
        ApiException exception = assertThrows(ApiException.class,
                () -> service.deleteEvent(user(), UUID.randomUUID(), -1));

        assertEquals(HttpStatus.BAD_REQUEST, exception.status());
        assertEquals("invalid_row_version", exception.code());
        verifyNoInteractions(supabase);
    }

    @Test
    void deleteCalendarUsesAMinimalMutationBecauseRlsHidesSoftDeletedRows() {
        UUID calendarId = UUID.randomUUID();
        AuthenticatedUser user = user();
        ArrayNode response = objectMapper.createArrayNode();
        response.add(objectMapper.createObjectNode()
                .put("id", calendarId.toString())
                .put("name", "Personal"));
        when(supabase.get(org.mockito.ArgumentMatchers.eq("calendars"),
                org.mockito.ArgumentMatchers.eq(user), org.mockito.ArgumentMatchers.anyMap()))
                .thenReturn(response);

        ObjectNode deleted = service.deleteCalendar(user, calendarId);

        assertEquals(calendarId.toString(), deleted.path("id").asString());
        assertEquals(false, deleted.path("deleted_at").isMissingNode());
        verify(supabase).updateMinimal(org.mockito.ArgumentMatchers.eq("calendars"),
                org.mockito.ArgumentMatchers.eq(user), org.mockito.ArgumentMatchers.anyMap(),
                org.mockito.ArgumentMatchers.any(ObjectNode.class));
        verify(supabase, never()).update(org.mockito.ArgumentMatchers.eq("calendars"),
                org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.anyMap(),
                org.mockito.ArgumentMatchers.any(ObjectNode.class));
    }

    private AuthenticatedUser user() {
        return new AuthenticatedUser(UUID.randomUUID(), "access-token");
    }
}
