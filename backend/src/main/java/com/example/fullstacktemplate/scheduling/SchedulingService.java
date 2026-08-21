package com.example.fullstacktemplate.scheduling;

import com.example.fullstacktemplate.api.ApiException;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

/**
 * Schema-aware scheduling CRUD operations backed by Supabase PostgREST.
 *
 * <p>Payload property names intentionally mirror the SQL column names. The
 * service owns fields derived from the authenticated user so callers cannot
 * choose a different calendar owner, event creator, or availability profile.</p>
 */
@Service
public class SchedulingService {

    private static final String TABLE_AVAILABILITY_BLOCKS = "availability_blocks";
    private static final String TABLE_AVAILABILITY_RULES = "availability_rules";
    private static final String TABLE_CALENDARS = "calendars";
    private static final String TABLE_EVENT_ATTENDEES = "event_attendees";
    private static final String TABLE_EVENT_LOCATIONS = "event_locations";
    private static final String TABLE_EVENT_OCCURRENCE_OVERRIDES = "event_occurrence_overrides";
    private static final String TABLE_EVENT_REMINDERS = "event_reminders";
    private static final String TABLE_EVENTS = "events";

    private static final String FIELD_CALENDAR_ID = "calendar_id";
    private static final String FIELD_CONFERENCE_URL = "conference_url";
    private static final String FIELD_DELETED_AT = "deleted_at";
    private static final String FIELD_DESCRIPTION = "description";
    private static final String FIELD_ENDS_AT = "ends_at";
    private static final String FIELD_ENDS_ON = "ends_on";
    private static final String FIELD_EVENT_ID = "event_id";
    private static final String FIELD_EVENT_TIME_ZONE = "event_time_zone";
    private static final String FIELD_ID = "id";
    private static final String FIELD_IS_ALL_DAY = "is_all_day";
    private static final String FIELD_LOCATION = "location";
    private static final String FIELD_NAME = "name";
    private static final String FIELD_PROFILE_ID = "profile_id";
    private static final String FIELD_ROLE = "role";
    private static final String FIELD_ROW_VERSION = "row_version";
    private static final String FIELD_STARTS_AT = "starts_at";
    private static final String FIELD_STARTS_ON = "starts_on";
    private static final String FIELD_TIME_ZONE = "time_zone";
    private static final String FIELD_TITLE = "title";

    private static final String FILTER_IS_NULL = "is.null";
    private static final String QUERY_ORDER = "order";
    private static final String ROLE_ORGANIZER = "organizer";
    private static final String ERROR_ORGANIZER_REQUIRED = "organizer_required";
    private static final String ERROR_STALE_EVENT_VERSION = "stale_event_version";

    private static final String RESOURCE_AVAILABILITY_BLOCK = "availability block";
    private static final String RESOURCE_AVAILABILITY_RULE = "availability rule";
    private static final String RESOURCE_CALENDAR = "calendar";
    private static final String RESOURCE_EVENT = "event";
    private static final String RESOURCE_EVENT_ATTENDEE = "event attendee";
    private static final String RESOURCE_EVENT_LOCATION = "event location";
    private static final String RESOURCE_EVENT_OCCURRENCE_OVERRIDE = "event occurrence override";
    private static final String RESOURCE_EVENT_REMINDER = "event reminder";
    private static final String RESOURCE_PROFILE = "profile";

