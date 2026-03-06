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

data "vercel_project_directory" "app" {
  path = var.vercel_deploy_path
}

resource "vercel_deployment" "app" {
  project_id  = vercel_project.app.id
  files       = data.vercel_project_directory.app.files
  path_prefix = var.vercel_deploy_path
  production  = true

  depends_on = [data.vercel_project_directory.app, vercel_project.app]
}
