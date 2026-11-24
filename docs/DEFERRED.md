# Deferred to the Next Milestone

The base build demonstrates every vertical working end to end. These items were
deliberately scheduled after the first review - three per member. Each is
independent of the others, so all four members can work in parallel.

## V1 - Garvit Bajaj · Identity, Access & Platform Foundation

| # | Item | Where it plugs in |
|---|---|---|
| 1 | **Google OAuth token exchange.** [COMPLETED] Authorization code flow with PKCE (S256) and a CSRF `state` cookie; the callback exchanges the code, requires a verified Google email, then signs in, links or creates the user. No token ever appears in a URL. Needs `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` to go live. | `server/src/auth/google.js`, `server/src/auth/routes.js` |
| 2 | **Refresh-token rotation with reuse detection.** [COMPLETED] 15-minute access JWT plus a hashed, HttpOnly refresh cookie rotated on every use. Replaying a retired token revokes its whole family, with a 10-second grace window for concurrent tabs. The client refreshes silently with one shared request. | `server/src/auth/sessions.js`, `client/src/api.js` |
| 3 | **Password reset by email.** [COMPLETED] Single-use, hashed, 30-minute tokens; identical replies whether or not the account exists; a reset revokes every session. Sends through SMTP when configured, otherwise logs the link. | `server/src/auth/passwordReset.js`, `server/src/auth/mailer.js` |

## V2 - Dhruvika Bansal · Content Catalogue & Discovery

| # | Item | Where it plugs in |
|---|---|---|
| 1 | **Selenium end-to-end suite.** [COMPLETED] Java + Maven + JUnit 5 suite with Page Object Model, explicit `WebDriverWait` only, headless Chrome, all 7 scenarios, screenshot-on-failure, and Surefire/Failsafe JUnit XML reports for Jenkins. | `tests/e2e/` |
| 2 | **HTTPS reverse proxy and Postman collection.** [COMPLETED] Nginx TLS 1.2+ termination with HTTP → HTTPS redirect, self-signed certificate generation scripts & entrypoint, and full Postman v2.1 collection with auto-login pre-request script and Newman CI runner. | `client/nginx.conf`, `client/certs/`, `postman/` |
| 3 | **Bulk CSV import with a dry-run preview**, and upgrading content vectors from TF-IDF to sentence-transformer embeddings. [COMPLETED] `POST /api/v1/catalogue/import` (`dryRun=true|false`) with RFC 4180 parsing, batch prerequisite resolution and DAG cycle checks + Admin UI uploader; plus `SentenceTransformerEncoder` (`all-MiniLM-L6-v2`) with automatic TF-IDF fallback in `ml/app/embeddings.py`. | `server/src/catalogue/csvImport.js`, `server/src/catalogue/routes.js`, `ml/app/embeddings.py`, `ml/app/model.py` |

## V3 - Abhishek Vijay Kakde · Personalised Recommendations & Feed

| # | Item | Where it plugs in |
|---|---|---|
| 1 | **ALS matrix-factorisation collaborative filtering.** [COMPLETED] Implemented implicit ALS matrix factorisation (Hu-Koren-Volinsky) in `ml/app/als.py` and `ml/app/model.py`, replacing dense item-item cosine similarity with 16 latent factors and O(N*k) projection scaling. | `ml/app/model.py`, `ml/app/als.py` |
| 2 | **Jenkins multibranch pipeline.** [COMPLETED] Added `Jenkinsfile.multibranch` with 11 declarative stages, branch-conditional SonarQube, Docker build/push, manual approval gate on `main`, and GitHub webhook trigger. | `Jenkinsfile.multibranch` (new), `docs/JENKINS_WEBHOOK_SETUP.md` (new) |
| 3 | **Redis response caching.** [COMPLETED] Per-learner versioned feed cache with a 5-minute TTL, invalidated on completions, likes, skips, bookmarks, quizzes, feedback and profile edits; fallback feeds are never cached, and the API keeps working if Redis is down. About 10x faster on a hit (109 ms to 9 ms locally). | `server/src/recommendations/cache.js`, `server/src/redis.js` |

## V4 - Taher Mohammed Husain Aurangabadi · Learning Path, Mastery & Analytics

| # | Item | Where it plugs in |
|---|---|---|
| 1 | **Kubernetes manifests and Docker Swarm stack.** Deployments, StatefulSet for MongoDB, Ingress with TLS, HPA, probes; plus `docker-stack.yml` with replicas and rolling updates. | `infra/k8s/`, `infra/swarm/` (new) |
| 2 | **Prometheus and Grafana.** Both services already expose `/metrics`; add scrape config, alert rules and a provisioned dashboard. | `infra/prometheus/`, `infra/grafana/` (new) |
| 3 | **Offline evaluation harness and retraining gate.** Precision@K, Recall@K, NDCG@K against popularity and content-only baselines; activate a retrained model only if it beats the current one. | `ml/eval/` (new), `ml/app/main.py` |

## Also outstanding

- **Java and Maven module** for lab practicals 13 and 14 - the project stack has no Java build to run.
- **Celery workers.** Mastery and path updates run inline today (marked with a `ponytail:` comment); move them to a queue once event volume warrants it.
