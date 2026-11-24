package com.leap.e2e.pages;

import org.openqa.selenium.By;
import org.openqa.selenium.WebDriver;

public class PathPage extends BasePage {
  public static final By HEADING = By.tagName("h1");
  public static final By STEPS = By.cssSelector("ol.steps li.step");
  public static final By COMPLETED_STEPS = By.cssSelector("ol.steps li.step.complete");
  public static final By FIRST_AVAILABLE_START_LINK = By.cssSelector("ol.steps li.step.available a");

  public PathPage(WebDriver driver, int timeoutSeconds) {
    super(driver, timeoutSeconds);
  }

  public PathPage open(String baseUrl) {
    driver.get(baseUrl + "/path");
    waitVisible(HEADING);
    waitAllVisible(STEPS);
    return this;
  }

  public int countCompletedSteps() {
    return driver.findElements(COMPLETED_STEPS).size();
  }

  public void openFirstAvailableStep() {
    click(FIRST_AVAILABLE_START_LINK);
  }
}
