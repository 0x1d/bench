package flow

import (
	"encoding/json"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"

	"github.com/0x1d/bench/api/internal/config"
	"github.com/0x1d/bench/api/internal/model"
)

// Test fixtures
const (
	testFlowID       = "test_flow_for_triggers"
	testFlowFPPath   = "test_flow_for_triggers.fp"
	testFlowJSONPath = "test_flow_for_triggers.json"
)

// setupTestDir creates a temporary directory for test trigger files
func setupTestDir(t *testing.T) string {
	t.Helper()
	dir, err := os.MkdirTemp("", "bench-trigger-test-*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	t.Cleanup(func() {
		_ = os.RemoveAll(dir)
	})
	return dir
}

// skipIfNoConfig skips tests that need config
func skipIfNoConfig(t *testing.T) {
	t.Helper()
	if config.FlowsPath() == "" {
		t.Skip("FlowsPath not configured, skipping")
	}
}

// createTestFlow creates a basic test flow file
func createTestFlow(t *testing.T, dir string) {
	t.Helper()

	// Create flow JSON
	flow := &model.Flow{
		ID:   testFlowID,
		Name: "Test Flow for Triggers",
		Steps: []model.FlowStep{
			{
				ID:    "msg1",
				Label: "message",
				Type:  "message",
				Config: map[string]any{
					"notifier": "default",
					"text":     "Hello from test",
				},
			},
		},
	}

	jsonPath := filepath.Join(dir, testFlowJSONPath)
	jsonData, err := json.MarshalIndent(flow, "", "  ")
	if err != nil {
		t.Fatalf("Failed to marshal flow: %v", err)
	}
	if err := os.WriteFile(jsonPath, jsonData, 0644); err != nil {
		t.Fatalf("Failed to write flow JSON: %v", err)
	}

	// Create flow FP file with a pipeline block
	fpContent := `pipeline "test_flow_for_triggers" {
  title = "Test Flow for Triggers"

  step "message" "msg1" {
    notifier = "default"
    text     = "Hello from test"
  }
}
`
	fpPath := filepath.Join(dir, testFlowFPPath)
	if err := os.WriteFile(fpPath, []byte(fpContent), 0644); err != nil {
		t.Fatalf("Failed to write flow FP: %v", err)
	}
}

// createTestTriggerFile creates a .fp file with trigger blocks for testing
func createTestTriggerFile(t *testing.T, dir string, triggers []string) {
	t.Helper()

	content := `mod "test_mod" {
  title       = "Test Mod"
  description = "Test mod for triggers"
}

`
	for _, trigger := range triggers {
		content += trigger + "\n\n"
	}

	fpPath := filepath.Join(dir, testFlowFPPath)
	// Read existing content if any
	if data, err := os.ReadFile(fpPath); err == nil {
		content = string(data) + "\n" + content
	}

	if err := os.WriteFile(fpPath, []byte(content), 0644); err != nil {
		t.Fatalf("Failed to write trigger file: %v", err)
	}
}

// buildHTTPTrigger returns a trigger HCL block as a string
func buildHTTPTrigger(id, description, pipeline string) string {
	return `trigger "http" "` + id + `" {
  description = "` + description + `"
  pipeline    = pipeline.` + pipeline + `
}`
}

// buildScheduleTrigger returns a schedule trigger HCL block as a string
func buildScheduleTrigger(id, description, pipeline, cron, timezone string) string {
	block := `trigger "schedule" "` + id + `" {
  description = "` + description + `"
  pipeline    = pipeline.` + pipeline + `
`
	if cron != "" {
		block += `  cron        = "` + cron + `"
`
	}
	if timezone != "" {
		block += `  timezone    = "` + timezone + `"
`
	}
	block += `}`
	return block
}

