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
    koyeb = {
      source  = "koyeb/koyeb"
      version = "~> 0.1"
    }
  }
}

provider "vercel" {
  # VERCEL_API_TOKEN env var required
  api_token = var.vercel_api_token
}

provider "supabase" {
  access_token = var.supabase_access_token
}

provider "koyeb" {
  # KOYEB_TOKEN env var required (create from Account settings)
}