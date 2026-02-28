package db

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Pool is the database connection pool. Nil when DATABASE_URL is not set.
var Pool *pgxpool.Pool

// Init connects to PostgreSQL using DATABASE_URL. If DATABASE_URL is empty,
// Pool remains nil and database features are disabled.
func Init(ctx context.Context, connString string) error {
	if connString == "" {
		return nil
	}
	cfg, err := pgxpool.ParseConfig(connString)
	if err != nil {
		return fmt.Errorf("parse database url: %w", err)
	}
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return fmt.Errorf("connect to database: %w", err)
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return fmt.Errorf("ping database: %w", err)
	}
	Pool = pool
	return nil
}

// Close releases the connection pool.
func Close() {
	if Pool != nil {
		Pool.Close()
		Pool = nil
	}
}

// Configured returns true if a database connection is available.
func Configured() bool {
	return Pool != nil
}
