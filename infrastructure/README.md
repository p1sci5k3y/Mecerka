# Terraform Infrastructure

This directory manages the AWS EC2 security group and the imported production instance.

## Production variables

Do not commit real environment values.

Use the committed template:

```bash
cp infrastructure/production.tfvars.example infrastructure/production.tfvars
```

Then fill in the real values locally:

- `existing_vpc_id`
- `existing_subnet_id`
- `admin_cidr_blocks`

`infrastructure/production.tfvars` is gitignored and must be operator-supplied.

## Import workflow

Before the first `terraform apply`, import the existing instance:

```bash
terraform -chdir=infrastructure import \
  -var-file=production.tfvars \
  aws_instance.mecerka_server \
  <instance-id>
```

## Validation

```bash
terraform fmt infrastructure
terraform -chdir=infrastructure validate
```
