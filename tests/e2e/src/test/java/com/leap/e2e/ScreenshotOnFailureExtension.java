package com.leap.e2e;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.function.Supplier;
import org.junit.jupiter.api.extension.ExtensionContext;
import org.junit.jupiter.api.extension.TestWatcher;
import org.openqa.selenium.OutputType;
import org.openqa.selenium.TakesScreenshot;
import org.openqa.selenium.WebDriver;

/**
 * Captures a PNG screenshot to target/screenshots/ whenever an E2E test fails.
 */
public class ScreenshotOnFailureExtension implements TestWatcher {
  private final Supplier<WebDriver> driverSupplier;

  public ScreenshotOnFailureExtension(Supplier<WebDriver> driverSupplier) {
    this.driverSupplier = driverSupplier;
  }

  @Override
  public void testFailed(ExtensionContext context, Throwable cause) {
    WebDriver driver = driverSupplier.get();
    if (!(driver instanceof TakesScreenshot shooter)) {
      return;
    }
    try {
      Path dir = Paths.get("target", "screenshots");
      Files.createDirectories(dir);
      String safeName = context.getDisplayName().replaceAll("[^a-zA-Z0-9._-]", "_");
      Path out = dir.resolve(safeName + ".png");
      Files.write(out, shooter.getScreenshotAs(OutputType.BYTES));
    } catch (Exception ignored) {
      // Do not mask the original test failure if screenshot capture fails.
    }
  }
}
