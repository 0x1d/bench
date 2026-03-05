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

output "render_web_service_url" {
  value       = render_web_service.api.url
  description = "Render web service URL"
}
