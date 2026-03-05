package main

import (
	"context"
	"log"
	"net/http"
	"os"

	"github.com/0x1d/bench/api/internal/config"
	"github.com/0x1d/bench/api/internal/db"
	"github.com/0x1d/bench/api/internal/handler"
	"github.com/0x1d/bench/api/internal/middleware"
	"github.com/0x1d/bench/api/internal/service/flow"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	apiToken := os.Getenv("API_TOKEN")
	if apiToken == "" {
		log.Fatal("API_TOKEN is required")
	}

	dbEntries, cfgErr := config.DatabasesWithError()
	if cfgErr != nil && config.FindConfigPath() != "" {
		log.Printf("config warning: %v", cfgErr)
	}
	if len(dbEntries) > 0 {
		defs := make([]db.Definition, 0, len(dbEntries))
		for _, entry := range dbEntries {
			defs = append(defs, db.Definition{
				ID:      entry.ID,
				Label:   entry.Label,
				URL:     entry.URL,
				Enabled: entry.IsEnabled(),
				Default: entry.Default,
			})
		}
		if err := db.InitDefinitions(context.Background(), defs); err != nil {
			log.Fatalf("database init: %v", err)
		}
		defer db.Close()
		log.Printf("database resources loaded (%d configured)", len(db.States()))
	} else if connStr := os.Getenv("DATABASE_URL"); connStr != "" {
		if err := db.Init(context.Background(), connStr); err != nil {
			log.Fatalf("database init: %v", err)
		}
		defer db.Close()
		log.Print("database connected (DATABASE_URL)")
	}

	// Regenerate .fp from .json on startup (fixes stale .fp when JSON edited outside API)
	if dir := config.FlowsPath(); dir != "" {
		flowSvc := flow.NewService()
		if err := flowSvc.SyncFromJSON(); err != nil {
			log.Printf("flow sync warning: %v", err)
		}
	}

	mux := http.NewServeMux()
	handler.RegisterRoutes(mux)

	h := middleware.CORS(middleware.Logger(middleware.RequireAPIToken(apiToken, mux)))

	log.Printf("bench api listening on :%s", port)
	if err := http.ListenAndServe(":"+port, h); err != nil {
		log.Fatalf("server error: %v", err)
	}
}