    private static final Set<String> PROFILE_FIELDS = Set.of(
            "display_name", FIELD_TIME_ZONE, "locale");
    private static final Set<String> CALENDAR_FIELDS = Set.of(
            FIELD_NAME, FIELD_DESCRIPTION, "color", FIELD_TIME_ZONE, "default_event_access");
    private static final Set<String> EVENT_CREATE_FIELDS = Set.of(
            FIELD_TITLE, FIELD_DESCRIPTION, FIELD_LOCATION, FIELD_CONFERENCE_URL, "status", "busy_status",
            "access_scope", FIELD_IS_ALL_DAY, FIELD_STARTS_AT, FIELD_ENDS_AT, FIELD_STARTS_ON, FIELD_ENDS_ON,
            FIELD_EVENT_TIME_ZONE, "recurrence_rule", "recurrence_revision", "sequence");
    private static final Set<String> EVENT_UPDATE_FIELDS = Set.of(
            FIELD_TITLE, FIELD_DESCRIPTION, FIELD_LOCATION, FIELD_CONFERENCE_URL, "status", "busy_status",
            "access_scope", FIELD_IS_ALL_DAY, FIELD_STARTS_AT, FIELD_ENDS_AT, FIELD_STARTS_ON, FIELD_ENDS_ON,
            FIELD_EVENT_TIME_ZONE, "recurrence_rule", "recurrence_revision", "sequence", FIELD_ROW_VERSION);
    private static final Set<String> OVERRIDE_FIELDS = Set.of(
            "original_starts_at", "original_starts_on", "is_cancelled", FIELD_TITLE, FIELD_DESCRIPTION,
            FIELD_LOCATION, FIELD_CONFERENCE_URL, FIELD_STARTS_AT, FIELD_ENDS_AT, FIELD_STARTS_ON, FIELD_ENDS_ON,
            FIELD_EVENT_TIME_ZONE);
    private static final Set<String> ATTENDEE_FIELDS = Set.of(
            FIELD_PROFILE_ID, "email", "display_name", FIELD_ROLE, "response_status", "responded_at");
    private static final Set<String> LOCATION_FIELDS = Set.of(
            "kind", "host_label", "host_address", "google_place_id", "place_id_refreshed_at",
            "host_confirmed_at");
    private static final Set<String> REMINDER_FIELDS = Set.of(
            "recipient_profile_id", "channel", "minutes_before");
    private static final Set<String> AVAILABILITY_RULE_FIELDS = Set.of(
            "weekday", "starts_local_time", "ends_local_time", FIELD_TIME_ZONE, "effective_from",
            "effective_until");
    private static final Set<String> AVAILABILITY_BLOCK_FIELDS = Set.of(
            "kind", FIELD_STARTS_AT, FIELD_ENDS_AT, FIELD_TIME_ZONE, "note");

    private final SupabaseApiClient supabase;
    private final ObjectMapper objectMapper;

    public SchedulingService(SupabaseApiClient supabase, ObjectMapper objectMapper) {
        this.supabase = supabase;
        this.objectMapper = objectMapper;
    }

    // Profile

    public ObjectNode profile(AuthenticatedUser user) {
        return requireOne(supabase.get("profiles", user, byId(user.profileId())), RESOURCE_PROFILE);
    }

    public ObjectNode updateProfile(AuthenticatedUser user, ObjectNode request) {
        ObjectNode payload = writablePayload(request, PROFILE_FIELDS, RESOURCE_PROFILE);
        return requireOne(supabase.update("profiles", user, byId(user.profileId()), payload), RESOURCE_PROFILE);
    }

    // Calendars

    public ArrayNode calendars(AuthenticatedUser user) {
        return rows(supabase.get(TABLE_CALENDARS, user, query(
                FIELD_DELETED_AT, FILTER_IS_NULL,
                QUERY_ORDER, "created_at.asc")));
    }

    public ObjectNode createCalendar(AuthenticatedUser user, ObjectNode request) {
        ObjectNode payload = writablePayload(request, CALENDAR_FIELDS, RESOURCE_CALENDAR);
        requireNonBlank(payload, FIELD_NAME, "Calendar name");
        payload.put("owner_profile_id", user.profileId().toString());
        return requireOne(supabase.insert(TABLE_CALENDARS, user, payload), RESOURCE_CALENDAR);
    }

    public ObjectNode calendar(AuthenticatedUser user, UUID calendarId) {
        return requireOne(supabase.get(TABLE_CALENDARS, user, activeById(calendarId)), RESOURCE_CALENDAR);
    }

    public ObjectNode updateCalendar(AuthenticatedUser user, UUID calendarId, ObjectNode request) {
        ObjectNode payload = writablePayload(request, CALENDAR_FIELDS, RESOURCE_CALENDAR);
        validateNonBlankWhenPresent(payload, FIELD_NAME, "Calendar name");
        requireCalendar(user, calendarId);
        return requireOne(supabase.update(TABLE_CALENDARS, user, activeById(calendarId), payload), RESOURCE_CALENDAR);
    }

