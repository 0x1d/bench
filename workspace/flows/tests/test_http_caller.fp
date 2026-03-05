pipeline "test_http_caller" {
  title = "Test HTTP Caller"


  // Step: call_http (step_pipeline_1)
  step "pipeline" "call_http" {
    pipeline = pipeline.test_http
  }


  // Step: enrich (step_transform_1)
  step "transform" "enrich" {
    value = jsonencode({ 
  source = "test_http", 
  data = step.pipeline.call_http.output.result, 
  transformed = true 
})
    depends_on = [step.pipeline.call_http]
  }


  output "enriched_output" {
    value = step.transform.enrich.value
  }

}
