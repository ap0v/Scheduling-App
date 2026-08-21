package com.example.fullstacktemplate.api;

import com.example.fullstacktemplate.scheduling.AuthenticatedUser;
import com.example.fullstacktemplate.scheduling.SchedulingService;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

/**
 * CRUD API for the user-facing tables in scheduling_schema.sql.
 *
 * <p>Send the Supabase session access token in {@code Authorization: Bearer
 * <token>}. Request and response fields use the schema's snake_case column
 * names. Internal delivery, audit, outbox, and guest-invitation tables are not
 * exposed here because the migration deliberately gives them no browser CRUD
 * policies.</p>
 */
@RestController
@RequestMapping("/api/v1")
public class SchedulingController {

    private final SchedulingService scheduling;

    public SchedulingController(SchedulingService scheduling) {
        this.scheduling = scheduling;
    }

    @GetMapping("/profile")
    public ObjectNode profile(@AuthenticationPrincipal AuthenticatedUser user) {
        return scheduling.profile(user);
    }

    @PatchMapping("/profile")
    public ObjectNode updateProfile(
            @AuthenticationPrincipal AuthenticatedUser user,
            @RequestBody ObjectNode request
    ) {
        return scheduling.updateProfile(user, request);
    }

    @GetMapping("/calendars")
    public ArrayNode calendars(@AuthenticationPrincipal AuthenticatedUser user) {
        return scheduling.calendars(user);
    }

    @PostMapping("/calendars")
    @ResponseStatus(HttpStatus.CREATED)
    public ObjectNode createCalendar(
            @AuthenticationPrincipal AuthenticatedUser user,
            @RequestBody ObjectNode request
    ) {
        return scheduling.createCalendar(user, request);
    }

    @GetMapping("/calendars/{calendarId}")
    public ObjectNode calendar(
            @AuthenticationPrincipal AuthenticatedUser user,
            @PathVariable UUID calendarId
    ) {
        return scheduling.calendar(user, calendarId);
    }

    @PatchMapping("/calendars/{calendarId}")
    public ObjectNode updateCalendar(
            @AuthenticationPrincipal AuthenticatedUser user,
            @PathVariable UUID calendarId,
            @RequestBody ObjectNode request
    ) {
        return scheduling.updateCalendar(user, calendarId, request);
    }

    @DeleteMapping("/calendars/{calendarId}")
    public ObjectNode deleteCalendar(
            @AuthenticationPrincipal AuthenticatedUser user,
            @PathVariable UUID calendarId
    ) {
        return scheduling.deleteCalendar(user, calendarId);
    }

    @GetMapping("/calendars/{calendarId}/events")
    public ArrayNode events(
            @AuthenticationPrincipal AuthenticatedUser user,
            @PathVariable UUID calendarId,
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String to
    ) {
        return scheduling.events(user, calendarId, from, to);
    }

    @PostMapping("/calendars/{calendarId}/events")
    @ResponseStatus(HttpStatus.CREATED)
    public ObjectNode createEvent(
            @AuthenticationPrincipal AuthenticatedUser user,
            @PathVariable UUID calendarId,
            @RequestBody ObjectNode request
    ) {
        return scheduling.createEvent(user, calendarId, request);
    }

    @GetMapping("/events/{eventId}")
    public ObjectNode event(
            @AuthenticationPrincipal AuthenticatedUser user,
            @PathVariable UUID eventId
    ) {
        return scheduling.event(user, eventId);
    }

    @PatchMapping("/events/{eventId}")
    public ObjectNode updateEvent(
            @AuthenticationPrincipal AuthenticatedUser user,
            @PathVariable UUID eventId,
            @RequestBody ObjectNode request
    ) {
        return scheduling.updateEvent(user, eventId, request);
    }

