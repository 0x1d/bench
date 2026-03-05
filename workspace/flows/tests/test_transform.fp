pipeline "test_transform" {
  title = "Test Transform"


  // Step: make_data (step_transform_1)
  step "transform" "make_data" {
    value = jsonencode({ status = "ok", step = "transform" })
  }


  // Step: notify (step_message_1)
  step "message" "notify" {
    notifier = notifier.default
    text     = "Transform test completed!"
    depends_on = [step.transform.make_data]
  }


  output "result" {
    value = step.transform.make_data.value
  }

}
