terraform {
  required_providers {
    docker = {
      source  = "kreuzwerker/docker"
      version = "~> 3.0"
    }
  }
}

provider "docker" {}

resource "docker_image" "nginx" {
  name = "nginx:1.25-alpine"
}

resource "docker_container" "nginx" {
  name  = "bench-nginx"
  image = docker_image.nginx.image_id

  ports {
    internal = 80
    external = 8081
    protocol = "tcp"
  }

  must_run = true
}
