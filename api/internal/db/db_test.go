package db

import (
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
)

func TestTranslateParams(t *testing.T) {
	// currentSchema=jira
	url := "postgres://user:pass@localhost:5432/dbname?currentSchema=jira"
	cfg, err := pgxpool.ParseConfig(url)
	if err != nil {
		t.Fatalf("ParseConfig failed: %v", err)
	}

	translateParams(cfg)

	if _, ok := cfg.ConnConfig.RuntimeParams["currentSchema"]; ok {
		t.Error("currentSchema should have been deleted")
	}
	if val, ok := cfg.ConnConfig.RuntimeParams["search_path"]; !ok || val != "jira" {
		t.Errorf("search_path should be 'jira', got %q", val)
	}

	// both currentSchema and search_path (search_path should win)
	url2 := "postgres://user:pass@localhost:5432/dbname?currentSchema=jira&search_path=other"
	cfg2, err := pgxpool.ParseConfig(url2)
	if err != nil {
		t.Fatalf("ParseConfig failed: %v", err)
	}

	translateParams(cfg2)

	if val, ok := cfg2.ConnConfig.RuntimeParams["search_path"]; !ok || val != "other" {
		t.Errorf("search_path should remain 'other', got %q", val)
	}
}