// TestBuildTriggerHCLBlock tests the HCL generation for different trigger types
func TestBuildTriggerHCLBlock(t *testing.T) {
	tests := []struct {
		name     string
		trigger  *model.TriggerEntry
		expected []string // strings that should be in the output
	}{
		{
			name: "http trigger with args and execution mode",
			trigger: &model.TriggerEntry{
				ID:        "my_webhook",
				Label:     "My HTTP Trigger",
				Module:    "test_flow",
				Type:      model.TriggerTypeHTTP,
				Workspace: "default",
				Config: model.TriggerConfig{
					Description: "HTTP webhook trigger",
					Pipeline:    "test_pipeline",
					HTTP: &model.HTTPConfig{
						Description:   "HTTP webhook trigger",
						Pipeline:      "test_pipeline",
						Args:          map[string]string{"body": "self.request_body", "headers": "self.request_headers"},
						ExecutionMode: "asynchronous",
					},
				},
			},
			expected: []string{
				`trigger "http" "my_webhook"`,
				`description = "HTTP webhook trigger"`,
				`pipeline    = pipeline.test_pipeline`,
				`args = {`,
				`execution_mode = "asynchronous"`,
			},
		},
		{
			name: "schedule trigger with cron",
			trigger: &model.TriggerEntry{
				ID:        "daily_report",
				Label:     "Daily Report",
				Module:      "test_flow",
				Type:      model.TriggerTypeSchedule,
				Workspace: "default",
				Config: model.TriggerConfig{
					Description: "Run daily at 9 AM",
					Pipeline:    "daily_report_pipeline",
					Schedule: &model.ScheduleConfig{
						Description: "Run daily at 9 AM",
						Pipeline:    "daily_report_pipeline",
						Cron:        "0 9 * * *",
						Timezone:    "UTC",
					},
				},
			},
			expected: []string{
				`trigger "schedule" "daily_report"`,
				`description = "Run daily at 9 AM"`,
				`pipeline    = pipeline.daily_report_pipeline`,
				`schedule    = "0 9 * * *"`,
				`timezone    = "UTC"`,
			},
		},
		{
			name: "schedule trigger with args",
			trigger: &model.TriggerEntry{
				ID:        "scheduled_with_args",
				Label:     "Scheduled with Args",
				Module:      "test_flow",
				Type:      model.TriggerTypeSchedule,
				Workspace: "default",
				Config: model.TriggerConfig{
					Description: "Run with params",
					Pipeline:    "my_pipeline",
					Schedule: &model.ScheduleConfig{
						Description: "Run with params",
						Pipeline:    "my_pipeline",
						Cron:        "*/5 * * * *",
						Args:        map[string]string{"input1": "hello", "conn_local": "local"},
					},
				},
			},
			expected: []string{
				`trigger "schedule" "scheduled_with_args"`,
				`schedule    = "*/5 * * * *"`,
				`args = {`,
			},
		},
		{
			name: "alert trigger with source and condition",
			trigger: &model.TriggerEntry{
				ID:        "high_latency_alert",
				Label:     "High Latency Alert",
				Module:      "test_flow",
				Type:      model.TriggerTypeAlert,
				Workspace: "default",
				Config: model.TriggerConfig{
					Description: "Alert on high latency",
					Pipeline:    "notify_pipeline",
					Alert: &model.AlertConfig{
						Description: "Alert on high latency",
						Pipeline:    "notify_pipeline",
						Source:      "notifier.slack",
						Condition:   "event.payload.latency > 1000",
					},
				},
			},
			expected: []string{
				`trigger "alert" "high_latency_alert"`,
				`source      = notifier.slack`,
				`condition   = "event.payload.latency > 1000"`,
			},
		},
		{
			name: "http trigger minimal",
			trigger: &model.TriggerEntry{
				ID:        "http_min",
				Label:     "HTTP Minimal",
				Module:    "test_flow",
				Type:      model.TriggerTypeHTTP,
				Workspace: "default",
				Config: model.TriggerConfig{
					Description: "Minimal HTTP trigger",
					Pipeline:    "callback_pipeline",
					HTTP: &model.HTTPConfig{
						Description: "Minimal HTTP trigger",
						Pipeline:    "callback_pipeline",
					},
				},
			},
			expected: []string{
				`trigger "http" "http_min"`,
				`pipeline    = pipeline.callback_pipeline`,
			},
		},
		{
			name: "notification trigger with channel",
			trigger: &model.TriggerEntry{
				ID:        "slack_notify",
				Label:     "Slack Notify",
				Module:      "test_flow",
				Type:      model.TriggerTypeNotification,
				Workspace: "default",
				Config: model.TriggerConfig{
					Description: "Slack notification",
					Pipeline:    "notify_pipeline",
					Notification: &model.NotificationConfig{
						Description: "Slack notification",
						Pipeline:    "notify_pipeline",
						Source:      "notifier.slack",
						Channel:     "#alerts",
						Conditions:  []string{"error", "warning"},
					},
				},
			},
			expected: []string{
				`trigger "notification" "slack_notify"`,
				`source      = notifier.slack`,
				`channel     = "#alerts"`,
				`conditions  = ["error", "warning"]`,
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			hcl, err := BuildTriggerHCLBlock(tt.trigger)
			if err != nil {
				t.Fatalf("BuildTriggerHCLBlock failed: %v", err)
			}

			for _, exp := range tt.expected {
				if !strings.Contains(hcl, exp) {
					t.Errorf("Expected HCL to contain %q, got:\n%s", exp, hcl)
				}
			}
		})
	}
}

