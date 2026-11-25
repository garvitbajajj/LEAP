package com.leap.e2e;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.leap.e2e.pages.CataloguePage;
import com.leap.e2e.pages.FeedPage;
import com.leap.e2e.pages.ItemPage;
import com.leap.e2e.pages.LoginPage;
import org.junit.jupiter.api.Test;

/**
 * Fast Java unit tests (no browser required) run by Maven Surefire (`mvn test`).
 */
class PageModelUnitTest {

  @Test
  void normalizeUrlStripsTrailingSlashes() {
    assertEquals("https://localhost:8443", E2EConfig.normalizeUrl("https://localhost:8443///"));
    assertEquals("http://localhost:5173", E2EConfig.normalizeUrl("  http://localhost:5173/ "));
  }

  @Test
  void defaultConfigProvidesSensibleFallbacks() {
    assertNotNull(E2EConfig.baseUrl());
    assertTrue(E2EConfig.timeoutSeconds() > 0);
    assertTrue(E2EConfig.isHeadless());
  }

  @Test
  void invalidTimeoutThrowsIllegalArgument() {
    String prev = System.getProperty("leap.timeoutSec");
    try {
      System.setProperty("leap.timeoutSec", "0");
      assertThrows(IllegalArgumentException.class, E2EConfig::timeoutSeconds);
    } finally {
      if (prev == null) {
        System.clearProperty("leap.timeoutSec");
      } else {
        System.setProperty("leap.timeoutSec", prev);
      }
    }
  }

  @Test
  void uniqueEmailGeneratesValidDomainAndUniqueness() throws InterruptedException {
    String e1 = E2EConfig.uniqueEmail("Dhruvika");
    Thread.sleep(2);
    String e2 = E2EConfig.uniqueEmail("Dhruvika");
    assertTrue(e1.startsWith("dhruvika."));
    assertTrue(e1.endsWith("@leap.dev"));
    assertNotEquals(e1, e2);
  }

  @Test
  void pageObjectsExposeNonNullExplicitLocators() {
    assertNotNull(LoginPage.WELCOME_SIGN_IN_BTN);
    assertNotNull(LoginPage.EMAIL_INPUT);
    assertNotNull(LoginPage.PASSWORD_INPUT);
    assertNotNull(FeedPage.REC_CARDS);
    assertNotNull(FeedPage.WHY_BOXES);
    assertNotNull(CataloguePage.SEARCH_INPUT);
    assertNotNull(ItemPage.COMPLETE_BUTTON);
    assertNotNull(ItemPage.SUBMIT_QUIZ_BUTTON);
  }
}
