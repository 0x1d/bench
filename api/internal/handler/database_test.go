package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"github.com/0x1d/bench/api/internal/db"
)

func TestHandleDatabaseTableDataSearch(t *testing.T) {
	connStr := os.Getenv("DATABASE_URL")
	if connStr == "" {
		t.Skip("DATABASE_URL not set, skipping integration test")
	}
	if err := db.Init(context.Background(), connStr); err != nil {
		t.Fatalf("init db: %v", err)
	}
	defer db.Close()

	// Create test table
	ctx := context.Background()
	_, _ = db.Pool.Exec(ctx, `DROP TABLE IF EXISTS _test_handler_search`)
	_, err := db.Pool.Exec(ctx, `CREATE TABLE _test_handler_search (id int, name text)`)
	if err != nil {
		t.Fatalf("create table: %v", err)
	}
	defer db.Pool.Exec(ctx, `DROP TABLE IF EXISTS _test_handler_search`)
	_, _ = db.Pool.Exec(ctx, `INSERT INTO _test_handler_search VALUES (1, 'apple'), (2, 'banana'), (3, 'cherry')`)

	// Request with search param - URL must include query string for r.URL.Query().Get("search")
	req := httptest.NewRequest(http.MethodGet, "http://localhost/api/database/tables/_test_handler_search?limit=10&offset=0&search=ban", nil)
	req.SetPathValue("name", "_test_handler_search")

	rr := httptest.NewRecorder()
	HandleDatabaseTableData(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("status: want 200, got %d: %s", rr.Code, rr.Body.String())
	}

	var data struct {
		Total int        `json:"total"`
		Rows  [][]any    `json:"rows"`
	}
	if err := json.NewDecoder(rr.Body).Decode(&data); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if data.Total != 1 || len(data.Rows) != 1 {
		t.Errorf("search=ban: want total=1 rows=1, got total=%d rows=%d", data.Total, len(data.Rows))
	}
}
