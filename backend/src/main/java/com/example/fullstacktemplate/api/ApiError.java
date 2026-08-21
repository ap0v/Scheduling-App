package com.example.fullstacktemplate.api;

/** A stable, small error response for the public API. */
public record ApiError(String code, String message) {
}
