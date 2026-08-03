variable "aws_region" {
  type        = string
  description = "AWS region for the dev environment."
  default     = "eu-west-2"
}

variable "project_name" {
  type        = string
  description = "Project name used for resource naming."
  default     = "financial-api-platform"
}

variable "environment" {
  type        = string
  description = "Environment name."
  default     = "dev"
}

variable "vpc_cidr" {
  type        = string
  description = "VPC CIDR block."
  default     = "10.20.0.0/16"
}

variable "db_instance_class" {
  type        = string
  description = "RDS instance class."
  default     = "db.t4g.micro"
}

variable "db_name" {
  type        = string
  description = "PostgreSQL database name."
  default     = "financial_api"
}

variable "db_username" {
  type        = string
  description = "PostgreSQL master username."
  default     = "fap_admin"
}

variable "redis_node_type" {
  type        = string
  description = "ElastiCache node type."
  default     = "cache.t4g.micro"
}

variable "kafka_version" {
  type        = string
  description = "MSK Kafka version."
  default     = "3.6.0"
}

variable "msk_broker_instance_type" {
  type        = string
  description = "MSK broker instance type."
  default     = "kafka.t3.small"
}

variable "alb_certificate_arn" {
  type        = string
  description = "ACM certificate ARN for HTTPS listener. Account-specific."
}

variable "ecr_repository_url" {
  type        = string
  description = "ECR repository URL for the API image. Account-specific."
}

variable "image_tag" {
  type        = string
  description = "Container image tag to deploy."
  default     = "latest"
}

variable "api_desired_count" {
  type        = number
  description = "Desired number of API tasks."
  default     = 2
}

variable "worker_desired_count" {
  type        = number
  description = "Desired number of worker tasks."
  default     = 1
}
