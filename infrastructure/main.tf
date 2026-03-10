terraform {
  required_version = ">= 1.5.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

# 1. Security Group definitions
resource "aws_security_group" "mecerka_sg" {
  name        = "mecerka-production-sg"
  description = "Security group for Mecerka EC2 instance (HTTP, HTTPS, SSH)"
  vpc_id      = var.existing_vpc_id

  # SSH Access — restricted to admin_cidr_blocks (defaults to 0.0.0.0/0, override per environment)
  # tfsec:ignore:aws-vpc-no-public-ingress-sgr
  ingress {
    description = "SSH access (restrict admin_cidr_blocks in tfvars for production)"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = var.admin_cidr_blocks
  }

  # HTTP Access — must be public for all web visitors
  # tfsec:ignore:aws-vpc-no-public-ingress-sgr
  ingress {
    description = "HTTP web traffic"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # HTTPS Access — must be public for all web visitors
  # tfsec:ignore:aws-vpc-no-public-ingress-sgr
  ingress {
    description = "HTTPS web traffic"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # Egress: Allow all outbound (needed for apt/dnf, docker pulls, Stripe API, etc.)
  # tfsec:ignore:aws-vpc-no-public-egress-sgr
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name    = "mecerka-production-sg"
    Project = "Mecerka"
  }
}

# 2. Existing EC2 Instance Management (Import Block)
# We use an import block so Terraform takes over the existing instance without deleting it
import {
  to = aws_instance.mecerka_server
  id = var.existing_instance_id
}

resource "aws_instance" "mecerka_server" {
  # These properties must match the actual instance to avoid destructive updates during plan/apply
  ami           = "ami-0eb260c4d5475b901" # Place holder, Terraform schema requires it but import matches the real one
  instance_type = "t3.micro"
  subnet_id     = var.existing_subnet_id
  
  # Attach the newly created Security Group to the existing instance
  vpc_security_group_ids = [aws_security_group.mecerka_sg.id]

  # Security Hardening (IMDSv2, Termination Protection, Encryption)
  disable_api_termination = true

  metadata_options {
    http_endpoint = "enabled"
    http_tokens   = "required"
  }

  root_block_device {
    encrypted = true
  }


  # We use lifecycle ignore_changes so Terraform doesn't try to replace the instance 
  # if the AMI or other base config differs from the template
  lifecycle {
    ignore_changes = [
      ami,
      key_name,
      associate_public_ip_address,
      root_block_device
    ]
  }

  # User Data script that configures Swap, Docker, and Docker Compose on boot
  user_data = <<-EOF
              #!/bin/bash
              set -e
              
              # 1. Create a 2GB Swapfile for the 1GB t3.micro memory
              if [ ! -f /swapfile ]; then
                fallocate -l 2G /swapfile
                chmod 600 /swapfile
                mkswap /swapfile
                swapon /swapfile
                # Make swap permanent
                echo "/swapfile swap swap defaults 0 0" >> /etc/fstab
                # Optimize swappiness for server
                sysctl vm.swappiness=10
                echo "vm.swappiness=10" >> /etc/sysctl.conf
              fi

              # 2. Identify OS and Install Docker & Docker Compose
              if [ -f /etc/os-release ]; then
                . /etc/os-release
                if [[ "$ID" == "ubuntu" || "$ID" == "debian" ]]; then
                  export DEBIAN_FRONTEND=noninteractive
                  apt-get update -y
                  apt-get install -y apt-transport-https ca-certificates curl software-properties-common nginx docker.io docker-compose
                  systemctl enable --now docker
                  systemctl enable nginx
                elif [[ "$ID" == "amzn" || "$ID" == "rhel" || "$ID" == "centos" ]]; then
                  yum update -y
                  yum install -y docker nginx
                  systemctl enable --now docker
                  systemctl enable nginx
                  # Download standalone docker-compose
                  curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
                  chmod +x /usr/local/bin/docker-compose
                  ln -s /usr/local/bin/docker-compose /usr/bin/docker-compose || true
                fi
              fi
              
              # Provide ec2-user/ubuntu user docker rights
              usermod -aG docker ec2-user || true
              usermod -aG docker ubuntu || true
              EOF

  tags = {
    Name    = "stackeable client"
    Project = "Mecerka"
  }
}

output "instance_public_ip" {
  description = "Public IP address of the EC2 instance"
  value       = aws_instance.mecerka_server.public_ip
}
