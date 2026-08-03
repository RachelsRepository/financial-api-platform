output "vpc_id" {
  value       = module.vpc.vpc_id
  description = "VPC identifier."
}

output "alb_dns_name" {
  value       = module.alb.dns_name
  description = "Application load balancer DNS name."
}

output "rds_endpoint" {
  value       = module.rds.endpoint
  description = "RDS endpoint address."
  sensitive   = true
}

output "redis_primary_endpoint" {
  value       = module.elasticache.primary_endpoint
  description = "Redis primary endpoint."
}

output "msk_bootstrap_brokers_tls" {
  value       = module.msk.bootstrap_brokers_tls
  description = "MSK bootstrap brokers (TLS)."
  sensitive   = true
}

output "ecs_cluster_name" {
  value       = module.ecs.cluster_name
  description = "ECS cluster name."
}

output "ecs_api_service_name" {
  value       = module.ecs.api_service_name
  description = "ECS API service name."
}

output "migration_task_definition_arn" {
  value       = module.ecs.migration_task_definition_arn
  description = "One-shot Prisma migration task definition ARN."
}

output "kms_key_arn" {
  value       = module.kms.key_arn
  description = "KMS key ARN for secrets encryption."
}
