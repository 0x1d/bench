package database

import (
	"context"
	"os"
	"testing"

	"github.com/0x1d/bench/api/internal/db"
	"github.com/0x1d/bench/api/internal/model"
)

func TestParseRefComment(t *testing.T) {
	tests := []struct {
		comment string
		want   *model.ForeignKeyRef
	}{
		{"ref:tags:id:multiple", &model.ForeignKeyRef{Table: "tags", Column: "id", Multiple: true}},
		{"ref:tags:id", &model.ForeignKeyRef{Table: "tags", Column: "id", Multiple: false}},
		{"  ref:users:pk:multiple  ", &model.ForeignKeyRef{Table: "users", Column: "pk", Multiple: true}},
		{"", nil},
		{"ref:tags", nil},
		{"ref:invalid-table:id", nil},
	}
	for _, tt := range tests {
		got := parseRefComment(tt.comment)
		if tt.want == nil {
			if got != nil {
				t.Errorf("parseRefComment(%q) = %+v, want nil", tt.comment, got)
			}
			continue
		}
		if got == nil || got.Table != tt.want.Table || got.Column != tt.want.Column || got.Multiple != tt.want.Multiple {
			t.Errorf("parseRefComment(%q) = %+v, want %+v", tt.comment, got, tt.want)
		}
	}
}

func TestGetTableDataSearch(t *testing.T) {
	connStr := os.Getenv("DATABASE_URL")
	if connStr == "" {
		t.Skip("DATABASE_URL not set, skipping integration test")
	}
	ctx := context.Background()
	if err := db.Init(ctx, connStr); err != nil {
		t.Fatalf("init db: %v", err)
	}
	defer db.Close()

	// Create a test table
	_, _ = db.Pool.Exec(ctx, `DROP TABLE IF EXISTS _test_search`)
	_, err := db.Pool.Exec(ctx, `CREATE TABLE _test_search (id int, name text)`)
	if err != nil {
		t.Fatalf("create table: %v", err)
	}
	defer db.Pool.Exec(ctx, `DROP TABLE IF EXISTS _test_search`)

	_, err = db.Pool.Exec(ctx, `INSERT INTO _test_search VALUES (1, 'apple'), (2, 'banana'), (3, 'cherry')`)
	if err != nil {
		t.Fatalf("insert: %v", err)
	}

	// No search - should return all
	data, err := GetTableData(ctx, "_test_search", 10, 0, "")
	if err != nil {
		t.Fatalf("get data: %v", err)
	}
	if data.Total != 3 || len(data.Rows) != 3 {
		t.Errorf("no search: want total=3 rows=3, got total=%d rows=%d", data.Total, len(data.Rows))
	}

	// Search "ban" - should return 1 row
	data, err = GetTableData(ctx, "_test_search", 10, 0, "ban")
	if err != nil {
		t.Fatalf("get data: %v", err)
	}
	if data.Total != 1 || len(data.Rows) != 1 {
		t.Errorf("search=ban: want total=1 rows=1, got total=%d rows=%d", data.Total, len(data.Rows))
	}

	// Search "xyz" - should return 0 rows
	data, err = GetTableData(ctx, "_test_search", 10, 0, "xyz")
	if err != nil {
		t.Fatalf("get data: %v", err)
	}
	if data.Total != 0 || len(data.Rows) != 0 {
		t.Errorf("search=xyz: want total=0 rows=0, got total=%d rows=%d", data.Total, len(data.Rows))
	}
}