    /** Calendar deletion is intentionally a soft delete to match SQL grants and RLS. */
    public ObjectNode deleteCalendar(AuthenticatedUser user, UUID calendarId) {
        ObjectNode existing = requireCalendar(user, calendarId);
        Instant deletedAt = Instant.now();
        ObjectNode payload = objectMapper.createObjectNode();
        payload.put(FIELD_DELETED_AT, deletedAt.toString());
        supabase.updateMinimal(TABLE_CALENDARS, user, activeById(calendarId), payload);
        return softDeleteAcknowledgement(existing, deletedAt, null);
    }

    // Events

    public ArrayNode events(AuthenticatedUser user, UUID calendarId, String from, String to) {
        requireCalendar(user, calendarId);
        EventRange range = parseRange(from, to);
        Map<String, String> timed = query(
                FIELD_CALENDAR_ID, equalsFilter(calendarId),
                FIELD_DELETED_AT, FILTER_IS_NULL,
                FIELD_IS_ALL_DAY, "eq.false",
                QUERY_ORDER, "starts_at.asc");
        Map<String, String> allDay = query(
                FIELD_CALENDAR_ID, equalsFilter(calendarId),
                FIELD_DELETED_AT, FILTER_IS_NULL,
                FIELD_IS_ALL_DAY, "eq.true",
                QUERY_ORDER, "starts_on.asc");
        if (range.from() != null) {
            timed.put(FIELD_ENDS_AT, "gt." + range.from().instant());
            allDay.put(FIELD_ENDS_ON, "gt." + range.from().date());
        }
        if (range.to() != null) {
            timed.put(FIELD_STARTS_AT, "lt." + range.to().instant());
            allDay.put(FIELD_STARTS_ON, "lt." + range.to().date());
        }

        List<JsonNode> combined = new ArrayList<>();
        rows(supabase.get(TABLE_EVENTS, user, timed)).forEach(combined::add);
        rows(supabase.get(TABLE_EVENTS, user, allDay)).forEach(combined::add);
        combined.sort(Comparator.comparing(this::eventStart));

        ArrayNode result = objectMapper.createArrayNode();
        combined.forEach(result::add);
        return result;
    }

    public ObjectNode createEvent(AuthenticatedUser user, UUID calendarId, ObjectNode request) {
        requireCalendar(user, calendarId);
        ObjectNode payload = writablePayload(request, EVENT_CREATE_FIELDS, RESOURCE_EVENT);
        requireNonBlank(payload, FIELD_TITLE, "Event title");
        validateNewEventShape(payload);
        payload.put(FIELD_CALENDAR_ID, calendarId.toString());
        payload.put("created_by_profile_id", user.profileId().toString());
        return requireOne(supabase.insert(TABLE_EVENTS, user, payload), RESOURCE_EVENT);
    }

    public ObjectNode event(AuthenticatedUser user, UUID eventId) {
        return requireEvent(user, eventId);
    }

    /**
     * Applies an event update only when the submitted row_version still matches
     * the database row. The migration trigger requires the next exact version.
     */
    public ObjectNode updateEvent(AuthenticatedUser user, UUID eventId, ObjectNode request) {
        int expectedVersion = requiredVersion(request);
        ObjectNode payload = writablePayload(request, EVENT_UPDATE_FIELDS, RESOURCE_EVENT);
        payload.remove(FIELD_ROW_VERSION);
        if (payload.isEmpty()) {
            throw badRequest("event_update_empty", "Provide at least one event field to update.");
        }
        validateNonBlankWhenPresent(payload, FIELD_TITLE, "Event title");
        payload.put(FIELD_ROW_VERSION, nextVersion(expectedVersion));

        requireEvent(user, eventId);
        ObjectNode updated = firstOrNull(supabase.update(TABLE_EVENTS, user, query(
                FIELD_ID, equalsFilter(eventId),
                FIELD_ROW_VERSION, equalsFilter(expectedVersion)), payload));
        if (updated == null) {
            throw new ApiException(HttpStatus.CONFLICT, ERROR_STALE_EVENT_VERSION,
                    "This event has changed. Reload it before saving your update.");
        }
        return updated;
    }

