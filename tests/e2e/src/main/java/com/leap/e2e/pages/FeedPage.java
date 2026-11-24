package com.leap.e2e.pages;

import java.util.List;
import org.openqa.selenium.By;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.support.ui.ExpectedConditions;

public class FeedPage extends BasePage {
  public static final By HEADING = By.tagName("h1");
  public static final By REC_CARDS = By.cssSelector(".card.rec");
  public static final By WHY_BOXES = By.cssSelector(".card.rec .why");
  public static final By FIRST_CARD_TITLE = By.cssSelector(".card.rec h3 a");
  public static final By FIRST_NOT_FOR_ME = By.xpath("(//div[contains(@class,'rec')]//button[contains(.,'Not for me')])[1]");
  public static final By TOAST = By.cssSelector(".toast[role='status']");

  public FeedPage(WebDriver driver, int timeoutSeconds) {
    super(driver, timeoutSeconds);
  }

  public String waitLoadedAndGetHeading() {
    wait.until(ExpectedConditions.textToBePresentInElementLocated(HEADING, "Recommended for you"));
    waitAllVisible(REC_CARDS);
    return textOf(HEADING);
  }

  public List<String> getAllReasons() {
    return waitAllVisible(WHY_BOXES).stream().map(WebElement::getText).toList();
  }

  public String getFirstCardTitle() {
    return textOf(FIRST_CARD_TITLE);
  }

  public String rejectFirstRecommendation() {
    String removedTitle = getFirstCardTitle();
    click(FIRST_NOT_FOR_ME);
    waitVisible(TOAST);
    wait.until(d -> d.findElements(FIRST_CARD_TITLE).stream().noneMatch(e -> e.getText().equals(removedTitle)));
    return removedTitle;
  }

  public List<String> getVisibleCardTitles() {
    return driver.findElements(FIRST_CARD_TITLE).stream().map(WebElement::getText).toList();
  }
}
