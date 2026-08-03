# Terraform — Financial API Platform (AWS reference)

This directory contains a **credible AWS reference layout**, not a turnkey production deployment. Account-specific configuration is required before `terraform apply` will succeed or be safe to run.

## Scope

The reference environment (`environments/dev`) composes modules for:

- **VPC** — public/private subnets, NAT, application security groups
- **ECS (Fargate)** — API service, worker service, and a **separate migration task definition**
- **RDS (PostgreSQL)** — private subnet placement, encrypted storage
- **ElastiCache (Redis)** — in-transit and at-rest encryption
- **MSK** — managed Kafka cluster (topic bootstrap is an operational boundary)
- **Secrets Manager + KMS** — database URL, Redis URL, JWT private JWK
- **ALB** — HTTPS termination with account-specific ACM certificate
- **IAM** — ECS execution/task roles with least-privilege secret access

## Account-specific prerequisites

Before applying, you must provide (at minimum):

| Input                 | Description                                                      |
| --------------------- | ---------------------------------------------------------------- |
| `alb_certificate_arn` | ACM certificate in the deployment region                         |
| `ecr_repository_url`  | ECR repository hosting the platform container image              |
| Secret values         | Populate Secrets Manager entries created by the `secrets` module |
| Remote state backend  | Configure S3/DynamoDB backend for team use (not included)        |
| DNS                   | Route53 or external DNS pointing to the ALB                      |

Create a `terraform.tfvars` file locally (never commit secrets):

```hcl
alb_certificate_arn = "arn:aws:acm:eu-west-2:123456789012:certificate/..."
ecr_repository_url  = "123456789012.dkr.ecr.eu-west-2.amazonaws.com/financial-api-platform"
image_tag           = "2026.01.15"
```

## Migration task (separate from API replicas)

Database schema migrations **must not** run inside every API container replica. The ECS module defines a dedicated `migrate` task definition that runs:

```bash
pnpm prisma migrate deploy
```

Run it as a one-shot ECS task during deployment, before updating the API service desired count:

```bash
aws ecs run-task \
  --cluster <cluster-name> \
  --task-definition <migration-task-definition-arn> \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[...],securityGroups=[...],assignPublicIp=DISABLED}"
```

## Kafka boundary

MSK provisions brokers and TLS connectivity. **Topic creation** (`financial.events`, `financial.events.dlq`) is intentionally outside Terraform — use MSK admin tooling, a CI init job, or MSK Connect depending on organizational standards.

## Validation

```bash
cd terraform/environments/dev
terraform init -backend=false
terraform validate
terraform fmt -check -recursive ../..
```

## Disclaimer

This is an independent portfolio reference implementation. It is not affiliated with, derived from, or intended to represent any employer, client, financial institution, or regulator. It demonstrates publicly documented standards and common financial API architecture patterns.
