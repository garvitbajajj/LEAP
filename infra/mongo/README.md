# MongoDB Replica Set & Sharding for LEAP

This directory provides production-style MongoDB High Availability (Replica Set) and Horizontal Scaling (Sharded Cluster) configurations.

## 1. 3-Node Replica Set (`rs0`)

Starts `mongo-1` (primary), `mongo-2`, and `mongo-3` (secondaries), initializes `rs0`, and connects the Express `server` with `readPreference=secondaryPreferred`:

```bash
docker compose -f infra/mongo/docker-compose.ha.yml up -d --build
docker compose -f infra/mongo/docker-compose.ha.yml --profile seed run --rm seed
```

Verify replica set status & failover:
```bash
docker exec -it mongo-mongo-1-1 mongosh --eval "rs.status().members.map(m => ({name: m.name, stateStr: m.stateStr}))"
```

## 2. Sharded Cluster (`mongos` + `configsvr` + 2 Shards)

Starts a config server replica set (`cfgRs`), two shard replica sets (`shard1Rs`, `shard2Rs`), and a `mongos` router on port `27017`, then shards `leap.interactions`, `leap.recommendations`, and `leap.contentitems` using hashed shard keys:

```bash
docker compose -f infra/mongo/docker-compose.sharded.yml up -d
```

Verify shard distribution:
```bash
docker exec -it mongo-mongos-1 mongosh --eval "sh.status()"
```
