package main

import (
	"log"
	"net/http"
	"os"

	"github.com/0x1d/bench/api/internal/handler"
	"github.com/0x1d/bench/api/internal/middleware"
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

	mux := http.NewServeMux()
	handler.RegisterRoutes(mux)

	h := middleware.CORS(middleware.Logger(middleware.RequireAPIToken(apiToken, mux)))

	log.Printf("bench api listening on :%s", port)
	if err := http.ListenAndServe(":"+port, h); err != nil {
		log.Fatalf("server error: %v", err)
	}
}