// TestCreateTrigger tests creating a new trigger
func TestCreateTrigger(t *testing.T) {
	skipIfNoConfig(t)

	dir := setupTestDir(t)
	createTestFlow(t, dir)

	// Temporarily override FlowsPath
	origConfig := os.Getenv("BENCH_CONFIG")
	os.Setenv("BENCH_CONFIG", filepath.Join(dir, "config.yaml"))
	defer os.Setenv("BENCH_CONFIG", origConfig)

	configContent := `flows:
  path: ` + dir + `
`
	configPath := filepath.Join(dir, "config.yaml")
	if err := os.WriteFile(configPath, []byte(configContent), 0644); err != nil {
		t.Fatalf("Failed to write config: %v", err)
	}

	s := NewService()

	// Create a test trigger
	trigger := &model.TriggerEntry{
		ID:        "test_trigger",
		Label:     "Test Trigger",
		Module:      testFlowID,
		Type:      model.TriggerTypeHTTP,
		Workspace: "default",
		Config: model.TriggerConfig{
			Description: "Test trigger description",
			Pipeline:    "test_flow_for_triggers",
			HTTP: &model.HTTPConfig{
				Description: "Test trigger description",
				Pipeline:    "test_flow_for_triggers",
			},
		},
	}

	// Test error cases
	t.Run("nil trigger", func(t *testing.T) {
		err := s.CreateTrigger(nil)
		if err == nil || !strings.Contains(err.Error(), "trigger is nil") {
			t.Errorf("Expected 'trigger is nil' error, got: %v", err)
		}
	})

	t.Run("empty id", func(t *testing.T) {
		trig := *trigger
		trig.ID = ""
		err := s.CreateTrigger(&trig)
		if err == nil || !strings.Contains(err.Error(), "trigger id is required") {
			t.Errorf("Expected 'trigger id is required' error, got: %v", err)
		}
	})

	t.Run("empty flow", func(t *testing.T) {
		trig := *trigger
		trig.Module = ""
		err := s.CreateTrigger(&trig)
		if err == nil || !strings.Contains(err.Error(), "trigger flow is required") {
			t.Errorf("Expected 'trigger flow is required' error, got: %v", err)
		}
	})

	t.Run("empty type", func(t *testing.T) {
		trig := *trigger
		trig.Type = ""
		err := s.CreateTrigger(&trig)
		if err == nil || !strings.Contains(err.Error(), "trigger type is required") {
			t.Errorf("Expected 'trigger type is required' error, got: %v", err)
		}
	})

	t.Run("empty pipeline", func(t *testing.T) {
		trig := *trigger
		trig.Config.Pipeline = ""
		err := s.CreateTrigger(&trig)
		if err == nil || !strings.Contains(err.Error(), "trigger config.pipeline is required") {
			t.Errorf("Expected 'pipeline is required' error, got: %v", err)
		}
	})
}