    /** Event deletion is a versioned soft delete, not a physical DELETE. */
    public ObjectNode deleteEvent(AuthenticatedUser user, UUID eventId, int expectedVersion) {
        int nextVersion = nextVersion(expectedVersion);
        ObjectNode existing = requireEvent(user, eventId);
        int actualVersion = existing.path(FIELD_ROW_VERSION).asInt(-1);
        if (actualVersion != expectedVersion) {
            throw new ApiException(HttpStatus.CONFLICT, ERROR_STALE_EVENT_VERSION,
                    "This event has changed. Reload it before deleting it.");
        }
        Instant deletedAt = Instant.now();
        ObjectNode payload = objectMapper.createObjectNode();
        payload.put(FIELD_DELETED_AT, deletedAt.toString());
        payload.put(FIELD_ROW_VERSION, nextVersion);

        supabase.updateMinimal(TABLE_EVENTS, user, query(
                FIELD_ID, equalsFilter(eventId),
                FIELD_ROW_VERSION, equalsFilter(expectedVersion)), payload);
        ObjectNode activeEvent = firstOrNull(supabase.get(TABLE_EVENTS, user, activeById(eventId)));
        if (activeEvent != null) {
            throw new ApiException(HttpStatus.CONFLICT, ERROR_STALE_EVENT_VERSION,
                    "This event has changed. Reload it before deleting it.");
        }
        return softDeleteAcknowledgement(existing, deletedAt, nextVersion);
    }

    // Event occurrence overrides

    public ArrayNode occurrenceOverrides(AuthenticatedUser user, UUID eventId) {
        requireEvent(user, eventId);
        return rows(supabase.get(TABLE_EVENT_OCCURRENCE_OVERRIDES, user, query(
                FIELD_EVENT_ID, equalsFilter(eventId),
                QUERY_ORDER, "created_at.asc")));
    }

    public ObjectNode createOccurrenceOverride(AuthenticatedUser user, UUID eventId, ObjectNode request) {
        requireEvent(user, eventId);
        ObjectNode payload = writablePayload(request, OVERRIDE_FIELDS, RESOURCE_EVENT_OCCURRENCE_OVERRIDE);
        payload.put(FIELD_EVENT_ID, eventId.toString());
        payload.put("updated_by_profile_id", user.profileId().toString());
        return requireOne(supabase.insert(TABLE_EVENT_OCCURRENCE_OVERRIDES, user, payload),
                RESOURCE_EVENT_OCCURRENCE_OVERRIDE);
    }

    public ObjectNode occurrenceOverride(AuthenticatedUser user, UUID eventId, UUID overrideId) {
        return requireOne(supabase.get(TABLE_EVENT_OCCURRENCE_OVERRIDES, user, query(
                FIELD_ID, equalsFilter(overrideId),
                FIELD_EVENT_ID, equalsFilter(eventId))), RESOURCE_EVENT_OCCURRENCE_OVERRIDE);
    }

    public ObjectNode updateOccurrenceOverride(
            AuthenticatedUser user, UUID eventId, UUID overrideId, ObjectNode request) {
        ObjectNode payload = writablePayload(request, OVERRIDE_FIELDS, RESOURCE_EVENT_OCCURRENCE_OVERRIDE);
        payload.put("updated_by_profile_id", user.profileId().toString());
        occurrenceOverride(user, eventId, overrideId);
        return requireOne(supabase.update(TABLE_EVENT_OCCURRENCE_OVERRIDES, user, query(
                FIELD_ID, equalsFilter(overrideId),
                FIELD_EVENT_ID, equalsFilter(eventId)), payload), RESOURCE_EVENT_OCCURRENCE_OVERRIDE);
    }

    public void deleteOccurrenceOverride(AuthenticatedUser user, UUID eventId, UUID overrideId) {
        occurrenceOverride(user, eventId, overrideId);
        requireOne(supabase.delete(TABLE_EVENT_OCCURRENCE_OVERRIDES, user, query(
                FIELD_ID, equalsFilter(overrideId),
                FIELD_EVENT_ID, equalsFilter(eventId))), RESOURCE_EVENT_OCCURRENCE_OVERRIDE);
    }

    // Event attendees

    public ArrayNode attendees(AuthenticatedUser user, UUID eventId) {
        requireEvent(user, eventId);
        return rows(supabase.get(TABLE_EVENT_ATTENDEES, user, query(
                FIELD_EVENT_ID, equalsFilter(eventId),
                QUERY_ORDER, "invited_at.asc")));
    }

