variable "aws_region" {
  description = "AWS Region where the existing infrastructure resides"
  type        = string
  default     = "eu-west-1"
}

variable "existing_vpc_id" {
  description = "ID of the existing VPC"
  type        = string
  default     = "vpc-0626552ef2d408abe"
}

variable "existing_subnet_id" {
  description = "ID of the existing Subnet"
  type        = string
  default     = "subnet-0e769394628914359"
}

variable "existing_instance_id" {
  description = "ID of the existing EC2 instance"
  type        = string
  default     = "i-07b8b2ff00c18d875"
}
variable "admin_cidr_blocks" {
  description = "CIDR blocks allowed to access SSH"
  type        = list(string)
  default     = ["0.0.0.0/0"]
}
