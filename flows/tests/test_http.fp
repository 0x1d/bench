pipeline "test_http" {
  title = "Test HTTP"


  // Step: fetch_pet (step_http_1)
  step "http" "fetch_pet" {
    url    = "https://petstore.swagger.io/v2/pet/1"
    method = "get"
  }


  // Step: notify (step_message_1)
  step "message" "notify" {
    notifier = notifier.default
    text     = "HTTP test completed!"
    depends_on = [step.http.fetch_pet]
  }


  output "result" {
    value = step.http.fetch_pet.response_body
  }

}
