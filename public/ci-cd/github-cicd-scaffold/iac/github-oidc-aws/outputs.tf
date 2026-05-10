output "dev_role_arn" {
  description = "ARN of the GitHub Actions deploy role in the dev account."
  value       = aws_iam_role.deploy_dev.arn
}

output "staging_role_arn" {
  description = "ARN of the GitHub Actions deploy role in the staging account."
  value       = aws_iam_role.deploy_staging.arn
}

output "prod_role_arn" {
  description = "ARN of the GitHub Actions deploy role in the prod account."
  value       = aws_iam_role.deploy_prod.arn
}

output "bootstrap_secrets_command" {
  description = "Convenience: shell snippet to set GitHub Environment secrets from these outputs."
  value = <<-EOT
    gh secret set AWS_DEPLOY_ROLE_ARN --env dev     --body "${aws_iam_role.deploy_dev.arn}"
    gh secret set AWS_DEPLOY_ROLE_ARN --env staging --body "${aws_iam_role.deploy_staging.arn}"
    gh secret set AWS_DEPLOY_ROLE_ARN --env prod    --body "${aws_iam_role.deploy_prod.arn}"
  EOT
}
