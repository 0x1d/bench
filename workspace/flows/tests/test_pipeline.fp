pipeline "test_pipeline" {
  title = "Test Pipeline"


  // Step: call_sleep (step_pipeline_1)
  step "pipeline" "call_sleep" {
    pipeline = pipeline.test_sleep
  }


  // Step: notify (step_message_1)
  step "message" "notify" {
    notifier = notifier.default
    text     = "Pipeline test completed!"
    depends_on = [step.pipeline.call_sleep]
  }


  output "result" {
    value = step.pipeline.call_sleep.output
  }

}