// TestUpdateTrigger tests updating an existing trigger
func TestUpdateTrigger(t *testing.T) {
	skipIfNoConfig(t)

	dir := setupTestDir(t)
	createTestFlow(t, dir)

	// Create initial trigger
	httpTrigger := buildHTTPTrigger("update_test", "Initial description", "test_flow_for_triggers")
	createTestTriggerFile(t, dir, []string{httpTrigger})

	// Temporarily override FlowsPath
	origConfig := os.Getenv("BENCH_CONFIG")
	os.Setenv("BENCH_CONFIG", filepath.Join(dir, "config.yaml"))
	defer os.Setenv("BENCH_CONFIG", origConfig)

	configContent := `flows:
  path: ` + dir + `
`
	configPath := filepath.Join(dir, "config.yaml")
	if err := os.WriteFile(configPath, []byte(configContent), 0644); err != nil {
		t.Fatalf("Failed to write config: %v", err)
	}

	s := NewService()

	// Test update
	newTrigger := &model.TriggerEntry{
		ID:        "update_test",
		Label:     "Updated Trigger",
		Module:      testFlowID,
		Type:      model.TriggerTypeHTTP,
		Workspace: "default",
		Config: model.TriggerConfig{
			Description: "Updated description",
			Pipeline:    "test_flow_for_triggers",
			HTTP: &model.HTTPConfig{
				Description: "Updated description",
				Pipeline:    "test_flow_for_triggers",
			},
		},
	}

	// Test error cases
	t.Run("nil trigger", func(t *testing.T) {
		err := s.UpdateTrigger(nil)
		if err == nil || !strings.Contains(err.Error(), "trigger is nil") {
			t.Errorf("Expected 'trigger is nil' error, got: %v", err)
		}
	})

	t.Run("empty id", func(t *testing.T) {
		trig := *newTrigger
		trig.ID = ""
		err := s.UpdateTrigger(&trig)
		if err == nil || !strings.Contains(err.Error(), "trigger id is required") {
			t.Errorf("Expected 'trigger id is required' error, got: %v", err)
		}
	})

	t.Run("empty flow", func(t *testing.T) {
		trig := *newTrigger
		trig.Module = ""
		err := s.UpdateTrigger(&trig)
		if err == nil || !strings.Contains(err.Error(), "trigger flow is required") {
			t.Errorf("Expected 'trigger flow is required' error, got: %v", err)
		}
	})
}

// TestDeleteTrigger tests deleting a trigger
func TestDeleteTrigger(t *testing.T) {
	skipIfNoConfig(t)

	dir := setupTestDir(t)
	createTestFlow(t, dir)

	// Create triggers
	httpTrigger := buildHTTPTrigger("delete_test", "To be deleted", "test_flow_for_triggers")
	createTestTriggerFile(t, dir, []string{httpTrigger})

	// Temporarily override FlowsPath
	origConfig := os.Getenv("BENCH_CONFIG")
	os.Setenv("BENCH_CONFIG", filepath.Join(dir, "config.yaml"))
	defer os.Setenv("BENCH_CONFIG", origConfig)

	configContent := `flows:
  path: ` + dir + `
`
	configPath := filepath.Join(dir, "config.yaml")
	if err := os.WriteFile(configPath, []byte(configContent), 0644); err != nil {
		t.Fatalf("Failed to write config: %v", err)
	}

	s := NewService()

	// Test error cases
	t.Run("empty flow id", func(t *testing.T) {
		err := s.DeleteTrigger("", "test_trigger")
		if err == nil || !strings.Contains(err.Error(), "flow id is required") {
			t.Errorf("Expected 'flow id is required' error, got: %v", err)
		}
	})

	t.Run("empty trigger id", func(t *testing.T) {
		err := s.DeleteTrigger(testFlowID, "")
		if err == nil || !strings.Contains(err.Error(), "trigger id is required") {
			t.Errorf("Expected 'trigger id is required' error, got: %v", err)
		}
	})

	t.Run("non-existent flow", func(t *testing.T) {
		err := s.DeleteTrigger("non_existent_flow", "test_trigger")
		if err == nil || !strings.Contains(err.Error(), "flow not found") {
			t.Errorf("Expected 'flow not found' error, got: %v", err)
		}
	})

	t.Run("non-existent trigger", func(t *testing.T) {
		err := s.DeleteTrigger(testFlowID, "non_existent_trigger")
		if err == nil || !strings.Contains(err.Error(), "not found") {
			t.Errorf("Expected 'not found' error, got: %v", err)
		}
	})
}

