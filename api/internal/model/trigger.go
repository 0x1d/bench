package model

import (
	"encoding/json"
	"time"
)

// TriggerType defines Flowpipe trigger types.
type TriggerType string

const (
	TriggerTypeSchedule       TriggerType = "schedule"
	TriggerTypeAlert          TriggerType = "alert"
	TriggerTypeHTTP           TriggerType = "http"
	TriggerTypeNotification   TriggerType = "notification"
)

// HTTPConfig holds configuration for HTTP triggers (Flowpipe's inbound webhook receiver).
type HTTPConfig struct {
	Description   string            `yaml:"description,omitempty" json:"description,omitempty"`
	Pipeline      string            `yaml:"pipeline" json:"pipeline"`
	Args          map[string]string `yaml:"args,omitempty" json:"args,omitempty"`
	ExecutionMode string            `yaml:"executionMode,omitempty" json:"executionMode,omitempty"`
}

// ScheduleConfig holds configuration for schedule triggers.
type ScheduleConfig struct {
	Description string            `yaml:"description,omitempty" json:"description,omitempty"`
	Pipeline    string            `yaml:"pipeline" json:"pipeline"`
	Cron        string            `yaml:"cron,omitempty" json:"cron,omitempty"`
	Timezone    string            `yaml:"timezone,omitempty" json:"timezone,omitempty"`
	Args        map[string]string `yaml:"args,omitempty" json:"args,omitempty"`
}

// AlertConfig holds configuration for alert triggers.
type AlertConfig struct {
	Description string `yaml:"description,omitempty" json:"description,omitempty"`
	Pipeline    string `yaml:"pipeline" json:"pipeline"`
	Source      string `yaml:"source,omitempty" json:"source,omitempty"`
	Condition   string `yaml:"condition,omitempty" json:"condition,omitempty"`
}

// NotificationConfig holds configuration for notification triggers.
type NotificationConfig struct {
	Description  string   `yaml:"description,omitempty" json:"description,omitempty"`
	Pipeline     string   `yaml:"pipeline" json:"pipeline"`
	Source       string   `yaml:"source,omitempty" json:"source,omitempty"`
	Channel      string   `yaml:"channel,omitempty" json:"channel,omitempty"`
	Conditions   []string `yaml:"conditions,omitempty" json:"conditions,omitempty"`
}

// TriggerConfig holds type-specific configuration for a trigger.
type TriggerConfig struct {
	Description  string            `yaml:"description,omitempty" json:"description,omitempty"`
	Pipeline     string            `yaml:"pipeline,omitempty" json:"pipeline,omitempty"`
	Schedule     *ScheduleConfig   `yaml:"schedule,omitempty" json:"schedule,omitempty"`
	Alert        *AlertConfig      `yaml:"alert,omitempty" json:"alert,omitempty"`
	HTTP         *HTTPConfig       `yaml:"http,omitempty" json:"http,omitempty"`
	Notification *NotificationConfig `yaml:"notification,omitempty" json:"notification,omitempty"`
}

// MarshalJSON implements json.Marshaler. It outputs the nested struct fields
// AND flattens type-specific keys to the top level so the UI form can read
// them directly (e.g. config.cron instead of config.schedule.cron).
func (c TriggerConfig) MarshalJSON() ([]byte, error) {
	// Use an alias to avoid infinite recursion
	type Alias TriggerConfig
	aux, err := json.Marshal(Alias(c))
	if err != nil {
		return nil, err
	}
	// Decode back into a map so we can inject flat keys
	var m map[string]any
	if err := json.Unmarshal(aux, &m); err != nil {
		return nil, err
	}

	if c.Schedule != nil {
		if c.Schedule.Cron != "" {
			m["cron"] = c.Schedule.Cron
		}
		if c.Schedule.Timezone != "" {
			m["timezone"] = c.Schedule.Timezone
		}
		if c.Schedule.Pipeline != "" {
			m["pipeline"] = c.Schedule.Pipeline
		}
		if len(c.Schedule.Args) > 0 {
			m["args"] = c.Schedule.Args
		}
	}
	if c.Alert != nil {
		if c.Alert.Source != "" {
			m["source"] = c.Alert.Source
		}
		if c.Alert.Condition != "" {
			m["condition"] = c.Alert.Condition
		}
		if c.Alert.Pipeline != "" {
			m["pipeline"] = c.Alert.Pipeline
		}
	}
	if c.HTTP != nil {
		if len(c.HTTP.Args) > 0 {
			m["args"] = c.HTTP.Args
		}
		if c.HTTP.ExecutionMode != "" {
			m["executionMode"] = c.HTTP.ExecutionMode
		}
		if c.HTTP.Pipeline != "" {
			m["pipeline"] = c.HTTP.Pipeline
		}
	}
	if c.Notification != nil {
		if c.Notification.Source != "" {
			m["source"] = c.Notification.Source
		}
		if c.Notification.Channel != "" {
			m["channel"] = c.Notification.Channel
		}
		if len(c.Notification.Conditions) > 0 {
			m["conditions"] = c.Notification.Conditions
		}
		if c.Notification.Pipeline != "" {
			m["pipeline"] = c.Notification.Pipeline
		}
	}

	return json.Marshal(m)
}

// TriggerEntry represents a configured trigger in config.yaml (flowpipe_triggers[]).
type TriggerEntry struct {
	ID        string        `yaml:"id" json:"id"`
	Label     string        `yaml:"label,omitempty" json:"label,omitempty"`
	Workspace string        `yaml:"workspace,omitempty" json:"workspace,omitempty"`
	Module    string        `yaml:"module" json:"module"`
	Type      TriggerType   `yaml:"type" json:"type"`
	Config    TriggerConfig `yaml:"config" json:"config"`
}

// TriggerState represents the runtime state of a trigger for API responses.
type TriggerState struct {
	ID        string        `json:"id"`
	Label     string        `json:"label"`
	Module    string        `json:"module"`
	Type      TriggerType   `json:"type"`
	Workspace string        `json:"workspace"`
	Enabled   bool          `json:"enabled"`
	Config    TriggerConfig `json:"config,omitempty"`
	LastRun   *time.Time    `json:"lastRun,omitempty"`
	NextRun   *time.Time    `json:"nextRun,omitempty"`
	Status    string        `json:"status,omitempty"`
}

// TriggerListResponse represents the response for listing triggers.
type TriggerListResponse struct {
	Triggers []TriggerState `json:"triggers"`
}

// TriggerWebhookURLResponse represents the response for getting a webhook URL.
type TriggerWebhookURLResponse struct {
	URL string `json:"url"`
}

// TriggerTestResponse represents the response for testing a trigger.
type TriggerTestResponse struct {
	ExecutedAt time.Time `json:"executedAt"`
	Status     string    `json:"status"`
}
