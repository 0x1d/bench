package model

import "time"

// TriggerType defines Flowpipe trigger types.
type TriggerType string

const (
	TriggerTypeWebhook        TriggerType = "webhook"
	TriggerTypeSchedule       TriggerType = "schedule"
	TriggerTypeAlert          TriggerType = "alert"
	TriggerTypeHTTP           TriggerType = "http"
	TriggerTypeNotification   TriggerType = "notification"
)

// WebhookConfig holds configuration for webhook triggers.
type WebhookConfig struct {
	Description string `yaml:"description,omitempty" json:"description,omitempty"`
	Pipeline    string `yaml:"pipeline" json:"pipeline"`
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

// HTTPConfig holds configuration for HTTP triggers.
type HTTPConfig struct {
	Description string `yaml:"description,omitempty" json:"description,omitempty"`
	Pipeline    string `yaml:"pipeline" json:"pipeline"`
	URL         string `yaml:"url,omitempty" json:"url,omitempty"`
	Method      string `yaml:"method,omitempty" json:"method,omitempty"`
	Body        string `yaml:"body,omitempty" json:"body,omitempty"`
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
	Webhook      *WebhookConfig    `yaml:"webhook,omitempty" json:"webhook,omitempty"`
	Schedule     *ScheduleConfig   `yaml:"schedule,omitempty" json:"schedule,omitempty"`
	Alert        *AlertConfig      `yaml:"alert,omitempty" json:"alert,omitempty"`
	HTTP         *HTTPConfig       `yaml:"http,omitempty" json:"http,omitempty"`
	Notification *NotificationConfig `yaml:"notification,omitempty" json:"notification,omitempty"`
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
