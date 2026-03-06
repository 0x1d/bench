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
# Pooler connection string (Session mode)
# https://registry.terraform.io/providers/supabase/supabase/latest/docs/data-sources/pooler
# -----------------------------------------------------------------------------

data "supabase_pooler" "db" {
  project_ref = supabase_project.db.id
}
