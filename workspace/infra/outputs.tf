output "supabase_project_ref" {
  value       = supabase_project.db.id
  description = "Supabase project reference ID"
}

output "vercel_project_id" {
  value       = vercel_project.app.id
  description = "Vercel project ID"
}

output "vercel_deployment_url" {
  value       = vercel_deployment.app.url
  description = "Vercel deployment URL"
}

