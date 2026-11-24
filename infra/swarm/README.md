# LEAP — Docker Swarm Deployment

## Prerequisites

- Docker Engine 19.03+ with Swarm mode initialized
- All service images pushed to an accessible registry (or built on every node)

## 1. Initialize the Swarm (if not already)

```bash
docker swarm init --advertise-addr <MANAGER_IP>
```

Join worker nodes using the token printed by the command above.

## 2. Create Docker Secrets

Create the three required secrets **before** deploying the stack:

```bash
echo "<your-ml-api-key>"           | docker secret create ML_API_KEY -
echo "<your-jwt-secret>"           | docker secret create JWT_SECRET -
echo "<your-internal-bearer-token>"| docker secret create INTERNAL_BEARER_TOKEN -
```

> **Tip:** You can also pipe from a file:
> `docker secret create ML_API_KEY ./ml_api_key.txt`

Verify they exist:

```bash
docker secret ls
```

## 3. Deploy the Stack

```bash
docker stack deploy -c docker-stack.yml leap
```

Monitor rollout:

```bash
docker stack services leap          # service overview
docker service ps leap_server       # per-task status
docker service logs -f leap_server  # live logs
```

## 4. Verify Health

```bash
# All services should show the desired replica count
docker stack services leap

# Check individual service health
docker service inspect --pretty leap_mongo
docker service inspect --pretty leap_server
docker service inspect --pretty leap_ml
docker service inspect --pretty leap_client
```

## 5. Update a Service Image

Build and push the new image, then:

```bash
docker service update --image leap-server:v2 leap_server
```

Or redeploy the full stack after updating image tags in `docker-stack.yml`:

```bash
docker stack deploy -c docker-stack.yml leap
```

Rolling-update parameters defined in the stack file ensure zero-downtime deploys.

## 6. Scale a Service

```bash
docker service scale leap_server=5
```

## 7. Rotate a Secret

Docker secrets are immutable. To rotate one:

```bash
# 1. Create the new secret with a different name
echo "<new-value>" | docker secret create ML_API_KEY_v2 -

# 2. Update the service to swap the secret
docker service update \
  --secret-rm ML_API_KEY \
  --secret-add source=ML_API_KEY_v2,target=ML_API_KEY \
  leap_server

# 3. Remove the old secret once no service uses it
docker secret rm ML_API_KEY
```

## 8. Teardown

Remove the entire stack (services, network, but **not** volumes or secrets):

```bash
docker stack rm leap
```

To also remove persisted data:

```bash
docker volume rm leap_mongo-data leap_ml-registry
```

To remove secrets:

```bash
docker secret rm ML_API_KEY JWT_SECRET INTERNAL_BEARER_TOKEN
```

## Architecture Overview

| Service  | Replicas | Port  | Notes                              |
|----------|----------|-------|------------------------------------|
| mongo    | 1        | —     | Manager-only, persistent volume    |
| server   | 3        | 4000  | Rolling update, rollback on fail   |
| ml       | 2        | 8000  | Rolling update, model registry vol |
| client   | 3        | 8080  | Lightweight static frontend        |

All services communicate over the `leap-net` overlay network.
