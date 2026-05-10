######################################################################
# GitHub OIDC trust into 3 AWS accounts (dev / staging / prod).
#
# Run once per organisation. Outputs the role ARNs that bootstrap.sh
# stores as GitHub Environment secrets (AWS_DEPLOY_ROLE_ARN per env).
#
# No long-lived AWS access keys are created.
######################################################################

terraform {
  required_version = ">= 1.6"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.50"
    }
  }
}

# --- Three provider aliases, one per env account -------------------------------

provider "aws" {
  alias  = "dev"
  region = var.aws_region
  assume_role {
    role_arn = "arn:aws:iam::${var.aws_account_id_dev}:role/${var.bootstrap_role_name}"
  }
}

provider "aws" {
  alias  = "staging"
  region = var.aws_region
  assume_role {
    role_arn = "arn:aws:iam::${var.aws_account_id_staging}:role/${var.bootstrap_role_name}"
  }
}

provider "aws" {
  alias  = "prod"
  region = var.aws_region
  assume_role {
    role_arn = "arn:aws:iam::${var.aws_account_id_prod}:role/${var.bootstrap_role_name}"
  }
}

# --- OIDC provider (one per account) -------------------------------------------

resource "aws_iam_openid_connect_provider" "github_dev" {
  provider        = aws.dev
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  # GitHub Actions OIDC root cert thumbprints (managed by AWS since 2023, but listed for older providers)
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1"]
}

resource "aws_iam_openid_connect_provider" "github_staging" {
  provider        = aws.staging
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1"]
}

resource "aws_iam_openid_connect_provider" "github_prod" {
  provider        = aws.prod
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1"]
}

# --- Trust policy template -----------------------------------------------------
# Critical: the `sub` claim is bound to repo + environment so a different repo
# (or the same repo deploying to a different env) cannot assume this role.

locals {
  audience = "sts.amazonaws.com"

  trust_dev = {
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = { Federated = aws_iam_openid_connect_provider.github_dev.arn }
      Action = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "token.actions.githubusercontent.com:aud" = local.audience
          "token.actions.githubusercontent.com:sub" = "repo:${var.github_org}/${var.github_repo}:environment:dev"
        }
      }
    }]
  }

  trust_staging = {
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = { Federated = aws_iam_openid_connect_provider.github_staging.arn }
      Action = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "token.actions.githubusercontent.com:aud" = local.audience
          "token.actions.githubusercontent.com:sub" = "repo:${var.github_org}/${var.github_repo}:environment:staging"
        }
      }
    }]
  }

  trust_prod = {
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = { Federated = aws_iam_openid_connect_provider.github_prod.arn }
      Action = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "token.actions.githubusercontent.com:aud" = local.audience
          "token.actions.githubusercontent.com:sub" = "repo:${var.github_org}/${var.github_repo}:environment:prod"
        }
        # Prod also requires the workflow ref to be a tag matching v*.*.*
        "StringLike" = {
          "token.actions.githubusercontent.com:job_workflow_ref" = "${var.github_org}/${var.github_repo}/.github/workflows/build.yml@refs/tags/v*"
        }
      }
    }]
  }
}

# --- Deploy roles --------------------------------------------------------------

resource "aws_iam_role" "deploy_dev" {
  provider           = aws.dev
  name               = "github-actions-dev"
  assume_role_policy = jsonencode(local.trust_dev)
  max_session_duration = 3600
  tags = { Managed = "github-oidc-tofu", Env = "dev" }
}

resource "aws_iam_role" "deploy_staging" {
  provider           = aws.staging
  name               = "github-actions-staging"
  assume_role_policy = jsonencode(local.trust_staging)
  max_session_duration = 3600
  tags = { Managed = "github-oidc-tofu", Env = "staging" }
}

resource "aws_iam_role" "deploy_prod" {
  provider           = aws.prod
  name               = "github-actions-prod"
  assume_role_policy = jsonencode(local.trust_prod)
  max_session_duration = 3600
  tags = { Managed = "github-oidc-tofu", Env = "prod" }
}

# --- Permissions on the deploy roles ------------------------------------------
# Replace with your actual app deploy permissions. Below is a *minimum* example.

data "aws_iam_policy_document" "deploy_baseline" {
  statement {
    sid     = "ECRPushPull"
    effect  = "Allow"
    actions = [
      "ecr:GetAuthorizationToken",
      "ecr:BatchCheckLayerAvailability",
      "ecr:GetDownloadUrlForLayer",
      "ecr:BatchGetImage",
      "ecr:InitiateLayerUpload",
      "ecr:UploadLayerPart",
      "ecr:CompleteLayerUpload",
      "ecr:PutImage",
    ]
    resources = ["*"]
  }
  statement {
    sid     = "DescribeOnly"
    effect  = "Allow"
    actions = ["ecs:Describe*", "ecs:List*", "elasticloadbalancing:Describe*"]
    resources = ["*"]
  }
  statement {
    sid     = "ReadSecrets"
    effect  = "Allow"
    actions = ["secretsmanager:GetSecretValue", "ssm:GetParameter*"]
    resources = ["arn:aws:secretsmanager:*:*:secret:app/*", "arn:aws:ssm:*:*:parameter/app/*"]
  }
}

resource "aws_iam_policy" "deploy_baseline_dev" {
  provider = aws.dev
  name     = "github-actions-dev-deploy"
  policy   = data.aws_iam_policy_document.deploy_baseline.json
}

resource "aws_iam_role_policy_attachment" "deploy_baseline_dev" {
  provider   = aws.dev
  role       = aws_iam_role.deploy_dev.name
  policy_arn = aws_iam_policy.deploy_baseline_dev.arn
}

resource "aws_iam_policy" "deploy_baseline_staging" {
  provider = aws.staging
  name     = "github-actions-staging-deploy"
  policy   = data.aws_iam_policy_document.deploy_baseline.json
}

resource "aws_iam_role_policy_attachment" "deploy_baseline_staging" {
  provider   = aws.staging
  role       = aws_iam_role.deploy_staging.name
  policy_arn = aws_iam_policy.deploy_baseline_staging.arn
}

resource "aws_iam_policy" "deploy_baseline_prod" {
  provider = aws.prod
  name     = "github-actions-prod-deploy"
  policy   = data.aws_iam_policy_document.deploy_baseline.json
}

resource "aws_iam_role_policy_attachment" "deploy_baseline_prod" {
  provider   = aws.prod
  role       = aws_iam_role.deploy_prod.name
  policy_arn = aws_iam_policy.deploy_baseline_prod.arn
}
