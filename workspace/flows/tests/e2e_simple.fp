pipeline "e2e_simple" {
  title = "E2E Simple"

  step "message" "done" {
    notifier = notifier.default
    text     = "E2E simple trigger ran"
  }

  output "result" {
    value = step.message.done
  }
}
