# Deferred to the Next Milestone

The base build demonstrates every vertical working end to end. These items were
deliberately scheduled after the first review - three per member. Each is
independent of the others, so all four members can work in parallel.

## V1 - Garvit Bajaj · Identity, Access & Platform Foundation

| # | Item | Where it plugs in |
|---|---|---|
| 1 | **Google OAuth token exchange.** The redirect leg and CSRF `state` check are built; the callback must exchange the code for tokens once Google credentials are issued. | `server/src/auth/routes.js` - `/auth/google/callback` |
| 2 | **Refresh-token rotation with reuse detection.** Today a single 2-hour JWT is issued. Add a 15-minute access token plus an HttpOnly refresh cookie, rotated on use, with a jti denylist. | `server/src/middleware/auth.js`, `client/src/api.js` |
| 3 | **Password reset by email.** Single-use, hashed, time-limited reset tokens. | `server/src/auth/routes.js` |

## V2 - Dhruvika Bansal · Content Catalogue & Discovery

| # | Item | Where it plugs in |
|---|---|---|
| 1 | **Selenium end-to-end suite.** Page Object Model, explicit waits, the seven scenarios in the work division, JUnit XML for Jenkins. | `tests/e2e/` (new) |
| 2 | **HTTPS reverse proxy and Postman collection.** TLS termination at Nginx with an HTTP to HTTPS redirect, plus a Postman collection run by newman in CI. The plain-HTTP Nginx config already exists. | `client/nginx.conf`, `postman/` (new) |
| 3 | **Bulk CSV import with a dry-run preview**, and upgrading content vectors from TF-IDF to sentence-transformer embeddings. | `server/src/catalogue/routes.js`, `ml/app/model.py` |

## V3 - Abhishek Vijay Kakde · Personalised Recommendations & Feed

| # | Item | Where it plugs in |
|---|---|---|
| 1 | **ALS matrix-factorisation collaborative filtering.** [COMPLETED] Implemented implicit ALS matrix factorisation (Hu-Koren-Volinsky) in `ml/app/als.py` and `ml/app/model.py`, replacing dense item-item cosine similarity with 16 latent factors and O(N*k) projection scaling. | `ml/app/model.py`, `ml/app/als.py` |
| 2 | **Jenkins multibranch pipeline.** [COMPLETED] Added `Jenkinsfile.multibranch` with 11 declarative stages, branch-conditional SonarQube, Docker build/push, manual approval gate on `main`, and GitHub webhook trigger. | `Jenkinsfile.multibranch` (new), `docs/JENKINS_WEBHOOK_SETUP.md` (new) |
| 3 | **Redis response caching** for the feed, invalidated when the learner's profile changes. | `server/src/recommendations/routes.js` |

## V4 - Taher Mohammed Husain Aurangabadi · Learning Path, Mastery & Analytics

| # | Item | Where it plugs in |
|---|---|---|
| 1 | **Kubernetes manifests and Docker Swarm stack.** Deployments, StatefulSet for MongoDB, Ingress with TLS, HPA, probes; plus `docker-stack.yml` with replicas and rolling updates. | `infra/k8s/`, `infra/swarm/` (new) |
| 2 | **Prometheus and Grafana.** Both services already expose `/metrics`; add scrape config, alert rules and a provisioned dashboard. | `infra/prometheus/`, `infra/grafana/` (new) |
| 3 | **Offline evaluation harness and retraining gate.** Precision@K, Recall@K, NDCG@K against popularity and content-only baselines; activate a retrained model only if it beats the current one. | `ml/eval/` (new), `ml/app/main.py` |

## Also outstanding

- **Java and Maven module** for lab practicals 13 and 14 - the project stack has no Java build to run.
- **Celery workers.** Mastery and path updates run inline today (marked with a `ponytail:` comment); move them to a queue once event volume warrants it.
