variable "aws_region" {
  description = "AWS Region where the existing infrastructure resides"
  type        = string
  default     = "eu-west-1"
}

variable "existing_vpc_id" {
  description = "ID of the existing VPC"
  type        = string
}

variable "existing_subnet_id" {
  description = "ID of the existing Subnet"
  type        = string
}
variable "admin_cidr_blocks" {
  description = "CIDR blocks allowed to access SSH"
  type        = list(string)
  default     = []
}