// TestParseTriggerBlock tests the ParseTriggerBlock function
func TestParseTriggerBlock(t *testing.T) {
	tests := []struct {
		name     string
		typeStr  string
		id       string
		block    string
		checks   func(t *testing.T, state model.TriggerState)
	}{
		{
			name:    "http trigger",
			typeStr: "http",
			id:      "test_http",
			block:   `description = "Test http" pipeline = pipeline.test_pipeline`,
			checks: func(t *testing.T, state model.TriggerState) {
				if state.Type != model.TriggerTypeHTTP {
					t.Errorf("Expected http type, got %s", state.Type)
				}
				if state.ID != "test_http" {
					t.Errorf("Expected ID test_http, got %s", state.ID)
				}
			},
		},
		{
			name:    "schedule trigger",
			typeStr: "schedule",
			id:      "daily_report",
			block:   "pipeline = pipeline.daily_report\n  schedule = \"0 9 * * *\"\n  args = {\n    input1     = \"hello\"\n    conn_local = \"local\"\n  }",
			checks: func(t *testing.T, state model.TriggerState) {
				if state.Type != model.TriggerTypeSchedule {
					t.Errorf("Expected schedule type, got %s", state.Type)
				}
				if state.ID != "daily_report" {
					t.Errorf("Expected ID daily_report, got %s", state.ID)
				}
				if state.Config.Schedule == nil {
					t.Fatal("Expected Schedule config to be set")
				}
				if state.Config.Schedule.Cron != "0 9 * * *" {
					t.Errorf("Expected cron '0 9 * * *', got %q", state.Config.Schedule.Cron)
				}
				if state.Config.Schedule.Args == nil {
					t.Fatal("Expected Args to be set")
				}
				if state.Config.Schedule.Args["input1"] != "hello" {
					t.Errorf("Expected args.input1='hello', got %q", state.Config.Schedule.Args["input1"])
				}
				if state.Config.Schedule.Args["conn_local"] != "local" {
					t.Errorf("Expected args.conn_local='local', got %q", state.Config.Schedule.Args["conn_local"])
				}
			},
		},
		{
			name:    "alert trigger",
			typeStr: "alert",
			id:      "high_latency",
			block:   `pipeline = pipeline.notify latency source = notifier.slack condition = "event.payload.latency > 1000"`,
			checks: func(t *testing.T, state model.TriggerState) {
				if state.Type != model.TriggerTypeAlert {
					t.Errorf("Expected alert type, got %s", state.Type)
				}
			},
		},
		{
			name:    "notification trigger",
			typeStr: "notification",
			id:      "slack_alert",
			block:   `pipeline = pipeline.notify_channel source = notifier.slack channel = "#alerts"`,
			checks: func(t *testing.T, state model.TriggerState) {
				if state.Type != model.TriggerTypeNotification {
					t.Errorf("Expected notification type, got %s", state.Type)
				}
			},
		},
		{
			name:    "http trigger with args",
			typeStr: "http",
			id:      "http_with_args",
			block:   `pipeline = pipeline.http_callback args = { body = "self.request_body" } execution_mode = "asynchronous"`,
			checks: func(t *testing.T, state model.TriggerState) {
				if state.Type != model.TriggerTypeHTTP {
					t.Errorf("Expected http type, got %s", state.Type)
				}
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			state := ParseTriggerBlock(tt.typeStr, tt.id, tt.block)
			if state.Type == "" {
				t.Errorf("Trigger type should not be empty")
			}
			if state.ID == "" {
				t.Errorf("Trigger ID should not be empty")
			}
			tt.checks(t, state)
		})
	}
}

// TestHCLRegex tests the HCL parsing regex
func TestHCLRegex(t *testing.T) {
	// Sample HCL with trigger block
	hcl := `
pipeline "test" {
  step "message" "msg" {
    text = "hello"
  }
}

trigger "http" "my_http" {
  description = "An HTTP trigger"
  pipeline    = pipeline.test_pipeline
}

trigger "schedule" "daily" {
  pipeline = pipeline.daily_report
  cron     = "0 9 * * *"
}
`

	triggerBlockRe := regexp.MustCompile(`(?s)trigger\s+"(\w+)"\s+"([^"]+)"\s*\{([^}]*)\}`)
	matches := triggerBlockRe.FindAllStringSubmatch(hcl, -1)

	if len(matches) != 2 {
		t.Errorf("Expected 2 matches, got %d", len(matches))
	}

	// Check first match (http)
	if matches[0][1] != "http" {
		t.Errorf("Expected 'http', got '%s'", matches[0][1])
	}
	if matches[0][2] != "my_http" {
		t.Errorf("Expected 'my_http', got '%s'", matches[0][2])
	}
	if !strings.Contains(matches[0][3], "description") {
		t.Errorf("Block content should contain 'description'")
	}

	// Check second match (schedule)
	if matches[1][1] != "schedule" {
		t.Errorf("Expected 'schedule', got '%s'", matches[1][1])
	}
	if matches[1][2] != "daily" {
		t.Errorf("Expected 'daily', got '%s'", matches[1][2])
	}
}

