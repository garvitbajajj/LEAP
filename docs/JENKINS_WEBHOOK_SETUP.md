# Jenkins Multibranch Pipeline — Setup Guide

> **Owner:** Abhishek Vijay Kakde · V3 Recommendations & Feed  
> **Covers:** Items 3.6.1–3.6.5 in `docs/CHECKLIST.md`

---

## 1. Prerequisites

| Requirement | Version / Notes |
|---|---|
| Jenkins | 2.440 LTS or newer |
| Java | 17+ (required by Jenkins) |
| Docker | 24+ on the Jenkins agent |
| Node.js tool | `node20` configured in Manage Jenkins → Tools |
| Git / GitHub | Access to `garvitbajajj/LEAP` |

---

## 2. Jenkins Plugins to Install

Go to **Manage Jenkins → Plugins → Available** and install:

| Plugin | Purpose |
|---|---|
| **Pipeline Multibranch** | Discovers and builds all branches automatically |
| **GitHub Branch Source** | Connects multibranch to GitHub and receives webhooks |
| **NodeJS** | Provides the `node20` tool used in the pipeline |
| **JUnit** | Publishes test XML results |
| **HTML Publisher** | Publishes coverage HTML reports |
| **SonarQube Scanner** *(optional)* | Static analysis and quality gate |
| **Docker Pipeline** | Enables `docker build/push` in a declarative pipeline |

---

## 3. Configure Jenkins Credentials

Go to **Manage Jenkins → Credentials → System → Global credentials → Add Credential**:

| Credential ID | Type | Value |
|---|---|---|
| `dockerhub` | Username/Password | Docker Hub username + Personal Access Token |
| `sonar-token` *(optional)* | Secret text | SonarQube project token |

---

## 4. Configure the NodeJS Tool

**Manage Jenkins → Tools → NodeJS installations → Add NodeJS**

- **Name:** `node20`
- **Version:** `NodeJS 20.x LTS`
- Tick **Install automatically**

---

## 5. Create the Multibranch Pipeline Job

1. **New Item** → Enter name `LEAP` → Select **Multibranch Pipeline** → OK.
2. Under **Branch Sources**, click **Add source → GitHub**:
   - **Credentials:** Add a GitHub Personal Access Token credential with `repo` scope.
   - **Repository HTTPS URL:** `https://github.com/garvitbajajj/LEAP.git`
3. Under **Build Configuration**:
   - **Mode:** `by Jenkinsfile`
   - **Script Path:** `Jenkinsfile.multibranch`
4. Under **Scan Multibranch Pipeline Triggers**:
   - Tick **Periodically if not otherwise run** → Interval: `1 minute` (fallback if webhook fails).
5. Click **Save** then **Scan Multibranch Pipeline Now**.

Jenkins will now discover `main`, `develop`, and all `feature/*` branches.

---

## 6. GitHub Webhook Setup

> This enables automatic builds triggered immediately on every `git push` or PR.

### 6a. Get Your Jenkins URL
Your Jenkins must be reachable from GitHub. If running locally, use **ngrok** to expose it:

```bash
ngrok http 8080
# Copy the https://xxxx.ngrok.io URL
```

### 6b. Add the Webhook on GitHub

1. Go to `https://github.com/garvitbajajj/LEAP/settings/hooks`
2. Click **Add webhook**
3. Set:
   - **Payload URL:** `https://<JENKINS_URL>/github-webhook/`
   - **Content type:** `application/json`
   - **Which events?** → Select **Just the push event** + **Pull requests**
4. Click **Add webhook**

### 6c. Verify in Jenkins

After pushing any commit, go to your LEAP job → **Scan Multibranch Pipeline Log**. You should see the branch detected and a build triggered automatically.

---

## 7. Pipeline Branch Behaviour

| Branch | Stages Run | Notes |
|---|---|---|
| `feature/*` | Checkout → Install → Lint → Test → Build → SonarQube (non-blocking) | Full CI on every push; SonarQube failures are warnings only |
| `develop` | Above + SonarQube Quality Gate (blocking) → Docker build | Build fails if quality gate is not met |
| `main` | All stages + Push → **Manual Approval Gate** → Deploy | Requires a team lead to click **Proceed** in Jenkins UI |

---

## 8. Manual Approval Gate (main branch)

When a build reaches the **Approval Gate** stage on `main`, Jenkins parks the build and sends a notification. The build appears as **Paused** in the UI.

**To approve:**
1. Open the LEAP build in Jenkins.
2. Click the **Approval Gate** stage → **Proceed with Deploy**.
3. Choose the **target environment** (`production` / `staging`) and whether to run the seed job.
4. Click **Proceed**.

**To abort:**
- Click **Abort** to cancel without deploying.
- The build auto-aborts after **24 hours** if nobody acts.

---

## 9. Test & Coverage Reports in Jenkins

After each build, Jenkins publishes:

| Report | Location in Jenkins UI |
|---|---|
| Server Jest JUnit | Build → **Test Result** |
| ML pytest JUnit | Build → **Test Result** |
| Client Vitest JUnit | Build → **Test Result** |
| Server Coverage HTML | Build → **Server Coverage** (sidebar link) |
| ML Coverage HTML | Build → **ML Coverage** (sidebar link) |

---

## 10. Expected Green Build Checklist (for lab screenshots)

- [ ] `main` branch build shows all 11 stages green
- [ ] **Test Result** page shows 27+ tests passing with 0 failures
- [ ] **ML Coverage** shows ≥ 80% line coverage
- [ ] **Approval Gate** stage shows the "Paused for input" UI
- [ ] A `git push` to a `feature/*` branch triggers a build automatically (via webhook)
- [ ] `main` push triggers a full pipeline through to the approval gate