    public ObjectNode createAttendee(AuthenticatedUser user, UUID eventId, ObjectNode request) {
        requireEvent(user, eventId);
        ObjectNode payload = writablePayload(request, ATTENDEE_FIELDS, RESOURCE_EVENT_ATTENDEE);
        payload.put(FIELD_EVENT_ID, eventId.toString());
        return requireOne(supabase.insert(TABLE_EVENT_ATTENDEES, user, payload), RESOURCE_EVENT_ATTENDEE);
    }

    public ObjectNode attendee(AuthenticatedUser user, UUID eventId, UUID attendeeId) {
        return requireOne(supabase.get(TABLE_EVENT_ATTENDEES, user, query(
                FIELD_ID, equalsFilter(attendeeId),
                FIELD_EVENT_ID, equalsFilter(eventId))), RESOURCE_EVENT_ATTENDEE);
    }

    public ObjectNode updateAttendee(AuthenticatedUser user, UUID eventId, UUID attendeeId, ObjectNode request) {
        ObjectNode existing = attendee(user, eventId, attendeeId);
        ObjectNode payload = writablePayload(request, ATTENDEE_FIELDS, RESOURCE_EVENT_ATTENDEE);
        preventOrganizerRemoval(existing, payload);
        return requireOne(supabase.update(TABLE_EVENT_ATTENDEES, user, query(
                FIELD_ID, equalsFilter(attendeeId),
                FIELD_EVENT_ID, equalsFilter(eventId)), payload), RESOURCE_EVENT_ATTENDEE);
    }

    public void deleteAttendee(AuthenticatedUser user, UUID eventId, UUID attendeeId) {
        ObjectNode existing = attendee(user, eventId, attendeeId);
        if (ROLE_ORGANIZER.equals(existing.path(FIELD_ROLE).asString())) {
            throw badRequest(ERROR_ORGANIZER_REQUIRED, "The event organizer cannot be removed.");
        }
        requireOne(supabase.delete(TABLE_EVENT_ATTENDEES, user, query(
                FIELD_ID, equalsFilter(attendeeId),
                FIELD_EVENT_ID, equalsFilter(eventId))), RESOURCE_EVENT_ATTENDEE);
    }

    // Event location (at most one per event)

    public ObjectNode eventLocation(AuthenticatedUser user, UUID eventId) {
        requireEvent(user, eventId);
        return requireOne(supabase.get(TABLE_EVENT_LOCATIONS, user, query(
                FIELD_EVENT_ID, equalsFilter(eventId))), RESOURCE_EVENT_LOCATION);
    }

    public ObjectNode putEventLocation(AuthenticatedUser user, UUID eventId, ObjectNode request) {
        requireEvent(user, eventId);
        ObjectNode payload = writablePayload(request, LOCATION_FIELDS, RESOURCE_EVENT_LOCATION);
        payload.put(FIELD_EVENT_ID, eventId.toString());
        return requireOne(supabase.upsert(TABLE_EVENT_LOCATIONS, user, payload, query(
                "on_conflict", FIELD_EVENT_ID)), RESOURCE_EVENT_LOCATION);
    }

    public void deleteEventLocation(AuthenticatedUser user, UUID eventId) {
        eventLocation(user, eventId);
        requireOne(supabase.delete(TABLE_EVENT_LOCATIONS, user, query(
                FIELD_EVENT_ID, equalsFilter(eventId))), RESOURCE_EVENT_LOCATION);
    }

    // Event reminders

    public ArrayNode reminders(AuthenticatedUser user, UUID eventId) {
        requireEvent(user, eventId);
        return rows(supabase.get(TABLE_EVENT_REMINDERS, user, query(
                FIELD_EVENT_ID, equalsFilter(eventId),
                QUERY_ORDER, "minutes_before.asc")));
    }

    public ObjectNode createReminder(AuthenticatedUser user, UUID eventId, ObjectNode request) {
        requireEvent(user, eventId);
        ObjectNode payload = writablePayload(request, REMINDER_FIELDS, RESOURCE_EVENT_REMINDER);
        payload.put(FIELD_EVENT_ID, eventId.toString());
        return requireOne(supabase.insert(TABLE_EVENT_REMINDERS, user, payload), RESOURCE_EVENT_REMINDER);
    }

