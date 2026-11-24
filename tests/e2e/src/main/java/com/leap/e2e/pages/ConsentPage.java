package com.leap.e2e.pages;

import org.openqa.selenium.By;
import org.openqa.selenium.WebDriver;

public class ConsentPage extends BasePage {
  public static final By HEADING = By.tagName("h1");
  public static final By AGREE_BUTTON = By.xpath("//button[contains(.,'I agree')]");

  public ConsentPage(WebDriver driver, int timeoutSeconds) {
    super(driver, timeoutSeconds);
  }

  public void acceptConsent() {
    waitVisible(HEADING);
    click(AGREE_BUTTON);
  }
}
