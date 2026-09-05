package com.example.fullstacktemplate;

import com.example.fullstacktemplate.config.SupabaseProperties;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
@EnableConfigurationProperties(SupabaseProperties.class)
public class FullStackTemplateApplication {

    public static void main(String[] args) {
        SpringApplication.run(FullStackTemplateApplication.class, args);
    }
}