    @DeleteMapping("/events/{eventId}")
    public ObjectNode deleteEvent(
            @AuthenticationPrincipal AuthenticatedUser user,
            @PathVariable UUID eventId,
            @RequestParam(value = "rowVersion", required = false) Integer rowVersion
    ) {
        if (rowVersion == null) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "missing_row_version",
                    "rowVersion is required to delete an event.");
        }
        return scheduling.deleteEvent(user, eventId, rowVersion);
    }

    @GetMapping("/events/{eventId}/occurrence-overrides")
    public ArrayNode occurrenceOverrides(
            @AuthenticationPrincipal AuthenticatedUser user,
            @PathVariable UUID eventId
    ) {
        return scheduling.occurrenceOverrides(user, eventId);
    }

    @PostMapping("/events/{eventId}/occurrence-overrides")
    @ResponseStatus(HttpStatus.CREATED)
    public ObjectNode createOccurrenceOverride(
            @AuthenticationPrincipal AuthenticatedUser user,
            @PathVariable UUID eventId,
            @RequestBody ObjectNode request
    ) {
        return scheduling.createOccurrenceOverride(user, eventId, request);
    }

    @GetMapping("/events/{eventId}/occurrence-overrides/{overrideId}")
    public ObjectNode occurrenceOverride(
            @AuthenticationPrincipal AuthenticatedUser user,
            @PathVariable UUID eventId,
            @PathVariable UUID overrideId
    ) {
        return scheduling.occurrenceOverride(user, eventId, overrideId);
    }

    @PatchMapping("/events/{eventId}/occurrence-overrides/{overrideId}")
    public ObjectNode updateOccurrenceOverride(
            @AuthenticationPrincipal AuthenticatedUser user,
            @PathVariable UUID eventId,
            @PathVariable UUID overrideId,
            @RequestBody ObjectNode request
    ) {
        return scheduling.updateOccurrenceOverride(user, eventId, overrideId, request);
    }

    @DeleteMapping("/events/{eventId}/occurrence-overrides/{overrideId}")
    public ResponseEntity<Void> deleteOccurrenceOverride(
            @AuthenticationPrincipal AuthenticatedUser user,
            @PathVariable UUID eventId,
            @PathVariable UUID overrideId
    ) {
        scheduling.deleteOccurrenceOverride(user, eventId, overrideId);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/events/{eventId}/attendees")
    public ArrayNode attendees(
            @AuthenticationPrincipal AuthenticatedUser user,
            @PathVariable UUID eventId
    ) {
        return scheduling.attendees(user, eventId);
    }

    @PostMapping("/events/{eventId}/attendees")
    @ResponseStatus(HttpStatus.CREATED)
    public ObjectNode createAttendee(
            @AuthenticationPrincipal AuthenticatedUser user,
            @PathVariable UUID eventId,
            @RequestBody ObjectNode request
    ) {
        return scheduling.createAttendee(user, eventId, request);
    }

    @GetMapping("/events/{eventId}/attendees/{attendeeId}")
    public ObjectNode attendee(
            @AuthenticationPrincipal AuthenticatedUser user,
            @PathVariable UUID eventId,
            @PathVariable UUID attendeeId
    ) {
        return scheduling.attendee(user, eventId, attendeeId);
    }

    @PatchMapping("/events/{eventId}/attendees/{attendeeId}")
    public ObjectNode updateAttendee(
            @AuthenticationPrincipal AuthenticatedUser user,
            @PathVariable UUID eventId,
            @PathVariable UUID attendeeId,
            @RequestBody ObjectNode request
    ) {
        return scheduling.updateAttendee(user, eventId, attendeeId, request);
    }

    @DeleteMapping("/events/{eventId}/attendees/{attendeeId}")
    public ResponseEntity<Void> deleteAttendee(
            @AuthenticationPrincipal AuthenticatedUser user,
            @PathVariable UUID eventId,
            @PathVariable UUID attendeeId
    ) {
        scheduling.deleteAttendee(user, eventId, attendeeId);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/events/{eventId}/location")
    public ObjectNode eventLocation(
            @AuthenticationPrincipal AuthenticatedUser user,
            @PathVariable UUID eventId
    ) {
        return scheduling.eventLocation(user, eventId);
    }

    @PutMapping("/events/{eventId}/location")
    public ObjectNode putEventLocation(
            @AuthenticationPrincipal AuthenticatedUser user,
            @PathVariable UUID eventId,
            @RequestBody ObjectNode request
    ) {
        return scheduling.putEventLocation(user, eventId, request);
    }

    @DeleteMapping("/events/{eventId}/location")
    public ResponseEntity<Void> deleteEventLocation(
            @AuthenticationPrincipal AuthenticatedUser user,
            @PathVariable UUID eventId
    ) {
        scheduling.deleteEventLocation(user, eventId);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/events/{eventId}/reminders")
    public ArrayNode reminders(
            @AuthenticationPrincipal AuthenticatedUser user,
            @PathVariable UUID eventId
    ) {
        return scheduling.reminders(user, eventId);
    }

    @PostMapping("/events/{eventId}/reminders")
    @ResponseStatus(HttpStatus.CREATED)
    public ObjectNode createReminder(
            @AuthenticationPrincipal AuthenticatedUser user,
            @PathVariable UUID eventId,
            @RequestBody ObjectNode request
    ) {
        return scheduling.createReminder(user, eventId, request);
    }

    @GetMapping("/events/{eventId}/reminders/{reminderId}")
    public ObjectNode reminder(
            @AuthenticationPrincipal AuthenticatedUser user,
            @PathVariable UUID eventId,
            @PathVariable UUID reminderId
    ) {
        return scheduling.reminder(user, eventId, reminderId);
    }

    @PatchMapping("/events/{eventId}/reminders/{reminderId}")
    public ObjectNode updateReminder(
            @AuthenticationPrincipal AuthenticatedUser user,
            @PathVariable UUID eventId,
            @PathVariable UUID reminderId,
            @RequestBody ObjectNode request
    ) {
        return scheduling.updateReminder(user, eventId, reminderId, request);
    }

    @DeleteMapping("/events/{eventId}/reminders/{reminderId}")
    public ResponseEntity<Void> deleteReminder(
            @AuthenticationPrincipal AuthenticatedUser user,
            @PathVariable UUID eventId,
            @PathVariable UUID reminderId
    ) {
        scheduling.deleteReminder(user, eventId, reminderId);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/availability/rules")
    public ArrayNode availabilityRules(
            @AuthenticationPrincipal AuthenticatedUser user
    ) {
        return scheduling.availabilityRules(user);
    }

    @PostMapping("/availability/rules")
    @ResponseStatus(HttpStatus.CREATED)
    public ObjectNode createAvailabilityRule(
            @AuthenticationPrincipal AuthenticatedUser user,
            @RequestBody ObjectNode request
    ) {
        return scheduling.createAvailabilityRule(user, request);
    }

    @GetMapping("/availability/rules/{ruleId}")
    public ObjectNode availabilityRule(
            @AuthenticationPrincipal AuthenticatedUser user,
            @PathVariable UUID ruleId
    ) {
        return scheduling.availabilityRule(user, ruleId);
    }

    @PatchMapping("/availability/rules/{ruleId}")
    public ObjectNode updateAvailabilityRule(
            @AuthenticationPrincipal AuthenticatedUser user,
            @PathVariable UUID ruleId,
            @RequestBody ObjectNode request
    ) {
        return scheduling.updateAvailabilityRule(user, ruleId, request);
    }

    @DeleteMapping("/availability/rules/{ruleId}")
    public ResponseEntity<Void> deleteAvailabilityRule(
            @AuthenticationPrincipal AuthenticatedUser user,
            @PathVariable UUID ruleId
    ) {
        scheduling.deleteAvailabilityRule(user, ruleId);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/availability/blocks")
    public ArrayNode availabilityBlocks(
            @AuthenticationPrincipal AuthenticatedUser user
    ) {
        return scheduling.availabilityBlocks(user);
    }

    @PostMapping("/availability/blocks")
    @ResponseStatus(HttpStatus.CREATED)
    public ObjectNode createAvailabilityBlock(
            @AuthenticationPrincipal AuthenticatedUser user,
            @RequestBody ObjectNode request
    ) {
        return scheduling.createAvailabilityBlock(user, request);
    }

    @GetMapping("/availability/blocks/{blockId}")
    public ObjectNode availabilityBlock(
            @AuthenticationPrincipal AuthenticatedUser user,
            @PathVariable UUID blockId
    ) {
        return scheduling.availabilityBlock(user, blockId);
    }

    @PatchMapping("/availability/blocks/{blockId}")
    public ObjectNode updateAvailabilityBlock(
            @AuthenticationPrincipal AuthenticatedUser user,
            @PathVariable UUID blockId,
            @RequestBody ObjectNode request
    ) {
        return scheduling.updateAvailabilityBlock(user, blockId, request);
    }

    @DeleteMapping("/availability/blocks/{blockId}")
    public ResponseEntity<Void> deleteAvailabilityBlock(
            @AuthenticationPrincipal AuthenticatedUser user,
            @PathVariable UUID blockId
    ) {
        scheduling.deleteAvailabilityBlock(user, blockId);
        return ResponseEntity.noContent().build();
    }

}
