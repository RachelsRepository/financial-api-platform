# Operations Runbook

## Health checks

```bash
curl -sf http://localhost:3000/health/live
curl -sf http://localhost:3000/health/ready
curl -sf http://localhost:3000/metrics | head
```

## Common procedures

### Restart API (Docker Compose)

```bash
docker compose restart api worker
```

### Run migrations manually

```bash
make migrate
# or
docker compose run --rm migrate
```

### Rotate JWT signing key

1. Generate new ES256 JWK with new `kid`
2. Add public JWK to `JWT_PUBLIC_JWKS` / JWKS endpoint
3. Update `JWT_PRIVATE_JWK` and `JWT_ACTIVE_KID` in secrets store
4. Rolling restart API tasks
5. Retire old `kid` after access token TTL elapsed

```mermaid
sequenceDiagram
  participant Ops as Operator
  participant SM as Secrets Manager
  participant API as API Tasks

  Ops->>SM: Store new JWT_PRIVATE_JWK
  Ops->>API: Rolling restart
  Note over API: Signs with new kid; validates old tokens via JWKS
```

### Investigate refresh token reuse alerts

1. Search audit logs for `identity.token_refreshed` and outbox `token.reuse_detected`
2. Identify affected `RefreshTokenFamily` ID
3. Confirm user re-authentication required
4. Review client storage of refresh tokens

### Kafka lag / outbox backlog

1. Check worker logs for publish errors
2. Verify `KAFKA_BROKERS` connectivity from worker task
3. Query unpublished outbox rows in PostgreSQL
4. After broker recovery, worker should drain backlog
5. Inspect DLQ for poison messages

### Scale API (ECS reference)

```bash
aws ecs update-service \
  --cluster <cluster> \
  --service <api-service> \
  --desired-count 4
```

## Dashboards (suggested)

| Metric                              | Alert threshold  |
| ----------------------------------- | ---------------- |
| `http_request_duration_seconds` p99 | > 2s for 5m      |
| Outbox unpublished count            | > 1000 for 10m   |
| Refresh reuse events                | > 0 (immediate)  |
| Circuit breaker open                | > 0 for provider |
| RDS CPU                             | > 80% for 15m    |

## Escalation

This reference project has no on-call rotation. Production operators should define their own escalation paths.

## Related

- [deployment.md](../deployment.md)
- [reconciliation.md](reconciliation.md)
- [failure-scenarios.md](../failure-scenarios.md)
