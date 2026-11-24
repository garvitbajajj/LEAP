# Prometheus & Grafana – LEAP Platform Monitoring

## Quick Start

Both services are included in the project's Docker Compose stack:

```bash
docker compose up -d prometheus grafana
```

| Service    | URL                        |
|------------|----------------------------|
| Prometheus | http://localhost:9090       |
| Grafana    | http://localhost:3001       |

Grafana ships with a **provisioned** Prometheus datasource and the
**LEAP Platform Overview** dashboard — no manual setup required.

## Directory Layout

```
infra/
├── prometheus/
│   ├── prometheus.yml      # Scrape config (server, ml, self)
│   └── alert-rules.yml     # Alert rules (latency, errors, ML status, …)
└── grafana/
    └── provisioning/
        ├── datasources/
        │   └── datasource.yml        # Prometheus datasource
        └── dashboards/
            ├── dashboard.yml         # Dashboard file provider
            └── leap-overview.json    # Pre-built overview dashboard
```

## Alert Rules

| Alert                          | Severity | Condition                              |
|--------------------------------|----------|----------------------------------------|
| HighRequestLatency             | warning  | p95 latency > 500 ms for 5 min        |
| HighErrorRate                  | critical | 5xx rate > 5 % for 5 min              |
| MLModelNotFitted               | critical | `ml_model_fitted == 0` for 2 min      |
| HighRecommendationFallbackRate | warning  | fallback rate > 0.1/s for 5 min       |
| ServiceDown                    | critical | `up == 0` for 1 min                   |
| HighMemoryUsage                | warning  | RSS > 512 MB for 5 min                |

## Customisation

- Edit `prometheus.yml` to add scrape targets or change intervals.
- Edit `alert-rules.yml` to tune thresholds.
- Import or create dashboards in Grafana; they persist via the provisioning directory.
