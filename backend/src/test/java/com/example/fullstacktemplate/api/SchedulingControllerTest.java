package com.example.fullstacktemplate.api;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@AutoConfigureMockMvc
class SchedulingControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void schedulingRoutesReturnAStructuredUnauthorizedErrorWithoutABearerToken() throws Exception {
        mockMvc.perform(get("/api/v1/calendars"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("missing_access_token"))
                .andExpect(jsonPath("$.message").value("Provide a Supabase access token using the Authorization: Bearer header."));
    }

    @Test
    void malformedAuthorizationDoesNotReachTheSchedulingController() throws Exception {
        mockMvc.perform(get("/api/v1/calendars").header(HttpHeaders.AUTHORIZATION, "Basic credentials"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("missing_access_token"));
    }

    @Test
    void corsPreflightDoesNotRequireAUserToken() throws Exception {
        mockMvc.perform(options("/api/v1/calendars")
                        .header(HttpHeaders.ORIGIN, "http://localhost:3000")
                        .header(HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD, "GET")
                        .header(HttpHeaders.ACCESS_CONTROL_REQUEST_HEADERS, HttpHeaders.AUTHORIZATION))
                .andExpect(status().isOk())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers
                        .header().string(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN, "http://localhost:3000"))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers
                        .header().string(HttpHeaders.ACCESS_CONTROL_ALLOW_HEADERS, HttpHeaders.AUTHORIZATION));
    }
}
