package com.example.backend;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;

@SpringBootTest(properties = "litellm.master-key=test-master-key")
class BackendApplicationTests {

    @Test
    void contextLoads() {
    }

}
