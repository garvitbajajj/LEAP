package com.leap.e2e.pages;

import java.util.List;
import org.openqa.selenium.By;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;

public class ItemPage extends BasePage {
  public static final By HEADING = By.tagName("h1");
  public static final By COMPLETE_BUTTON = By.xpath("//button[contains(.,'Mark as complete')]");
  public static final By QUIZ_QUESTIONS = By.cssSelector("fieldset");
  public static final By SUBMIT_QUIZ_BUTTON = By.xpath("//button[contains(.,'Submit answers')]");
  public static final By COMPLETION_BANNER = By.cssSelector(".banner");

  public ItemPage(WebDriver driver, int timeoutSeconds) {
    super(driver, timeoutSeconds);
  }

  public void waitLoaded() {
    waitVisible(HEADING);
  }

  public void markComplete() {
    waitLoaded();
    click(COMPLETE_BUTTON);
    waitVisible(COMPLETION_BANNER);
  }

  public String answerAllQuestionsAndSubmit() {
    waitLoaded();
    List<WebElement> questions = waitAllVisible(QUIZ_QUESTIONS);
    for (WebElement q : questions) {
      q.findElement(By.cssSelector("input[type='radio']")).click();
    }
    click(SUBMIT_QUIZ_BUTTON);
    return textOf(COMPLETION_BANNER);
  }
}
