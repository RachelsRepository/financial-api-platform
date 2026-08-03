provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = var.project_name
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

data "aws_availability_zones" "available" {
  state = "available"
}

module "kms" {
  source = "../../modules/kms"

  project_name = var.project_name
  environment  = var.environment
}

module "vpc" {
  source = "../../modules/vpc"

  project_name       = var.project_name
  environment        = var.environment
  vpc_cidr           = var.vpc_cidr
  availability_zones = slice(data.aws_availability_zones.available.names, 0, 2)
}

module "secrets" {
  source = "../../modules/secrets"

  project_name = var.project_name
  environment  = var.environment
  kms_key_arn  = module.kms.key_arn
}

module "iam" {
  source = "../../modules/iam"

  project_name = var.project_name
  environment  = var.environment
  kms_key_arn  = module.kms.key_arn
  secrets_arns = module.secrets.secret_arns
}

module "rds" {
  source = "../../modules/rds"

  project_name          = var.project_name
  environment           = var.environment
  vpc_id                = module.vpc.vpc_id
  private_subnet_ids    = module.vpc.private_subnet_ids
  app_security_group_id = module.vpc.app_security_group_id
  kms_key_arn           = module.kms.key_arn
  db_instance_class     = var.db_instance_class
  db_name               = var.db_name
  db_username           = var.db_username
}

module "elasticache" {
  source = "../../modules/elasticache"

  project_name          = var.project_name
  environment           = var.environment
  vpc_id                = module.vpc.vpc_id
  private_subnet_ids    = module.vpc.private_subnet_ids
  app_security_group_id = module.vpc.app_security_group_id
  node_type             = var.redis_node_type
}

module "msk" {
  source = "../../modules/msk"

  project_name          = var.project_name
  environment           = var.environment
  vpc_id                = module.vpc.vpc_id
  private_subnet_ids    = module.vpc.private_subnet_ids
  app_security_group_id = module.vpc.app_security_group_id
  kafka_version         = var.kafka_version
  broker_instance_type  = var.msk_broker_instance_type
}

module "alb" {
  source = "../../modules/alb"

  project_name          = var.project_name
  environment           = var.environment
  vpc_id                = module.vpc.vpc_id
  public_subnet_ids     = module.vpc.public_subnet_ids
  app_security_group_id = module.vpc.app_security_group_id
  certificate_arn       = var.alb_certificate_arn
}

module "ecs" {
  source = "../../modules/ecs"

  project_name               = var.project_name
  environment                = var.environment
  vpc_id                     = module.vpc.vpc_id
  private_subnet_ids         = module.vpc.private_subnet_ids
  app_security_group_id      = module.vpc.app_security_group_id
  target_group_arn           = module.alb.target_group_arn
  execution_role_arn         = module.iam.ecs_execution_role_arn
  task_role_arn              = module.iam.ecs_task_role_arn
  ecr_repository_url         = var.ecr_repository_url
  image_tag                  = var.image_tag
  database_url_secret_arn    = module.secrets.database_url_secret_arn
  redis_url_secret_arn       = module.secrets.redis_url_secret_arn
  jwt_private_jwk_secret_arn = module.secrets.jwt_private_jwk_secret_arn
  kafka_brokers              = module.msk.bootstrap_brokers_tls
  desired_count              = var.api_desired_count
  worker_desired_count       = var.worker_desired_count
}

# Database migrations run as a separate ECS task definition (one-shot), not as part of API replicas.
# Trigger via CI/CD or `aws ecs run-task` using module.ecs.migration_task_definition_arn.
