variable "project_name" { type = string }
variable "environment" { type = string }
variable "vpc_id" { type = string }
variable "private_subnet_ids" { type = list(string) }
variable "app_security_group_id" { type = string }
variable "kafka_version" { type = string }
variable "broker_instance_type" { type = string }

resource "aws_security_group" "msk" {
  name        = "${var.project_name}-${var.environment}-msk"
  description = "MSK security group"
  vpc_id      = var.vpc_id

  ingress {
    from_port       = 9094
    to_port         = 9098
    protocol        = "tcp"
    security_groups = [var.app_security_group_id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_msk_cluster" "this" {
  cluster_name           = "${var.project_name}-${var.environment}"
  kafka_version          = var.kafka_version
  number_of_broker_nodes = 2

  broker_node_group_info {
    instance_type   = var.broker_instance_type
    client_subnets  = var.private_subnet_ids
    security_groups = [aws_security_group.msk.id]
  }

  encryption_info {
    encryption_in_transit {
      client_broker = "TLS"
    }
  }

  client_authentication {
    unauthenticated = true
  }
}

# Kafka topic creation and ACLs remain an operational boundary outside this module.
# Use MSK Connect, a one-shot init task, or CI automation to create financial.events topics.

output "bootstrap_brokers_tls" {
  value = aws_msk_cluster.this.bootstrap_brokers_tls
}

output "cluster_arn" {
  value = aws_msk_cluster.this.arn
}