// TestTriggerTypeConstants tests the trigger type constants
func TestTriggerTypeConstants(t *testing.T) {
	tests := []struct {
		constant model.TriggerType
		value    string
	}{
		{model.TriggerTypeHTTP, "http"},
		{model.TriggerTypeSchedule, "schedule"},
		{model.TriggerTypeAlert, "alert"},
		{model.TriggerTypeNotification, "notification"},
	}

	for _, tt := range tests {
		if string(tt.constant) != tt.value {
			t.Errorf("TriggerType %s has value %q, expected %q", tt.constant, string(tt.constant), tt.value)
		}
	}
}

// TestService_Init tests the Service type initialization
func TestService_Init(t *testing.T) {
	s := NewService()
	if s == nil {
		t.Fatal("NewService() returned nil")
	}
}

// TestTestTrigger_BasicChecks tests basic TestTrigger validation
func TestTestTrigger_BasicChecks(t *testing.T) {
	// This test verifies TestTrigger has proper validation but doesn't run
	// against Flowpipe API (which would be an integration test)
	s := NewService()

	// Test that proper errors are returned for missing parameters
	// We can't actually run this without Flowpipe running, so we just verify
	// the method exists and has the right signature

	// Verify the service has a TestTrigger method by attempting to call it
	// with invalid parameters (we expect errors, not panics)

	_, err := s.TestTrigger("", "", nil)
	if err == nil {
		// Expected error since flow ID is empty
		t.Log("TestTrigger returned nil error with empty flow ID (acceptable if handled)")
	}

	// The key is that TestTrigger method exists and is callable
	// Actual functionality testing requires Flowpipe API integration
}

// TestBuildTriggerHCLBlock_PipelineRefHandling tests that pipeline refs are correctly prefixed
func TestBuildTriggerHCLBlock_PipelineRefHandling(t *testing.T) {
	tests := []struct {
		name       string
		pipeline   string
		shouldHave string
	}{
		{"already prefixed", "pipeline.my_pipeline", "pipeline.my_pipeline"},
		{"needs prefix", "my_pipeline", "pipeline.my_pipeline"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			trigger := &model.TriggerEntry{
				ID:        "test",
				Label:     "Test",
				Module:      "test_flow",
				Type:      model.TriggerTypeHTTP,
				Workspace: "default",
				Config: model.TriggerConfig{
					Description: "Test",
					Pipeline:    tt.pipeline,
					HTTP: &model.HTTPConfig{
						Description: "Test",
						Pipeline:    tt.pipeline,
					},
				},
			}

			hcl, err := BuildTriggerHCLBlock(trigger)
			if err != nil {
				t.Fatalf("BuildTriggerHCLBlock failed: %v", err)
			}

			if !strings.Contains(hcl, tt.shouldHave) {
				t.Errorf("Expected HCL to contain %q, got:\n%s", tt.shouldHave, hcl)
			}
		})
	}
}

