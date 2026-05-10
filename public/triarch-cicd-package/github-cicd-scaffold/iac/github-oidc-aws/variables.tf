variable "github_org" {
  description = "GitHub organisation name (case-sensitive)."
  type        = string
}

variable "github_repo" {
  description = "GitHub repository name (case-sensitive)."
  type        = string
}

variable "aws_region" {
  description = "Default AWS region."
  type        = string
  default     = "us-east-1"
}

variable "aws_account_id_dev" {
  description = "12-digit AWS account ID for the dev environment."
  type        = string
  validation {
    condition     = can(regex("^[0-9]{12}$", var.aws_account_id_dev))
    error_message = "AWS account ID must be 12 digits."
  }
}

variable "aws_account_id_staging" {
  description = "12-digit AWS account ID for the staging environment."
  type        = string
  validation {
    condition     = can(regex("^[0-9]{12}$", var.aws_account_id_staging))
    error_message = "AWS account ID must be 12 digits."
  }
}

variable "aws_account_id_prod" {
  description = "12-digit AWS account ID for the prod environment."
  type        = string
  validation {
    condition     = can(regex("^[0-9]{12}$", var.aws_account_id_prod))
    error_message = "AWS account ID must be 12 digits."
  }
}

variable "bootstrap_role_name" {
  description = "Name of the cross-account role this Tofu run assumes in each child account. Pre-created by your AWS Org admin."
  type        = string
  default     = "OrganizationAccountAccessRole"
}
