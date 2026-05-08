# Supabase
variable "supabase_access_token" {
  type        = string
  description = "Supabase access token (create from dashboard)"
  sensitive   = true
}

variable "supabase_organization_id" {
  type        = string
  description = "Supabase organization ID"
}

variable "supabase_database_password" {
  type        = string
  description = "Database password for Supabase project"
  sensitive   = true
}

variable "supabase_region" {
  type        = string
  default     = "us-east-1"
  description = "Supabase project region"
}

# Vercel
variable "vercel_team_id" {
  type        = string
  default     = null
  description = "Vercel team ID (omit for personal account)"
}

variable "vercel_project_name" {
  type        = string
  default     = "bench-app"
  description = "Vercel project name"
}

variable "vercel_framework" {
  type        = string
  default     = "nextjs"
  description = "Vercel project framework"
}

variable "vercel_api_token" {
  type = string
}

variable "vercel_git_repo" {
  type        = string
  description = "GitHub repo in format owner/repo (e.g. myorg/my-app)"
}

variable "vercel_deploy_path" {
  type        = string
  description = "Path to app directory for deployment"
}

# Koyeb
variable "koyeb_app_name" {
  type        = string
  default     = "bench-koyeb"
  description = "Koyeb app name"
}

variable "koyeb_service_name" {
  type        = string
  default     = "bench-service"
  description = "Koyeb service name"
}

variable "koyeb_git_repo" {
  type        = string
  default     = "github.com/koyeb/example-golang"
  description = "Git repository for Koyeb service (e.g. github.com/owner/repo)"
}

variable "koyeb_git_branch" {
  type        = string
  default     = "main"
  description = "Git branch for Koyeb deployments"
}

variable "koyeb_region" {
  type        = string
  default     = "fra"
  description = "Koyeb region (fra, par, ams, etc.)"
}
