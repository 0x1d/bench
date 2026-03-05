terraform {
  required_providers {
    vercel = {
      source  = "vercel/vercel"
      version = "~> 3.0"
    }
    supabase = {
      source  = "supabase/supabase"
      version = "~> 1.0"
    }
    render = {
      source  = "render-oss/render"
      version = "~> 1.0"
    }
  }
}

provider "vercel" {
  # VERCEL_API_TOKEN env var required
}

provider "supabase" {
  access_token = var.supabase_access_token
}

provider "render" {
  # RENDER_API_KEY env var required
}