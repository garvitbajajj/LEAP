# LEAP Selenium E2E Suite (Java + Maven + JUnit 5)

Covers Practicals **12 (Selenium)**, **13 (Maven)**, and **14 (Java unit tests)** using the Page Object Model, explicit `WebDriverWait` assertions (zero `Thread.sleep`), headless Chrome, and automatic screenshot capture on failure.

## Commands

```bash
# 1. Run pure Java unit tests only (no browser/server needed) -> target/surefire-reports/*.xml
mvn -f tests/e2e/pom.xml test

# 2. Run all 7 Selenium E2E scenarios against a running LEAP stack -> target/failsafe-reports/*.xml
mvn -f tests/e2e/pom.xml verify -Dleap.baseUrl=http://localhost:5173

# 3. Run in visible Chrome (demo mode) or against HTTPS Nginx (:8443)
mvn -f tests/e2e/pom.xml verify -Dleap.baseUrl=https://localhost:8443 -Dleap.headless=false
```

## Scenarios (`LeapE2EScenariosIT`)
1. Register → consent → 4-step onboarding
2. Feed displays `"Why this?"` explanations
3. Catalogue search updates URL query and filters items
4. Completing a lesson advances the learning path
5. Submitting a quiz updates skill mastery on `/progress`
6. Clicking `"Not for me"` removes the recommendation card
7. Learner is blocked from `/admin` and redirected to `/`
