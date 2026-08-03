variable "project_name" { type = string }
variable "environment" { type = string }
variable "vpc_id" { type = string }
variable "private_subnet_ids" { type = list(string) }
variable "app_security_group_id" { type = string }
variable "target_group_arn" { type = string }
variable "execution_role_arn" { type = string }
variable "task_role_arn" { type = string }
variable "ecr_repository_url" { type = string }
variable "image_tag" { type = string }
variable "database_url_secret_arn" { type = string }
variable "redis_url_secret_arn" { type = string }
variable "jwt_private_jwk_secret_arn" { type = string }
variable "kafka_brokers" { type = string }
variable "desired_count" { type = number }
variable "worker_desired_count" { type = number }

locals {
  container_name = "api"
  log_group      = "/ecs/${var.project_name}/${var.environment}"
  image          = "${var.ecr_repository_url}:${var.image_tag}"

  common_secrets = [
    { name = "DATABASE_URL", valueFrom = var.database_url_secret_arn },
    { name = "REDIS_URL", valueFrom = var.redis_url_secret_arn },
    { name = "JWT_PRIVATE_JWK", valueFrom = var.jwt_private_jwk_secret_arn },
  ]

  common_environment = [
    { name = "NODE_ENV", value = "production" },
    { name = "KAFKA_BROKERS", value = var.kafka_brokers },
    { name = "ENABLE_SWAGGER", value = "false" },
    { name = "ENABLE_PROVIDER_SANDBOX", value = "false" },
    { name = "MTLS_REQUIRED", value = "true" },
  ]
}

resource "aws_cloudwatch_log_group" "this" {
  name              = local.log_group
  retention_in_days = 30
}

resource "aws_ecs_cluster" "this" {
  name = "${var.project_name}-${var.environment}"
}

resource "aws_ecs_task_definition" "api" {
  family                   = "${var.project_name}-${var.environment}-api"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = "512"
  memory                   = "1024"
  execution_role_arn       = var.execution_role_arn
  task_role_arn            = var.task_role_arn

  container_definitions = jsonencode([
    {
      name         = local.container_name
      image        = local.image
      essential    = true
      portMappings = [{ containerPort = 3000, protocol = "tcp" }]
      environment  = local.common_environment
      secrets      = local.common_secrets
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = local.log_group
          awslogs-region        = data.aws_region.current.name
          awslogs-stream-prefix = "api"
        }
      }
      command = ["node", "dist/main.js"]
    }
  ])
}

resource "aws_ecs_task_definition" "worker" {
  family                   = "${var.project_name}-${var.environment}-worker"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = "512"
  memory                   = "1024"
  execution_role_arn       = var.execution_role_arn
  task_role_arn            = var.task_role_arn

  container_definitions = jsonencode([
    {
      name        = "worker"
      image       = local.image
      essential   = true
      environment = concat(local.common_environment, [{ name = "ENABLE_WORKERS", value = "true" }])
      secrets     = local.common_secrets
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = local.log_group
          awslogs-region        = data.aws_region.current.name
          awslogs-stream-prefix = "worker"
        }
      }
      command = ["node", "dist/interfaces/workers/main.js"]
    }
  ])
}

# Separate one-shot migration task — run before scaling API replicas on deploy.
resource "aws_ecs_task_definition" "migrate" {
  family                   = "${var.project_name}-${var.environment}-migrate"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = "256"
  memory                   = "512"
  execution_role_arn       = var.execution_role_arn
  task_role_arn            = var.task_role_arn

  container_definitions = jsonencode([
    {
      name        = "migrate"
      image       = local.image
      essential   = true
      environment = [{ name = "NODE_ENV", value = "production" }]
      secrets     = [{ name = "DATABASE_URL", valueFrom = var.database_url_secret_arn }]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = local.log_group
          awslogs-region        = data.aws_region.current.name
          awslogs-stream-prefix = "migrate"
        }
      }
      command = ["pnpm", "prisma", "migrate", "deploy"]
    }
  ])
}

resource "aws_ecs_service" "api" {
  name            = "${var.project_name}-${var.environment}-api"
  cluster         = aws_ecs_cluster.this.id
  task_definition = aws_ecs_task_definition.api.arn
  desired_count   = var.desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = var.private_subnet_ids
    security_groups  = [var.app_security_group_id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = var.target_group_arn
    container_name   = local.container_name
    container_port   = 3000
  }

  lifecycle {
    ignore_changes = [desired_count]
  }
}

resource "aws_ecs_service" "worker" {
  name            = "${var.project_name}-${var.environment}-worker"
  cluster         = aws_ecs_cluster.this.id
  task_definition = aws_ecs_task_definition.worker.arn
  desired_count   = var.worker_desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = var.private_subnet_ids
    security_groups  = [var.app_security_group_id]
    assign_public_ip = false
  }
}

data "aws_region" "current" {}

output "cluster_name" {
  value = aws_ecs_cluster.this.name
}

output "api_service_name" {
  value = aws_ecs_service.api.name
}

output "migration_task_definition_arn" {
  value = aws_ecs_task_definition.migrate.arn
}
