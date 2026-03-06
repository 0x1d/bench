# -----------------------------------------------------------------------------
# Koyeb app and service
# https://www.koyeb.com/docs/integrations/infrastructure-as-code/terraform
# -----------------------------------------------------------------------------

resource "koyeb_app" "bench" {
  name = var.koyeb_app_name
}

resource "koyeb_service" "bench" {
  app_name = var.koyeb_app_name

  definition {
    name = var.koyeb_service_name
    instance_types {
      type = "micro"
    }
    ports {
      port     = 8080
      protocol = "http"
    }
    scalings {
      min = 1
      max = 1
    }
    env {
      key   = "PORT"
      value = "8080"
    }
    env {
      key   = "DATABASE_URL"
      value = data.supabase_pooler.db.url["session"]
    }
    routes {
      path = "/"
      port = 8080
    }
    regions = [var.koyeb_region]
    git {
      repository = var.koyeb_git_repo
      branch     = var.koyeb_git_branch
    }
  }

  depends_on = [koyeb_app.bench, data.supabase_pooler.db]
}
