package com.leap.e2e.pages;

import java.time.Duration;
import java.util.List;
import org.openqa.selenium.By;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.support.ui.ExpectedConditions;
import org.openqa.selenium.support.ui.WebDriverWait;

/**
 * Shared base for all Page Objects. Uses explicit WebDriverWait only (no Thread.sleep).
 */
public abstract class BasePage {
  protected final WebDriver driver;
  protected final WebDriverWait wait;

  protected BasePage(WebDriver driver, int timeoutSeconds) {
    this.driver = driver;
    this.wait = new WebDriverWait(driver, Duration.ofSeconds(timeoutSeconds));
  }

  protected WebElement waitVisible(By locator) {
    return wait.until(ExpectedConditions.visibilityOfElementLocated(locator));
  }

  protected List<WebElement> waitAllVisible(By locator) {
    return wait.until(ExpectedConditions.visibilityOfAllElementsLocatedBy(locator));
  }

  protected WebElement waitClickable(By locator) {
    return wait.until(ExpectedConditions.elementToBeClickable(locator));
  }

  protected void click(By locator) {
    waitClickable(locator).click();
  }

  protected void type(By locator, String text) {
    WebElement el = waitVisible(locator);
    el.clear();
    el.sendKeys(text);
  }

  protected String textOf(By locator) {
    return waitVisible(locator).getText();
  }

  public void waitUrlContains(String fragment) {
    wait.until(ExpectedConditions.urlContains(fragment));
  }
}
