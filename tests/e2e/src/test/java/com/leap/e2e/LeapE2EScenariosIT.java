package com.leap.e2e;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.leap.e2e.pages.CataloguePage;
import com.leap.e2e.pages.ConsentPage;
import com.leap.e2e.pages.FeedPage;
import com.leap.e2e.pages.ItemPage;
import com.leap.e2e.pages.LoginPage;
import com.leap.e2e.pages.OnboardingPage;
import com.leap.e2e.pages.PathPage;
import com.leap.e2e.pages.ProgressPage;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.MethodOrderer;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestMethodOrder;
import org.junit.jupiter.api.extension.RegisterExtension;
import org.openqa.selenium.WebDriver;

/**
 * All seven end-to-end Selenium scenarios for LEAP using Page Object Model,
 * explicit WebDriverWait assertions, headless Chrome, and screenshot-on-failure.
 *
 * Run against a live LEAP stack via:
 *   mvn verify -Dleap.baseUrl=http://localhost:5173
 */
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class LeapE2EScenariosIT {
  private WebDriver driver;
  private String baseUrl;
  private int timeout;

  @RegisterExtension
  ScreenshotOnFailureExtension screenshots = new ScreenshotOnFailureExtension(() -> driver);

  @BeforeEach
  void setUp() {
    baseUrl = E2EConfig.baseUrl();
    timeout = E2EConfig.timeoutSeconds();
    driver = DriverFactory.createChrome();
  }

  @AfterEach
  void tearDown() {
    if (driver != null) {
      driver.quit();
    }
  }

  private void registerConsentAndOnboard(String prefix) {
    String email = E2EConfig.uniqueEmail(prefix);
    new LoginPage(driver, timeout).open(baseUrl).register("E2E Learner", email, "Learner@123");
    new ConsentPage(driver, timeout).acceptConsent();
    new OnboardingPage(driver, timeout).completeWithDefaultGoal();
  }

  @Test
  @Order(1)
  void scenario1_registerConsentAndOnboarding() {
    registerConsentAndOnboard("s1");
    String heading = new FeedPage(driver, timeout).waitLoadedAndGetHeading();
    assertTrue(heading.contains("Recommended for you"));
  }

  @Test
  @Order(2)
  void scenario2_feedShowsExplanationReason() {
    new LoginPage(driver, timeout).open(baseUrl).loginAsDemoLearner();
    FeedPage feed = new FeedPage(driver, timeout);
    feed.waitLoadedAndGetHeading();
    List<String> reasons = feed.getAllReasons();
    assertFalse(reasons.isEmpty());
    assertTrue(reasons.stream().allMatch(r -> r.contains("Why this?") && r.length() > 15));
  }

  @Test
  @Order(3)
  void scenario3_searchCatalogueUpdatesUrlAndResults() {
    new LoginPage(driver, timeout).open(baseUrl).loginAsDemoLearner();
    new FeedPage(driver, timeout).waitLoadedAndGetHeading();

    CataloguePage catalogue = new CataloguePage(driver, timeout).open(baseUrl);
    catalogue.search("SQL");
    List<String> titles = catalogue.getResultTitles();
    assertFalse(titles.isEmpty());
    assertTrue(titles.stream().anyMatch(t -> t.toUpperCase().contains("SQL")));
  }

  @Test
  @Order(4)
  void scenario4_completeLessonAdvancesLearningPath() {
    registerConsentAndOnboard("s4");
    new FeedPage(driver, timeout).waitLoadedAndGetHeading();

    PathPage path = new PathPage(driver, timeout).open(baseUrl);
    int beforeDone = path.countCompletedSteps();
    path.openFirstAvailableStep();

    new ItemPage(driver, timeout).markComplete();

    path.open(baseUrl);
    int afterDone = path.countCompletedSteps();
    assertTrue(afterDone > beforeDone, "Expected completed step count to increase after finishing lesson");
  }

  @Test
  @Order(5)
  void scenario5_quizSubmissionUpdatesMastery() {
    registerConsentAndOnboard("s5");
    new FeedPage(driver, timeout).waitLoadedAndGetHeading();

    CataloguePage catalogue = new CataloguePage(driver, timeout).open(baseUrl);
    catalogue.filterByType("quiz");
    catalogue.openItemByIndex(0);

    String bannerText = new ItemPage(driver, timeout).answerAllQuestionsAndSubmit();
    assertTrue(bannerText.contains("correct"), "Expected graded quiz feedback banner");

    ProgressPage progress = new ProgressPage(driver, timeout).open(baseUrl);
    assertTrue(progress.countMasteryBars() > 0, "Expected skill mastery bars after quiz attempt");
  }

  @Test
  @Order(6)
  void scenario6_notForMeRemovesRecommendationCard() {
    registerConsentAndOnboard("s6");
    FeedPage feed = new FeedPage(driver, timeout);
    feed.waitLoadedAndGetHeading();

    String removedTitle = feed.rejectFirstRecommendation();
    assertFalse(feed.getVisibleCardTitles().contains(removedTitle));
  }

  @Test
  @Order(7)
  void scenario7_learnerIsBlockedFromAdmin() {
    new LoginPage(driver, timeout).open(baseUrl).loginAsDemoLearner();
    new FeedPage(driver, timeout).waitLoadedAndGetHeading();

    driver.get(baseUrl + "/admin");
    String heading = new FeedPage(driver, timeout).waitLoadedAndGetHeading();
    assertFalse(driver.getCurrentUrl().contains("/admin"));
    assertTrue(heading.contains("Recommended for you"));
  }
}
