package com.leap.e2e.pages;

import org.openqa.selenium.By;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.support.ui.ExpectedConditions;

public class LoginPage extends BasePage {
  public static final By WELCOME_SIGN_IN_BTN = By.xpath("//button[contains(.,'Sign in')]");
  public static final By NAME_INPUT = By.id("name");
  public static final By EMAIL_INPUT = By.id("email");
  public static final By PASSWORD_INPUT = By.id("password");
  public static final By SUBMIT_BUTTON = By.cssSelector("button[type='submit']");
  public static final By CREATE_ACCOUNT_TOGGLE = By.xpath("//button[contains(.,'Create an account')]");
  public static final By DEMO_LEARNER_BTN = By.xpath("//div[contains(@class,'demo-accounts')]//button[normalize-space()='Learner']");

  public LoginPage(WebDriver driver, int timeoutSeconds) {
    super(driver, timeoutSeconds);
  }

  public LoginPage open(String baseUrl) {
    driver.get(baseUrl);
    wait.until(ExpectedConditions.or(
        ExpectedConditions.visibilityOfElementLocated(EMAIL_INPUT),
        ExpectedConditions.visibilityOfElementLocated(WELCOME_SIGN_IN_BTN)
    ));
    if (driver.findElements(EMAIL_INPUT).isEmpty()) {
      click(WELCOME_SIGN_IN_BTN);
      waitVisible(EMAIL_INPUT);
    }
    return this;
  }

  public void loginWith(String email, String password) {
    type(EMAIL_INPUT, email);
    type(PASSWORD_INPUT, password);
    click(SUBMIT_BUTTON);
  }

  public void loginAsDemoLearner() {
    click(DEMO_LEARNER_BTN);
    click(SUBMIT_BUTTON);
  }

  public void register(String name, String email, String password) {
    click(CREATE_ACCOUNT_TOGGLE);
    type(NAME_INPUT, name);
    type(EMAIL_INPUT, email);
    type(PASSWORD_INPUT, password);
    click(SUBMIT_BUTTON);
  }
}
