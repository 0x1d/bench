mod "tests" {
  title       = "tests"
  description = "Flows in module tests"
}

trigger "http" "wh" {
  pipeline    = pipeline.test_container
  args = {
    body    = self.request_body
    headers = self.request_headers
  }
}

