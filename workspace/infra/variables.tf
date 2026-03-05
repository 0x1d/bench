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

variable "vercel_git_repo" {
  type        = string
  description = "GitHub repo in format owner/repo (e.g. myorg/my-app)"
}

variable "vercel_deploy_path" {
  type        = string
  description = "Path to app directory for deployment"
}

# Render
variable "render_web_service_name" {
  type        = string
  default     = "bench-api"
  description = "Render web service name"
}

variable "render_plan" {
  type        = string
  default     = "starter"
  description = "Render plan (starter, standard, pro, etc.)"
}

variable "render_region" {
  type        = string
  default     = "oregon"
  description = "Render region (frankfurt, ohio, oregon, singapore, virginia)"
}

variable "render_repo_url" {
  type        = string
  description = "GitHub repo URL for Render (e.g. https://github.com/owner/repo)"
}

variable "render_branch" {
  type        = string
  default     = "main"
  description = "Git branch for Render deployments"
}

variable "render_runtime" {
  type        = string
  default     = "node"
  description = "Render native runtime (node, python, ruby, go, rust, elixir)"
}

variable "render_build_command" {
  type        = string
  default     = "npm install"
  description = "Render build command"
}

variable "render_start_command" {
  type        = string
  default     = "npm start"
  description = "Render start command"
}
