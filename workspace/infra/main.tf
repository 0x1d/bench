# -----------------------------------------------------------------------------
# Locals
# -----------------------------------------------------------------------------

locals {
  # Supabase connection string for pooler (Session mode)
  # Format: postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres
  supabase_db_url = "postgresql://postgres.${supabase_project.db.id}:${var.supabase_database_password}@aws-0-${var.supabase_region}.pooler.supabase.com:6543/postgres"
}

# -----------------------------------------------------------------------------
# Supabase database
# https://supabase.com/docs/guides/deployment/terraform
# -----------------------------------------------------------------------------

resource "supabase_project" "db" {
  organization_id   = var.supabase_organization_id
  name              = "bench-db"
  database_password = var.supabase_database_password
  region            = var.supabase_region

  lifecycle {
    ignore_changes = [database_password]
  }
}

# -----------------------------------------------------------------------------
# Vercel project and deployment
# https://vercel.com/kb/guide/integrating-terraform-with-vercel
# -----------------------------------------------------------------------------

resource "vercel_project" "app" {
  name      = var.vercel_project_name
  framework = var.vercel_framework

  git_repository = var.vercel_git_repo != "" ? {
    type = "github"
    repo = var.vercel_git_repo
  } : null

  team_id = var.vercel_team_id
}

resource "vercel_project_environment_variable" "database_url" {
  project_id = vercel_project.app.id
  key        = "DATABASE_URL"
  value      = local.supabase_db_url
  target     = ["production", "preview"]

  depends_on = [supabase_project.db]
}

data "vercel_project_directory" "app" {
  path = var.vercel_deploy_path
}

resource "vercel_deployment" "app" {
  project_id  = vercel_project.app.id
  files       = data.vercel_project_directory.app.files
  path_prefix = var.vercel_deploy_path
  production  = true

  depends_on = [
    vercel_project.app,
    vercel_project_environment_variable.database_url,
    data.vercel_project_directory.app
  ]
}

# -----------------------------------------------------------------------------
# Render web service
# https://registry.terraform.io/providers/render-oss/render/latest/docs/resources/web_service
# -----------------------------------------------------------------------------

resource "render_web_service" "api" {
  name   = var.render_web_service_name
  plan   = var.render_plan
  region = var.render_region

  runtime_source = {
    native_runtime = {
      repo_url      = var.render_repo_url
      branch        = var.render_branch
      runtime       = var.render_runtime
      build_command = var.render_build_command
      auto_deploy   = true
    }
  }

  start_command = var.render_start_command

  env_vars = {
    DATABASE_URL = { value = local.supabase_db_url }
  }

  depends_on = [supabase_project.db]
}
