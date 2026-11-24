package com.leap.e2e.pages;

import org.openqa.selenium.By;
import org.openqa.selenium.WebDriver;

public class ProgressPage extends BasePage {
  public static final By HEADING = By.tagName("h1");
  public static final By MASTERY_BARS = By.cssSelector("[role='progressbar']");

  public ProgressPage(WebDriver driver, int timeoutSeconds) {
    super(driver, timeoutSeconds);
  }

  public ProgressPage open(String baseUrl) {
    driver.get(baseUrl + "/progress");
    waitVisible(HEADING);
    return this;
  }

  public int countMasteryBars() {
    return waitAllVisible(MASTERY_BARS).size();
  }
}