    public ObjectNode reminder(AuthenticatedUser user, UUID eventId, UUID reminderId) {
        return requireOne(supabase.get(TABLE_EVENT_REMINDERS, user, query(
                FIELD_ID, equalsFilter(reminderId),
                FIELD_EVENT_ID, equalsFilter(eventId))), RESOURCE_EVENT_REMINDER);
    }

    public ObjectNode updateReminder(AuthenticatedUser user, UUID eventId, UUID reminderId, ObjectNode request) {
        reminder(user, eventId, reminderId);
        ObjectNode payload = writablePayload(request, REMINDER_FIELDS, RESOURCE_EVENT_REMINDER);
        return requireOne(supabase.update(TABLE_EVENT_REMINDERS, user, query(
                FIELD_ID, equalsFilter(reminderId),
                FIELD_EVENT_ID, equalsFilter(eventId)), payload), RESOURCE_EVENT_REMINDER);
    }

    public void deleteReminder(AuthenticatedUser user, UUID eventId, UUID reminderId) {
        reminder(user, eventId, reminderId);
        requireOne(supabase.delete(TABLE_EVENT_REMINDERS, user, query(
                FIELD_ID, equalsFilter(reminderId),
                FIELD_EVENT_ID, equalsFilter(eventId))), RESOURCE_EVENT_REMINDER);
    }

    // Availability rules and one-off blocks

    public ArrayNode availabilityRules(AuthenticatedUser user) {
        return rows(supabase.get(TABLE_AVAILABILITY_RULES, user, query(
                FIELD_PROFILE_ID, equalsFilter(user.profileId()),
                QUERY_ORDER, "weekday.asc")));
    }

    public ObjectNode createAvailabilityRule(AuthenticatedUser user, ObjectNode request) {
        ObjectNode payload = writablePayload(request, AVAILABILITY_RULE_FIELDS, RESOURCE_AVAILABILITY_RULE);
        payload.put(FIELD_PROFILE_ID, user.profileId().toString());
        return requireOne(supabase.insert(TABLE_AVAILABILITY_RULES, user, payload), RESOURCE_AVAILABILITY_RULE);
    }

    public ObjectNode availabilityRule(AuthenticatedUser user, UUID ruleId) {
        return requireOne(supabase.get(TABLE_AVAILABILITY_RULES, user, ownedById(ruleId, user.profileId())),
                RESOURCE_AVAILABILITY_RULE);
    }

    public ObjectNode updateAvailabilityRule(AuthenticatedUser user, UUID ruleId, ObjectNode request) {
        availabilityRule(user, ruleId);
        ObjectNode payload = writablePayload(request, AVAILABILITY_RULE_FIELDS, RESOURCE_AVAILABILITY_RULE);
        return requireOne(supabase.update(TABLE_AVAILABILITY_RULES, user, ownedById(ruleId, user.profileId()), payload),
                RESOURCE_AVAILABILITY_RULE);
    }

    public void deleteAvailabilityRule(AuthenticatedUser user, UUID ruleId) {
        availabilityRule(user, ruleId);
        requireOne(supabase.delete(TABLE_AVAILABILITY_RULES, user, ownedById(ruleId, user.profileId())),
                RESOURCE_AVAILABILITY_RULE);
    }

    public ArrayNode availabilityBlocks(AuthenticatedUser user) {
        return rows(supabase.get(TABLE_AVAILABILITY_BLOCKS, user, query(
                FIELD_PROFILE_ID, equalsFilter(user.profileId()),
                QUERY_ORDER, "starts_at.asc")));
    }

    public ObjectNode createAvailabilityBlock(AuthenticatedUser user, ObjectNode request) {
        ObjectNode payload = writablePayload(request, AVAILABILITY_BLOCK_FIELDS, RESOURCE_AVAILABILITY_BLOCK);
        payload.put(FIELD_PROFILE_ID, user.profileId().toString());
        return requireOne(supabase.insert(TABLE_AVAILABILITY_BLOCKS, user, payload), RESOURCE_AVAILABILITY_BLOCK);
    }

    public ObjectNode availabilityBlock(AuthenticatedUser user, UUID blockId) {
        return requireOne(supabase.get(TABLE_AVAILABILITY_BLOCKS, user, ownedById(blockId, user.profileId())),
                RESOURCE_AVAILABILITY_BLOCK);
    }

