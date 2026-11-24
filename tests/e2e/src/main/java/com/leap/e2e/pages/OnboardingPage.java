package com.leap.e2e.pages;

import org.openqa.selenium.By;
import org.openqa.selenium.WebDriver;

public class OnboardingPage extends BasePage {
  public static final By FIRST_GOAL_OPTION = By.cssSelector("button[role='radio']");
  public static final By CONTINUE_BUTTON = By.xpath("//button[normalize-space()='Continue']");
  public static final By FINISH_BUTTON = By.xpath("//button[contains(.,'Build my learning path')]");

  public OnboardingPage(WebDriver driver, int timeoutSeconds) {
    super(driver, timeoutSeconds);
  }

  public void completeWithDefaultGoal() {
    // Step 1: pick goal
    click(FIRST_GOAL_OPTION);
    click(CONTINUE_BUTTON);
    // Step 2: known skills (keep defaults)
    click(CONTINUE_BUTTON);
    // Step 3: learning preferences
    click(CONTINUE_BUTTON);
    // Step 4: review & submit
    click(FINISH_BUTTON);
  }
}
