# LEAP — Full-Marks Task List per Member

Capstone II (CS 4191) · Team 35 · 60 marks total. Every remaining mark has one owner below.
Tick items as you finish them. Code for each item lives in your own vertical. See
[`DEFERRED.md`](DEFERRED.md) for the exact files.

---

## Where the 60 marks stand

| Component | Marks | Status | Owner |
|---|---:|---|---|
| SRS + SDD + PPT (Project Evaluation I) | 10 | ✅ Done | All |
| Swagger authentication — Basic, Bearer, JWT, API Key, OAuth | 10 | 🟡 4 of 5 fully working | Garvit |
| Lab exercises 1–10: execution | 5 | ⬜ | **Everyone, individually** |
| Lab exercises 1–10: explanation | 5 | ⬜ | **Everyone, individually** |
| Lab file | 5 | ⬜ | **Everyone, individually** |
| Presentation (working prototype) | 10 | 🟡 Prototype ready | All |
| Project report | 5 | ⬜ | Garvit compiles, all write |
| JIRA | 3 | 🟡 Epics only | Garvit sets up, all active |
| Git / GitHub | 3 | 🟡 One contributor so far | All |
| Docker | 3 | 🟡 Files written, never built | Garvit + Taher |
| Jenkins | 3 | 🟡 Jenkinsfile only, never run | Abhishek |
| Testing (unit + Selenium) | 3 | 🟡 65 unit tests, no Selenium | Dhruvika + all |

> **Why the lab rows say "individually":** the lab file template's cover page has a single
> *Submitted By / Enrolment / Name*, so each of us submits our own. The owner of a practical
> builds it on LEAP first; everyone else then runs it themselves and writes it up in their own lab file.

---

## Rules for everyone (Git 3 + JIRA 3)

These are cheap marks, and they're lost if only one person shows up in the history.

- [ ] Accept the Jira invite to https://leapcap.atlassian.net and get assigned your epic
- [ ] For **each** task below, create a Jira story under your epic, assign it to yourself, and move it To Do → In Progress → Done as you work
- [ ] Work on a **feature branch** per task: `<initials>/<short-name>`, e.g. `db/selenium-suite`
- [ ] Put the Jira key in every commit message, e.g. `feat(e2e): add login scenario (KAN-12)`
- [ ] Commit **small and often**: aim for 10+ commits of your own
- [ ] Open a **pull request** for every branch and get one approval from another member before merging. Review at least two of your teammates' PRs.
- [ ] Never commit straight to `main`

---

## Garvit Bajaj — V1 Identity, Access & Platform · Epic KAN-4

**Code (finishes the Swagger auth item, 10 marks)**
- [ ] Google OAuth 2.0 token exchange in `/auth/google/callback`: create a Google Cloud OAuth client, exchange the code, create or link the user, issue the JWT
- [ ] Refresh-token rotation: 15-minute access token plus an HttpOnly refresh cookie, rotated on use, reuse detection
- [ ] Password reset by email: single-use, hashed, time-limited token
- [ ] Test all five schemes again from the Swagger **Authorize** dialog and screenshot each one

**DevOps (Docker 3)**
- [ ] Start Docker Desktop, run `docker compose up --build`, and fix anything that breaks
- [ ] Push the three images to Docker Hub
- [ ] **Cloud deployment**: deploy the stack to a cloud VM (AWS EC2, Azure or GCP free tier) and share a live URL
- [ ] **Practical 16 (Ansible)**: write a playbook that installs Docker on that VM and deploys LEAP. This covers cloud deployment and the Ansible practical in one go.

**GitHub and Jira admin**
- [ ] Invite Dhruvika and Abhishek to Jira; assign KAN-5 to Dhruvika and KAN-6 to Abhishek
- [ ] Delete the sample issues KAN-1, KAN-2 and KAN-3
- [ ] Turn on branch protection for `main`: require a PR, one approval and passing CI
- [ ] Add a `CODEOWNERS` file mapping each folder to its vertical owner

**Practicals you build first:** 1 JWT · 2 Google OAuth · 3 OAuth access control · 4 OpenAPI · 9 Jira · 16 Ansible

**Report:** introduction, architecture, and the authentication and security chapter. You also **compile the full report** and upload it to Moodle.

**Presentation:** login, the five auth schemes in Swagger, the deployed URL.

---

## Dhruvika Bansal — V2 Catalogue & Discovery · Epic KAN-5

**Code (Testing 3)**
- [ ] **Selenium suite in Java with Maven and JUnit** (`tests/e2e/`). This one task covers **practicals 12, 13 and 14**. It's the cleanest way to close the Java/Maven gap.
  - [ ] Page Object Model, explicit waits only, headless Chrome
  - [ ] Scenarios: register → consent → onboarding · feed shows a reason · search catalogue · complete a lesson and the path advances · quiz updates mastery · "Not for me" removes a card · learner blocked from `/admin`
  - [ ] Screenshot on failure, plus a JUnit XML report for Jenkins
