package com.leap.e2e;

import java.time.Duration;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.chrome.ChromeDriver;
import org.openqa.selenium.chrome.ChromeOptions;

public final class DriverFactory {

  private DriverFactory() {}

  public static WebDriver createChrome() {
    ChromeOptions options = new ChromeOptions();
    options.setAcceptInsecureCerts(true);
    if (E2EConfig.isHeadless()) {
      options.addArguments("--headless=new");
    }
    options.addArguments(
        "--no-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--disable-software-rasterizer",
        "--disable-features=VizDisplayCompositor",
        "--disable-extensions",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-search-engine-choice-screen",
        "--window-size=1440,900",
        "--ignore-certificate-errors"
    );
    WebDriver driver = new ChromeDriver(options);
    driver.manage().timeouts().implicitlyWait(Duration.ZERO);
    driver.manage().timeouts().pageLoadTimeout(Duration.ofSeconds(30));
    driver.manage().timeouts().scriptTimeout(Duration.ofSeconds(30));
    return driver;
  }
}
