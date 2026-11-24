# LEAP — Full-Marks Checklist

**Capstone II (CS 4191) · Team 35 · NIIT University · AY 2026-27**
Course in charge: Prof. Manish Hurkat · Jira: https://leapcap.atlassian.net

Derived from *Capstone II Lab File Student.docx* (evaluation criteria + 16 practicals)
and the faculty presentation email. **Total: 60 marks.**


> **Owner model:** work is split into four **feature verticals**, not roles. Each member writes
> frontend, backend, ML and DevOps inside their own vertical:
> **V1 Garvit** identity & platform · **V2 Dhruvika** catalogue & discovery ·
> **V3 Abhishek** recommendations & feed · **V4 Taher** path, mastery & analytics.
> Jira epics: [KAN-4](https://leapcap.atlassian.net/browse/KAN-4) · [KAN-5](https://leapcap.atlassian.net/browse/KAN-5) · [KAN-6](https://leapcap.atlassian.net/browse/KAN-6) · [KAN-7](https://leapcap.atlassian.net/browse/KAN-7)

---

## Scoreboard

| Component | Marks | Status |
|---|---:|---|
| Project Evaluation I | 10 | ✅ done |
| Lab Assignment | 20 | ⬜ not started |
| Project Evaluation II | 30 | 🟡 in progress |
| **Total** | **60** | |

---

## 1. Project Evaluation I — 10 marks ✅

| # | Item | Marks | Owner | Status |
|---|---|---:|---|---|
| 1.1 | SRS document | 3 | All | ✅ `SRS_ELearning_Recommendation_System.docx` |
| 1.2 | SDD document | 3 | All | ✅ `SDD_ELearning_Recommendation_System.docx` |
| 1.3 | PPT | 4 | All | ✅ `Capstone_PPT_ELearning_Recommendation_System.pptx` |

> ⚠️ The faculty email says "No PPT required" **for the Project Evaluation II presentation**.
> The PPT is still worth **4 marks** under Project Evaluation I. Keep it. Do not delete it.

---

## 2. Lab Assignment — 20 marks ⬜

### 2.1 Swagger Authentication — 10 marks 🔴 BIGGEST SINGLE ITEM
All five schemes must be declared in the OpenAPI doc, each protecting a real working
endpoint, all usable from the Swagger UI **Authorize** dialog.

| # | Scheme | Demo endpoint | Owner | Status |
|---|---|---|---|---|
| 2.1.1 | Basic | `POST /api/v1/admin/bootstrap` | Garvit | ⬜ |
| 2.1.2 | Bearer (opaque) | `GET /api/v1/internal/status` | Garvit | ⬜ |
| 2.1.3 | JWT | all learner/instructor routes | Garvit | ⬜ |
| 2.1.4 | API Key | `X-API-Key`, server ↔ ML | Garvit | ⬜ |
| 2.1.5 | OAuth 2.0 | `GET /api/v1/auth/google` | Garvit | ⬜ |
| 2.1.6 | `docs/AUTH_SCHEMES.md` with a curl example per scheme | | Garvit | ⬜ |

### 2.2 Exercises 1–10 — Execution 5 + Explanation 5

| # | Practical | CO | Owner | Status |
|---|---|---|---|---|
| 2.2.1 | JWT session management + secure token transmission | CO2 | Garvit | ⬜ |
| 2.2.2 | Google OAuth 2.0 login | CO2 | Garvit | ⬜ |
| 2.2.3 | Access control + secure API authorization | CO5 | Garvit | ⬜ |
| 2.2.4 | RESTful API docs via OpenAPI | CO5 | Garvit | ⬜ |
| 2.2.5 | Docker Swarm multi-node cluster + scaling | CO5 | Taher | ⬜ |
| 2.2.6 | Deploy on a live Kubernetes cluster | CO5 | Taher | ⬜ |
| 2.2.7 | K8s network, volume, pods for microservices | CO5 | Taher | ⬜ |
| 2.2.8 | (repeat of 7 in the lab file) | CO1 | Taher | ⬜ |
| 2.2.9 | Jira sprint backlogs, workflows, milestones | CO4 | Garvit | 🟡 site exists |
| 2.2.10 | Jenkins automated build + deployment jobs | CO6 | Abhishek | ⬜ |
| 2.2.11 | Jenkins multibranch pipelines | CO3 | Abhishek | ⬜ |
| 2.2.12 | Selenium end-to-end browser automation | CO3 | Dhruvika | ⬜ |
| 2.2.13 | Maven — Java build, dependencies, packaging | CO3 | Dhruvika | ⬜ |
| 2.2.14 | Unit tests across Java **and** Python | CO6 | Abhishek | ⬜ |
| 2.2.15 | *(extra)* Prometheus + Grafana | CO5 | Taher | ⬜ |
| 2.2.16 | *(extra)* Ansible server config | CO5 | Taher | ⬜ |

> ⚠️ Practicals 13–14 need **Java + Maven**. Our stack is MERN + Python, so these two need a
> small standalone Java module (or lab-only exercise) — plan for it, it is easy to forget.

### 2.3 Lab File — 5 marks

| # | Item | Owner | Status |
|---|---|---|---|
| 2.3.1 | Fill cover page: enrolment numbers + names | Garvit | ⬜ |
| 2.3.2 | Write-up per practical: aim, steps, screenshots, output, conclusion | All | ⬜ |
| 2.3.3 | Print + submit physically | Garvit | ⬜ |

---

## 3. Project Evaluation II — 30 marks 🟡

### 3.1 Presentation — 10 marks
| # | Item | Owner | Status |
|---|---|---|---|
| 3.1.1 | **Working prototype** demo (no PPT needed) | All | ⬜ |
| 3.1.2 | Demo script: register → onboard → feed → player → path → mastery | Abhishek | ⬜ |
| 3.1.3 | Seeded demo data that always works offline | Garvit | ⬜ |
| 3.1.4 | Each member can explain the **whole** architecture, not just their slice | All | ⬜ |
| 3.1.5 | Fallback plan if live demo breaks (recorded video) | Garvit | ⬜ |

### 3.2 Project Report — 5 marks
| # | Item | Owner | Status |
|---|---|---|---|
| 3.2.1 | Use the shared format (already circulated) | All | ⬜ |
| 3.2.2 | Include ML evaluation table + charts from `ml/eval/` | Taher | ⬜ |
| 3.2.3 | Submit physical copy **and** upload to Moodle | Garvit | ⬜ |

### 3.3 JIRA — 3 marks
| # | Item | Owner | Status |
|---|---|---|---|
| 3.3.1 | 4 epics (one per slice) + stories with points | Garvit | ⬜ |
| 3.3.2 | 5 sprints created, backlog groomed | Garvit | ⬜ |
| 3.3.3 | All 4 members active — assigned + transitioning issues | All | ⬜ |
| 3.3.4 | Burndown / velocity charts populated | Garvit | ⬜ |
| 3.3.5 | Jira ↔ GitHub linked (commits reference issue keys) | Garvit | ⬜ |

### 3.4 Git / GitHub — 3 marks
| # | Item | Owner | Status |
|---|---|---|---|
| 3.4.1 | Monorepo pushed, all 4 members committing | All | ⬜ |
| 3.4.2 | Feature branches + PRs (no direct commits to `main`) | All | ⬜ |
| 3.4.3 | Branch protection + CODEOWNERS | Garvit | ⬜ |
| 3.4.4 | PR/issue templates, meaningful commit messages | Garvit | ⬜ |
| 3.4.5 | GitHub Actions running lint + tests on PRs | Garvit | ⬜ |
| 3.4.6 | Tags/releases for milestones | Garvit | ⬜ |

### 3.5 Docker — 3 marks
| # | Item | Owner | Status |
|---|---|---|---|
| 3.5.1 | Multi-stage Dockerfile per service, non-root, healthcheck | Garvit | ⬜ |
| 3.5.2 | `docker-compose.yml` for the full stack | Garvit | ⬜ |
| 3.5.3 | Docker Swarm `docker-stack.yml` + scaling demo | Taher | ⬜ |
| 3.5.4 | Kubernetes manifests + Ingress + HPA + probes | Taher | ⬜ |
| 3.5.5 | Images pushed to a registry | Taher | ⬜ |

### 3.6 Jenkins — 3 marks
| # | Item | Owner | Status |
|---|---|---|---|
| 3.6.1 | Declarative `Jenkinsfile`: checkout→lint→test→build→scan→push→deploy | Abhishek | ⬜ |
| 3.6.2 | `Jenkinsfile.multibranch` with branch-conditional behaviour | Abhishek | ⬜ |
| 3.6.3 | Test + coverage reports published in Jenkins | Abhishek | ⬜ |
| 3.6.4 | GitHub webhook triggering builds automatically | Abhishek | ⬜ |
| 3.6.5 | Green build screenshots for the lab file | Abhishek | ⬜ |

### 3.7 Testing — 3 marks
| # | Item | Owner | Status |
|---|---|---|---|
| 3.7.1 | Jest + supertest — auth, RBAC, lockout, webhooks | Garvit | ⬜ |
| 3.7.2 | Jest — DAG cycles, topological order, events, sequencer, mastery | Taher | ⬜ |
| 3.7.3 | pytest — decay, blend, MMR, cold start, explanation determinism | Abhishek | ⬜ |
| 3.7.4 | Vitest + RTL — guards, refresh queue, event tracker | Dhruvika | ⬜ |
| 3.7.5 | **Selenium** suite, Page Object Model, 7 scenarios | Dhruvika | ⬜ |
| 3.7.6 | Coverage reports ≥ 80% on owned code | All | ⬜ |

---

## 4. Additional tools from the faculty email

| # | Item | Owner | Status |
|---|---|---|---|
| 4.1 | **Swagger** — covered by 2.1 | Garvit | ⬜ |
| 4.2 | **Postman** collection + environment + newman in CI | Dhruvika | ⬜ |
| 4.3 | **WebHooks** — inbound GitHub (HMAC verified) + outbound milestone | Taher | ⬜ |
| 4.4 | **HTTPS** — TLS at Nginx, HTTP→HTTPS redirect, TLS 1.2+ | Dhruvika | ⬜ |
| 4.5 | **Nginx** — reverse proxy, gzip, security headers, WS upgrade | Dhruvika | ⬜ |
| 4.6 | **Cloud Deployment** — live URL (Render/Railway/EC2/GKE) | Taher | ⬜ |

---

## 5. Risk register

| Risk | Impact | Mitigation |
|---|---|---|
| Swagger 5-auth item is 10 marks and easy to half-do | Lose 1/6 of total | Build it in Sprint 1, demo all five in the Authorize dialog |
| Practicals 13–14 need Java/Maven, our stack has none | Lose lab marks | Add a small standalone Java module early |
| Collaborative filtering underperforms on sparse data | Weak core result | Abhishek runs offline eval in Sprint 2, not at the end |
| Contract drift between the 4 slices | Two slices stall at once | C1–C5 frozen in `/contracts`, changes by PR only |
| Live demo fails on the day | Lose presentation marks | Seeded offline data + recorded fallback video |
| Only one member visible in Jira/Git history | Lose JIRA + Git marks | Every member commits and transitions their own issues |

---

## 6. Suggested order

1. **Sprint 1** — repo, Docker Compose, auth + all 5 Swagger schemes, Mongo schemas + seed, Jira set up
2. **Sprint 2** — events, catalogue, feed UI, ML offline evaluation ← *de-risks the core*
3. **Sprint 3** — path sequencer, mastery, ML service live, admin console
4. **Sprint 4** — Jenkins, K8s, Swarm, Nginx/HTTPS, Prometheus, cloud deploy
5. **Sprint 5** — Selenium, lab file write-ups, project report, demo rehearsal
