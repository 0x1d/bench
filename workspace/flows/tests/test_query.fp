pipeline "test_query" {
  title = "Test Query"

  param "conn_local" {
    type = string
  }


  // Step: select_one (step_query_1)
  step "query" "select_one" {
    sql      = "SELECT 1 AS num, 'query test' AS msg"
    database = connection.postgres[param.conn_local]
  }


  // Step: notify (step_message_1)
  step "message" "notify" {
    notifier = notifier.default
    text     = "Query test completed!"
    depends_on = [step.query.select_one]
  }


  output "result" {
    value = step.query.select_one.rows
  }

  output "status" {
    value = "nice"
  }

}