    public ObjectNode updateAvailabilityBlock(AuthenticatedUser user, UUID blockId, ObjectNode request) {
        availabilityBlock(user, blockId);
        ObjectNode payload = writablePayload(request, AVAILABILITY_BLOCK_FIELDS, RESOURCE_AVAILABILITY_BLOCK);
        return requireOne(supabase.update(TABLE_AVAILABILITY_BLOCKS, user, ownedById(blockId, user.profileId()), payload),
                RESOURCE_AVAILABILITY_BLOCK);
    }

    public void deleteAvailabilityBlock(AuthenticatedUser user, UUID blockId) {
        availabilityBlock(user, blockId);
        requireOne(supabase.delete(TABLE_AVAILABILITY_BLOCKS, user, ownedById(blockId, user.profileId())),
                RESOURCE_AVAILABILITY_BLOCK);
    }

    private ObjectNode requireCalendar(AuthenticatedUser user, UUID calendarId) {
        return requireOne(supabase.get(TABLE_CALENDARS, user, activeById(calendarId)), RESOURCE_CALENDAR);
    }

    private ObjectNode requireEvent(AuthenticatedUser user, UUID eventId) {
        return requireOne(supabase.get(TABLE_EVENTS, user, activeById(eventId)), RESOURCE_EVENT);
    }

    private ObjectNode writablePayload(ObjectNode request, Set<String> allowedFields, String resource) {
        ObjectNode result = objectMapper.createObjectNode();
        Iterator<Map.Entry<String, JsonNode>> fields = request.properties().iterator();
        while (fields.hasNext()) {
            Map.Entry<String, JsonNode> field = fields.next();
            if (!allowedFields.contains(field.getKey())) {
                throw badRequest("unsupported_" + resource.replace(' ', '_') + "_field",
                        "Field '" + field.getKey() + "' cannot be written for " + resource + ".");
            }
            result.set(field.getKey(), field.getValue());
        }
        if (result.isEmpty()) {
            throw badRequest("empty_" + resource.replace(' ', '_') + "_request",
                    "Provide at least one writable field for " + resource + ".");
        }
        return result;
    }

    private void requireNonBlank(ObjectNode payload, String field, String label) {
        if (!payload.has(field)) {
            throw badRequest("missing_" + field, label + " is required.");
        }
        validateNonBlankWhenPresent(payload, field, label);
    }

    private void validateNonBlankWhenPresent(ObjectNode payload, String field, String label) {
        if (payload.has(field) && (!payload.path(field).isString() || payload.path(field).asString().isBlank())) {
            throw badRequest("invalid_" + field, label + " cannot be blank.");
        }
    }

    private void validateNewEventShape(ObjectNode payload) {
        boolean allDay = payload.path(FIELD_IS_ALL_DAY).asBoolean(false);
        if (allDay) {
            requirePresent(payload, FIELD_STARTS_ON, "All-day events require starts_on.");
            requirePresent(payload, FIELD_ENDS_ON, "All-day events require ends_on.");
        } else {
            requirePresent(payload, FIELD_STARTS_AT, "Timed events require starts_at.");
            requirePresent(payload, FIELD_ENDS_AT, "Timed events require ends_at.");
            requirePresent(payload, FIELD_EVENT_TIME_ZONE, "Timed events require event_time_zone.");
        }
    }

    private void requirePresent(ObjectNode payload, String field, String message) {
        if (!payload.hasNonNull(field)) {
            throw badRequest("missing_" + field, message);
        }
    }

    private int requiredVersion(ObjectNode request) {
        JsonNode value = request.get(FIELD_ROW_VERSION);
        if (value == null || !value.isIntegralNumber() || !value.canConvertToInt() || value.intValue() < 0) {
            throw badRequest("invalid_row_version", "row_version must be a non-negative integer.");
        }
        return value.intValue();
    }

    private int nextVersion(int expectedVersion) {
        if (expectedVersion < 0 || expectedVersion == Integer.MAX_VALUE) {
            throw badRequest("invalid_row_version", "row_version must be a non-negative incrementable integer.");
        }
        return expectedVersion + 1;
    }

