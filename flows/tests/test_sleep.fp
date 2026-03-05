pipeline "test_sleep" {
  title = "Test Sleep"


  // Step: wait (step_sleep_1)
  step "sleep" "wait" {
    duration = "2s"
  }


  // Step: done (step_message_1)
  step "message" "done" {
    notifier = notifier.default
    text     = "Sleep test completed!"
    depends_on = [step.sleep.wait]
  }


  output "result" {
    value = step.message.done
  }

}