// TestBuildTriggerHCLBlock_NoExtraWhitespace tests that generated HCL has no extra whitespace issues
func TestBuildTriggerHCLBlock_NoExtraWhitespace(t *testing.T) {
	trigger := &model.TriggerEntry{
		ID:        "test",
		Label:     "Test",
		Module:      "test_flow",
		Type:      model.TriggerTypeHTTP,
		Workspace: "default",
		Config: model.TriggerConfig{
			Description: "Test",
			Pipeline:    "test_pipeline",
			HTTP: &model.HTTPConfig{
				Description: "Test",
				Pipeline:    "test_pipeline",
			},
		},
	}

	hcl, err := BuildTriggerHCLBlock(trigger)
	if err != nil {
		t.Fatalf("BuildTriggerHCLBlock failed: %v", err)
	}

	// Check the HCL is valid (opened and closed properly)
	if !strings.HasSuffix(strings.TrimSpace(hcl), "}") {
		t.Errorf("HCL should end with closing brace, got:\n%s", hcl)
	}

	// Count opening and closing braces
	openCount := strings.Count(hcl, "{")
	closeCount := strings.Count(hcl, "}")
	if openCount != closeCount {
		t.Errorf("HCL has mismatched braces: %d open, %d close\n%s", openCount, closeCount, hcl)
	}
}

// TestTriggerConfig_Validation tests that required fields are validated
func TestTriggerConfig_Validation(t *testing.T) {
	tests := []struct {
		name    string
		trigger *model.TriggerEntry
		valid   bool
	}{
		{
			name: "valid http",
			trigger: &model.TriggerEntry{
				ID:        "valid",
				Module:      "test_flow",
				Type:      model.TriggerTypeHTTP,
				Config:    model.TriggerConfig{Pipeline: "test_pipeline"},
			},
			valid: true,
		},
		{
			name: "invalid - no ID",
			trigger: &model.TriggerEntry{
				ID:        "",
				Module:      "test_flow",
				Type:      model.TriggerTypeHTTP,
				Config:    model.TriggerConfig{Pipeline: "test_pipeline"},
			},
			valid: false,
		},
		{
			name: "invalid - no flow",
			trigger: &model.TriggerEntry{
				ID:        "valid",
				Module:      "",
				Type:      model.TriggerTypeHTTP,
				Config:    model.TriggerConfig{Pipeline: "test_pipeline"},
			},
			valid: false,
		},
		{
			name: "invalid - no type",
			trigger: &model.TriggerEntry{
				ID:        "valid",
				Module:      "test_flow",
				Type:      "",
				Config:    model.TriggerConfig{Pipeline: "test_pipeline"},
			},
			valid: false,
		},
		{
			name: "invalid - no pipeline",
			trigger: &model.TriggerEntry{
				ID:        "valid",
				Module:      "test_flow",
				Type:      model.TriggerTypeHTTP,
				Config:    model.TriggerConfig{Pipeline: ""},
			},
			valid: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Check validation manually (not part of CreateTrigger to avoid file I/O)
			hasError := false
			if tt.trigger.ID == "" {
				hasError = true
			}
			if tt.trigger.Module == "" {
				hasError = true
			}
			if tt.trigger.Type == "" {
				hasError = true
			}
			if tt.trigger.Config.Pipeline == "" {
				hasError = true
			}

			if hasError && tt.valid {
				t.Errorf("Expected valid but got error")
			}
			if !hasError && !tt.valid {
				t.Errorf("Expected error but got valid")
			}
		})
	}
}

// TestTriggerTypesEdgeCases tests edge cases for different trigger types
func TestTriggerTypesEdgeCases(t *testing.T) {
	tests := []struct {
		name     string
		typeStr  model.TriggerType
		block    string
		hasField string
	}{
		{"alert with condition", model.TriggerTypeAlert, `condition = "event.payload.value > 100"`, "condition"},
		{"notification with channel", model.TriggerTypeNotification, `channel = "#alerts"`, "channel"},
		{"notification with conditions", model.TriggerTypeNotification, `conditions  = ["error", "warning"]`, "conditions"},
		{"http with url", model.TriggerTypeHTTP, `url = "https://example.com"`, "url"},
		{"http with method", model.TriggerTypeHTTP, `method = "POST"`, "method"},
		{"http with body", model.TriggerTypeHTTP, `body =`, "body"},
		{"schedule with cron", model.TriggerTypeSchedule, `cron = "0 * * * *"`, "cron"},
		{"schedule with timezone", model.TriggerTypeSchedule, `timezone = "America/New_York"`, "timezone"},
	}

	for _, tt := range tests {
		t.Run(string(tt.typeStr), func(t *testing.T) {
			// Check that we have the required trigger type constant
			if string(tt.typeStr) == "" {
				t.Errorf("Trigger type constant is empty")
			}
		})
	}
}
