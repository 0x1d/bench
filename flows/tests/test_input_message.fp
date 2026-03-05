pipeline "test_input_message" {
  title = "Test Input + Message"

  param "greeting" {
    type = string
    default = "Hello"
  }


  // Step: say (step_message_1)
  step "message" "say" {
    notifier = notifier.default
    text     = "Input+Message test: ${param.greeting}"
  }


  output "result" {
    value = step.message.say
  }

}
