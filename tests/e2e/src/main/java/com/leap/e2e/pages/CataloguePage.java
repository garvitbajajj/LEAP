package com.leap.e2e.pages;

import java.util.List;
import org.openqa.selenium.By;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.support.ui.Select;

public class CataloguePage extends BasePage {
  public static final By SEARCH_INPUT = By.cssSelector("input[aria-label='Search']");
  public static final By TYPE_SELECT = By.cssSelector("select[aria-label='Type']");
  public static final By CARD_TITLES = By.cssSelector(".card.rec h3 a");

  public CataloguePage(WebDriver driver, int timeoutSeconds) {
    super(driver, timeoutSeconds);
  }

  public CataloguePage open(String baseUrl) {
    driver.get(baseUrl + "/catalogue");
    waitAllVisible(CARD_TITLES);
    return this;
  }

  public void search(String query) {
    type(SEARCH_INPUT, query);
    waitUrlContains("q=" + query);
    waitAllVisible(CARD_TITLES);
  }

  public void filterByType(String typeValue) {
    Select select = new Select(waitVisible(TYPE_SELECT));
    select.selectByValue(typeValue);
    waitUrlContains("type=" + typeValue);
    waitAllVisible(CARD_TITLES);
  }

  public void openItemByIndex(int index) {
    List<WebElement> titles = waitAllVisible(CARD_TITLES);
    titles.get(index).click();
  }

  public List<String> getResultTitles() {
    return waitAllVisible(CARD_TITLES).stream().map(WebElement::getText).toList();
  }
}
