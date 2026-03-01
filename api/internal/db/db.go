package db

import (
	"context"
	"fmt"
	"slices"
	"sync"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Definition represents one database connection definition.
type Definition struct {
	ID      string
	Label   string
	URL     string
	Enabled bool
	Default bool
}

// ConnectionState is database connection state for status/UI.
type ConnectionState struct {
	ID        string `json:"id"`
	Label     string `json:"label"`
	Enabled   bool   `json:"enabled"`
	IsDefault bool   `json:"isDefault"`
	Connected bool   `json:"connected"`
	Error     string `json:"error,omitempty"`
}

type poolRouter struct{}

// Pool routes queries to the selected database pool (by request context).
var Pool poolRouter

type contextKey string

const databaseIDContextKey contextKey = "bench-database-id"

var (
	mu          sync.RWMutex
	pools       = map[string]*pgxpool.Pool{}
	states      = map[string]ConnectionState{}
	defaultID   string
	activeOrder []string
)

type errorRow struct {
	err error
}

func (r errorRow) Scan(_ ...any) error {
	return r.err
}

func (poolRouter) Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error) {
	p, err := PoolFromContext(ctx)
	if err != nil {
		return nil, err
	}
	return p.Query(ctx, sql, args...)
}

func (poolRouter) QueryRow(ctx context.Context, sql string, args ...any) pgx.Row {
	p, err := PoolFromContext(ctx)
	if err != nil {
		return errorRow{err: err}
	}
	return p.QueryRow(ctx, sql, args...)
}

func (poolRouter) Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error) {
	p, err := PoolFromContext(ctx)
	if err != nil {
		return pgconn.CommandTag{}, err
	}
	return p.Exec(ctx, sql, args...)
}

// Init connects to PostgreSQL using DATABASE_URL. If DATABASE_URL is empty,
// Pool remains nil and database features are disabled.
func Init(ctx context.Context, connString string) error {
	if connString == "" {
		return nil
	}
	Close()
	pool, err := connectPool(ctx, connString)
	if err != nil {
		return err
	}
	mu.Lock()
	defer mu.Unlock()
	pools = map[string]*pgxpool.Pool{"default": pool}
	defaultID = "default"
	activeOrder = []string{"default"}
	states = map[string]ConnectionState{
		"default": {
			ID:        "default",
			Label:     "Default",
			Enabled:   true,
			IsDefault: true,
			Connected: true,
		},
	}
	return nil
}

// InitDefinitions initializes database pools from resource definitions.
// Failed connections are tracked in status state but do not stop startup.
func InitDefinitions(ctx context.Context, defs []Definition) error {
	Close()

	mu.Lock()
	defer mu.Unlock()

	pools = map[string]*pgxpool.Pool{}
	states = map[string]ConnectionState{}
	activeOrder = activeOrder[:0]
	defaultID = ""

	if len(defs) == 0 {
		return nil
	}

	for _, def := range defs {
		if def.ID == "" {
			continue
		}
		label := def.Label
		if label == "" {
			label = def.ID
		}
		state := ConnectionState{
			ID:        def.ID,
			Label:     label,
			Enabled:   def.Enabled,
			IsDefault: def.Default,
			Connected: false,
		}
		if !def.Enabled {
			states[def.ID] = state
			continue
		}
		pool, err := connectPool(ctx, def.URL)
		if err != nil {
			state.Error = err.Error()
			states[def.ID] = state
			continue
		}
		state.Connected = true
		pools[def.ID] = pool
		activeOrder = append(activeOrder, def.ID)
		states[def.ID] = state
	}

	for _, def := range defs {
		if def.Default {
			if _, ok := pools[def.ID]; ok {
				defaultID = def.ID
				break
			}
		}
	}
	if defaultID == "" && len(activeOrder) > 0 {
		defaultID = activeOrder[0]
	}
	if defaultID != "" {
		if s, ok := states[defaultID]; ok {
			s.IsDefault = true
			states[defaultID] = s
		}
	}

	return nil
}

func connectPool(ctx context.Context, connString string) (*pgxpool.Pool, error) {
	cfg, err := pgxpool.ParseConfig(connString)
	if err != nil {
		return nil, fmt.Errorf("invalid database url: %w", err)
	}
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, fmt.Errorf("connect failed: %w", err)
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("ping failed: %w", err)
	}
	return pool, nil
}

// Close releases the connection pool.
func Close() {
	mu.Lock()
	defer mu.Unlock()

	for _, p := range pools {
		p.Close()
	}
	pools = map[string]*pgxpool.Pool{}
	states = map[string]ConnectionState{}
	defaultID = ""
	activeOrder = activeOrder[:0]
}

// Configured returns true if a database connection is available.
func Configured() bool {
	mu.RLock()
	defer mu.RUnlock()
	return len(pools) > 0
}

// ContextWithDatabaseID stores selected database id in request context.
func ContextWithDatabaseID(ctx context.Context, id string) context.Context {
	if id == "" {
		return ctx
	}
	return context.WithValue(ctx, databaseIDContextKey, id)
}

// DatabaseIDFromContext returns selected database id from context (if any).
func DatabaseIDFromContext(ctx context.Context) string {
	v, _ := ctx.Value(databaseIDContextKey).(string)
	return v
}

// PoolFromContext resolves a connection pool from context-selected database id.
func PoolFromContext(ctx context.Context) (*pgxpool.Pool, error) {
	return PoolByID(DatabaseIDFromContext(ctx))
}

// PoolByID resolves a pool by id. Empty id resolves to default pool.
func PoolByID(id string) (*pgxpool.Pool, error) {
	mu.RLock()
	defer mu.RUnlock()

	if len(pools) == 0 {
		return nil, fmt.Errorf("database not configured")
	}
	if id == "" {
		if defaultID == "" {
			return nil, fmt.Errorf("default database not configured")
		}
		p, ok := pools[defaultID]
		if !ok {
			return nil, fmt.Errorf("default database not configured")
		}
		return p, nil
	}
	p, ok := pools[id]
	if !ok {
		return nil, fmt.Errorf("database %q is not available", id)
	}
	return p, nil
}

// DefaultID returns current default connected database id.
func DefaultID() string {
	mu.RLock()
	defer mu.RUnlock()
	return defaultID
}

// States returns all configured database states.
func States() []ConnectionState {
	mu.RLock()
	defer mu.RUnlock()

	out := make([]ConnectionState, 0, len(states))
	for _, s := range states {
		out = append(out, s)
	}
	slices.SortFunc(out, func(a, b ConnectionState) int {
		switch {
		case a.IsDefault && !b.IsDefault:
			return -1
		case !a.IsDefault && b.IsDefault:
			return 1
		case a.ID < b.ID:
			return -1
		case a.ID > b.ID:
			return 1
		default:
			return 0
		}
	})
	return out
}