- [ ] **HTTPS on Nginx**: self-signed certificate script, TLS 1.2+, HTTP → HTTPS redirect (`client/nginx.conf`)
- [ ] **Postman collection** covering every endpoint, with an environment file, an auto-login pre-request script and tests; run it with `newman` in CI
- [ ] Bulk CSV import with a dry-run preview

**Practicals you build first:** 12 Selenium · 13 Maven · 14 unit tests (Java half)

**Report:** catalogue and discovery chapter, and the testing chapter (Selenium + Postman).

**Presentation:** catalogue search, the content manager rejecting a prerequisite cycle, a live Selenium run.

---

## Abhishek Vijay Kakde — V3 Recommendations & Feed · Epic KAN-6

**Code (Jenkins 3)**
- [ ] **Run Jenkins**: start it in Docker, install the plugins, add credentials, point it at the GitHub repo
- [ ] Get the existing `Jenkinsfile` running green end to end, and screenshot each stage
- [ ] **GitHub webhook → Jenkins** so every push triggers a build automatically
- [ ] **`Jenkinsfile.multibranch`**: tests on every branch and PR, deploy only from `main`, a manual approval gate before production
- [ ] ALS matrix-factorisation collaborative filtering, replacing item-item CF in `ml/app/model.py`
- [ ] Redis caching of the feed, invalidated when the profile changes

**Practicals you build first:** 10 Jenkins jobs · 11 Jenkins multibranch · 14 unit tests (Python half: the existing pytest suite)

**Report:** the recommendation algorithm chapter: hybrid formula, cold start, MMR, explanations.

**Presentation:** the feed, "Why this?" with its factors, the ML service going down and the feed falling back, a Jenkins build triggered by a push.

---

## Taher Mohammed Husain Aurangabadi — V4 Path, Mastery & Analytics · Epic KAN-7

**Code (Docker 3)**
- [ ] **Docker Swarm**: `docker-stack.yml` with replicas, rolling updates and resource limits, plus a scaling demo
- [ ] **Kubernetes**: Deployments, StatefulSet for MongoDB with a volume, Services, Ingress, HPA, probes. Deploy on minikube (already installed on Garvit's machine) or a live cluster.
- [ ] **Prometheus + Grafana**: scrape `/metrics` from the server and ML service, add three alert rules and a dashboard
- [ ] **Webhooks**: inbound GitHub webhook with HMAC signature check; outbound webhook when a learner completes a path
- [ ] **Evaluation harness**: Precision@K, Recall@K and NDCG@K against popularity and content-only baselines, with a results table and charts for the report

**Practicals you build first:** 5 Docker Swarm · 6 Kubernetes cluster · 7/8 Kubernetes network, volumes and pods · 15 Prometheus + Grafana

**Report:** learning path and mastery (BKT) chapter, and the **results chapter** using your evaluation numbers.

**Presentation:** the path unlocking after a completion, the mastery dashboard, Grafana live, a pod being scaled.

---

## Everyone — lab file and exercises (15 marks, individual)

For **each** of practicals 1–10, in your own lab file:

- [ ] Run it yourself on LEAP, even if someone else built it
- [ ] Write: aim · tools used · steps · screenshots · output · conclusion
- [ ] Be ready to **explain** it live (5 of the 15 marks are for explanation)
- [ ] Fill in your own name and enrolment number on the cover page

| # | Practical | Built first by | Status |
|---|---|---|---|
| 1 | JWT session management | Garvit | ✅ built |
| 2 | Google OAuth 2.0 login | Garvit | 🟡 redirect built, token exchange left |
| 3 | OAuth / API access control | Garvit | ✅ built (RBAC + 5 schemes) |
| 4 | OpenAPI documentation | Garvit | ✅ built (Swagger) |
| 5 | Docker Swarm | Taher | ⬜ |
| 6 | Live Kubernetes cluster | Taher | ⬜ |
| 7 / 8 | K8s network, volumes, pods | Taher | ⬜ |
| 9 | Jira sprints and workflows | Garvit (all use it) | 🟡 epics only |
| 10 | Jenkins build and deploy jobs | Abhishek | 🟡 Jenkinsfile written |
| 11 | Jenkins multibranch pipeline | Abhishek | ⬜ |
| 12 | Selenium browser automation | Dhruvika | ⬜ |
| 13 | Maven Java build | Dhruvika | ⬜ |
| 14 | Unit tests in Java and Python | Dhruvika (Java) · Abhishek (Python) | 🟡 Python done (65 tests) |
| 15 | Prometheus + Grafana *(extra)* | Taher | 🟡 `/metrics` endpoints exist |
| 16 | Ansible *(extra)* | Garvit | ⬜ |

---

## Final week — together

- [ ] Run the full Selenium suite and the Jenkins pipeline green, and screenshot both
- [ ] Rehearse the presentation twice, with each member demoing their own vertical
- [ ] Record a backup video of the demo in case the live one fails
- [ ] Every member can explain the whole architecture, not just their own part
- [ ] Report printed **and** uploaded to Moodle
