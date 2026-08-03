variable "project_name" { type = string }
variable "environment" { type = string }
variable "kms_key_arn" { type = string }

resource "aws_secretsmanager_secret" "database_url" {
  name       = "${var.project_name}/${var.environment}/database-url"
  kms_key_id = var.kms_key_arn
}

resource "aws_secretsmanager_secret" "redis_url" {
  name       = "${var.project_name}/${var.environment}/redis-url"
  kms_key_id = var.kms_key_arn
}

resource "aws_secretsmanager_secret" "jwt_private_jwk" {
  name       = "${var.project_name}/${var.environment}/jwt-private-jwk"
  kms_key_id = var.kms_key_arn
}

output "database_url_secret_arn" {
  value = aws_secretsmanager_secret.database_url.arn
}

output "redis_url_secret_arn" {
  value = aws_secretsmanager_secret.redis_url.arn
}

output "jwt_private_jwk_secret_arn" {
  value = aws_secretsmanager_secret.jwt_private_jwk.arn
}

output "secret_arns" {
  value = [
    aws_secretsmanager_secret.database_url.arn,
    aws_secretsmanager_secret.redis_url.arn,
    aws_secretsmanager_secret.jwt_private_jwk.arn,
  ]
}
