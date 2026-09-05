package com.example.fullstacktemplate.security;

import com.example.fullstacktemplate.scheduling.SupabaseApiClient;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

/** Stateless bearer-token security for the browser-facing API. */
@Configuration
public class SecurityConfiguration {

    /**
     * Prevent Spring Boot from provisioning an unrelated development
     * username/password account. This API accepts Supabase bearer tokens only.
     */
    @Bean
    UserDetailsService disabledUsernamePasswordAuthentication() {
        return username -> {
            throw new UsernameNotFoundException("Username/password authentication is disabled.");
        };
    }

    @Bean
    SecurityFilterChain securityFilterChain(
            HttpSecurity http,
            SupabaseApiClient supabase,
            ApiErrorResponder errorResponder,
            ApiAuthenticationEntryPoint authenticationEntryPoint,
            ApiAccessDeniedHandler accessDeniedHandler
    ) throws Exception {
        return http
                .csrf(AbstractHttpConfigurer::disable)
                .cors(Customizer.withDefaults())
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .requestCache(AbstractHttpConfigurer::disable)
                .formLogin(AbstractHttpConfigurer::disable)
                .httpBasic(AbstractHttpConfigurer::disable)
                .logout(AbstractHttpConfigurer::disable)
                .exceptionHandling(errors -> errors
                        .authenticationEntryPoint(authenticationEntryPoint)
                        .accessDeniedHandler(accessDeniedHandler))
                .authorizeHttpRequests(authorize -> authorize
                        .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()
                        .requestMatchers("/api/health", "/api/v1/greeting").permitAll()
                        .requestMatchers("/api/v1/**").authenticated()
                        .requestMatchers("/api/**").denyAll()
                        .anyRequest().permitAll())
                .addFilterBefore(new SupabaseAuthenticationFilter(supabase, errorResponder),
                        UsernamePasswordAuthenticationFilter.class)
                .build();
    }
}
