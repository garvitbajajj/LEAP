# API Contracts

Frozen interfaces between the four verticals. Every service codes against these.
A change to any schema is a pull request approved by both affected owners.

| Contract | Interface | Direction |
|---|---|---|
| C1 | `POST /api/v1/events` | Client to Server |
| C2 | `GET /api/v1/recommendations` | Server to Client |
| C3 | `POST /ml/v1/recommend` | Server to ML service |
| C4 | `ContentItem` document | Catalogue to ML and UI |
| C5 | `LearnerProfile` document | Server to ML service |
