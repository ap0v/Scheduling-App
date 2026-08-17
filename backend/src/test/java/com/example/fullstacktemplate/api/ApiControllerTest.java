package com.example.fullstacktemplate.api;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(ApiController.class)
class ApiControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void healthReturnsAnUpStatus() throws Exception {
        mockMvc.perform(get("/api/health"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("UP"))
                .andExpect(jsonPath("$.service").value("spring-boot-api"))
                .andExpect(jsonPath("$.timestamp").exists());
    }

    @Test
    void greetingUsesTheProvidedName() throws Exception {
        mockMvc.perform(get("/api/v1/greeting").param("name", "Ada"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.message").value("Hello, Ada!"))
                .andExpect(jsonPath("$.timestamp").exists());
    }
}
