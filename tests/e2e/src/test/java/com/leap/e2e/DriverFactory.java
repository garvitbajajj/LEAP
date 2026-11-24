package com.leap.e2e;

import java.time.Duration;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.chrome.ChromeDriver;
import org.openqa.selenium.chrome.ChromeOptions;

public final class DriverFactory {

  private DriverFactory() {}

  public static WebDriver createChrome() {
    ChromeOptions options = new ChromeOptions();
    if (E2EConfig.isHeadless()) {
      options.addArguments("--headless=new");
    }
    options.addArguments(
        "--no-sandbox",
        "--disable-dev-shm-usage",
        "--window-size=1440,900",
        "--ignore-certificate-errors"
    );
    WebDriver driver = new ChromeDriver(options);
    driver.manage().timeouts().implicitlyWait(Duration.ZERO);
    driver.manage().timeouts().pageLoadTimeout(Duration.ofSeconds(30));
    return driver;
  }
}