    private void preventOrganizerRemoval(ObjectNode existing, ObjectNode payload) {
        if (!ROLE_ORGANIZER.equals(existing.path(FIELD_ROLE).asString())) {
            return;
        }
        if (payload.has(FIELD_ROLE) && !ROLE_ORGANIZER.equals(payload.path(FIELD_ROLE).asString())) {
            throw badRequest(ERROR_ORGANIZER_REQUIRED, "The event organizer cannot be demoted.");
        }
        if (payload.has(FIELD_PROFILE_ID)) {
            throw badRequest(ERROR_ORGANIZER_REQUIRED, "The event organizer identity cannot be changed.");
        }
    }

    private EventRange parseRange(String rawFrom, String rawTo) {
        Boundary from = parseBoundary(rawFrom, "from");
        Boundary to = parseBoundary(rawTo, "to");
        if (from != null && to != null && !to.instant().isAfter(from.instant())) {
            throw badRequest("invalid_event_range", "to must be later than from.");
        }
        return new EventRange(from, to);
    }

    private Boundary parseBoundary(String raw, String name) {
        if (!StringUtils.hasText(raw)) {
            return null;
        }
        try {
            OffsetDateTime value = OffsetDateTime.parse(raw);
            return new Boundary(value.toInstant(), value.toLocalDate());
        } catch (DateTimeParseException ignored) {
            try {
                LocalDate value = LocalDate.parse(raw);
                return new Boundary(value.atStartOfDay().toInstant(ZoneOffset.UTC), value);
            } catch (DateTimeParseException exception) {
                throw badRequest("invalid_event_range", name + " must be an ISO-8601 date or offset date-time.");
            }
        }
    }

    private String eventStart(JsonNode event) {
        String startsAt = event.path(FIELD_STARTS_AT).asString();
        return startsAt.isBlank() ? event.path(FIELD_STARTS_ON).asString() : startsAt;
    }

    private ObjectNode softDeleteAcknowledgement(ObjectNode existing, Instant deletedAt, Integer rowVersion) {
        ObjectNode acknowledgement = existing.deepCopy();
        acknowledgement.put(FIELD_DELETED_AT, deletedAt.toString());
        if (rowVersion != null) {
            acknowledgement.put(FIELD_ROW_VERSION, rowVersion);
        }
        return acknowledgement;
    }

    private ArrayNode rows(JsonNode response) {
        if (!response.isArray()) {
            throw new ApiException(HttpStatus.BAD_GATEWAY, "invalid_supabase_response",
                    "Supabase returned an unexpected response shape.");
        }
        return (ArrayNode) response;
    }

    private ObjectNode requireOne(JsonNode response, String resource) {
        ObjectNode result = firstOrNull(response);
        if (result == null) {
            throw new ApiException(HttpStatus.NOT_FOUND, "resource_not_found",
                    "The requested " + resource + " was not found.");
        }
        return result;
    }

    private ObjectNode firstOrNull(JsonNode response) {
        ArrayNode results = rows(response);
        if (results.isEmpty() || !results.get(0).isObject()) {
            return null;
        }
        return (ObjectNode) results.get(0);
    }

    private Map<String, String> byId(UUID id) {
        return query(FIELD_ID, equalsFilter(id));
    }

    private Map<String, String> activeById(UUID id) {
        return query(FIELD_ID, equalsFilter(id), FIELD_DELETED_AT, FILTER_IS_NULL);
    }

    private Map<String, String> ownedById(UUID id, UUID profileId) {
        return query(FIELD_ID, equalsFilter(id), FIELD_PROFILE_ID, equalsFilter(profileId));
    }

    private Map<String, String> query(String... keyValues) {
        if (keyValues.length % 2 != 0) {
            throw new IllegalArgumentException("Query arguments must be key/value pairs.");
        }
        Map<String, String> result = new LinkedHashMap<>();
        result.put("select", "*");
        for (int index = 0; index < keyValues.length; index += 2) {
            result.put(keyValues[index], keyValues[index + 1]);
        }
        return result;
    }

    private String equalsFilter(Object value) {
        return "eq." + value;
    }

    private ApiException badRequest(String code, String message) {
        return new ApiException(HttpStatus.BAD_REQUEST, code, message);
    }

    private record Boundary(Instant instant, LocalDate date) {
    }

    private record EventRange(Boundary from, Boundary to) {
    }
}
