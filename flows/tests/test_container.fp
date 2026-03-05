pipeline "test_container" {
  title = "Test Container"


  // Step: run_echo (step_container_1)
  step "container" "run_echo" {
    image = "alpine:latest"
    cmd = ["echo", "Hello from container!"]
  }


  // Step: notify (step_message_1)
  step "message" "notify" {
    notifier = notifier.default
    text     = "Container test completed!"
    depends_on = [step.container.run_echo]
  }


  output "result" {
    value = step.container.run_echo.stdout
  }

}
