pipeline "e2e_params" {
  title = "E2E Params"

  param "greeting" {
    type    = string
    default = "Hello"
  }

  step "message" "say" {
    notifier = notifier.default
    text     = "E2E params: ${param.greeting}"
  }

  output "result" {
    value = step.message.say
  }
}
