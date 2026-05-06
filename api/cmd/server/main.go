package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/0x1d/bench/api/internal/config"
	"github.com/0x1d/bench/api/internal/db"
	"github.com/0x1d/bench/api/internal/handler"
	"github.com/0x1d/bench/api/internal/middleware"
)

func main() {
	listen := os.Getenv("BENCH_LISTEN_ADDR")
	if listen == "" {
		listen = ":8080"
	}

	if _, _, err := config.ReadConfig(); err != nil {
		log.Fatalf("config: %v", err)
	}

	ctx := context.Background()
	dbs, err := config.DatabasesWithError()
	if err != nil {
		log.Fatalf("databases config: %v", err)
	}
	defs := make([]db.Definition, 0, len(dbs))
	for _, d := range dbs {
		defs = append(defs, db.Definition{
			ID:      d.ID,
			Label:   d.Label,
			URL:     d.URL,
			Enabled: d.IsEnabled(),
			Default: d.Default,
		})
	}
	if err := db.InitDefinitions(ctx, defs); err != nil {
		log.Fatalf("db: %v", err)
	}
	defer db.Close()

	mux := http.NewServeMux()
	handler.RegisterRoutes(mux)

	var h http.Handler = mux
	if token := os.Getenv("BENCH_API_TOKEN"); token != "" {
		h = middleware.RequireAPIToken(token, h)
	}
	h = middleware.CORS(h)
	h = middleware.Logger(h)

	srv := &http.Server{
		Addr:              listen,
		Handler:           h,
		ReadHeaderTimeout: 10 * time.Second,
	}

	go func() {
		log.Printf("bench api listening on %s", listen)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("listen: %v", err)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Printf("shutdown: %v", err)
	}
}
