package com.leap.e2e;

/**
 * Runtime configuration for the E2E suite, driven by Maven -D system properties
 * or environment variables.
 */
public final class E2EConfig {

  private E2EConfig() {}

  public static String baseUrl() {
    String raw = System.getProperty("leap.baseUrl");
    if (raw == null || raw.isBlank()) {
      raw = System.getenv("LEAP_BASE_URL");
    }
    if (raw == null || raw.isBlank()) {
      raw = "http://localhost:5173";
    }
    return normalizeUrl(raw);
  }

  public static String normalizeUrl(String raw) {
    String trimmed = raw == null ? "" : raw.trim();
    while (trimmed.endsWith("/")) {
      trimmed = trimmed.substring(0, trimmed.length() - 1);
    }
    return trimmed;
  }

  public static boolean isHeadless() {
    String raw = System.getProperty("leap.headless");
    if (raw == null || raw.isBlank()) {
      raw = System.getenv("LEAP_HEADLESS");
    }
    return raw == null || raw.isBlank() || Boolean.parseBoolean(raw);
  }

  public static int timeoutSeconds() {
    String raw = System.getProperty("leap.timeoutSec");
    if (raw == null || raw.isBlank()) {
      return 15;
    }
    int parsed = Integer.parseInt(raw.trim());
    if (parsed <= 0) {
      throw new IllegalArgumentException("leap.timeoutSec must be positive");
    }
    return parsed;
  }

  public static String uniqueEmail(String prefix) {
    String clean = (prefix == null || prefix.isBlank()) ? "e2e" : prefix.replaceAll("[^a-zA-Z0-9]", "");
    return clean.toLowerCase() + "." + System.currentTimeMillis() + "@leap.dev";
  }
}
