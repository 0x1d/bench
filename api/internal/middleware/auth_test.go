package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestRequireAPIToken(t *testing.T) {
	nextCalled := false
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		nextCalled = true
		w.WriteHeader(http.StatusOK)
	})

	handler := RequireAPIToken("secret-token", next)

	t.Run("missing token", func(t *testing.T) {
		nextCalled = false
		req := httptest.NewRequest(http.MethodGet, "/api/health", nil)
		rr := httptest.NewRecorder()

		handler.ServeHTTP(rr, req)

		if rr.Code != http.StatusUnauthorized {
			t.Fatalf("expected %d, got %d", http.StatusUnauthorized, rr.Code)
		}
		if nextCalled {
			t.Fatal("next handler should not be called")
		}
	})

	t.Run("invalid token", func(t *testing.T) {
		nextCalled = false
		req := httptest.NewRequest(http.MethodGet, "/api/health", nil)
		req.Header.Set(apiTokenHeader, "wrong-token")
		rr := httptest.NewRecorder()

		handler.ServeHTTP(rr, req)

		if rr.Code != http.StatusUnauthorized {
			t.Fatalf("expected %d, got %d", http.StatusUnauthorized, rr.Code)
		}
		if nextCalled {
			t.Fatal("next handler should not be called")
		}
	})

	t.Run("valid token", func(t *testing.T) {
		nextCalled = false
		req := httptest.NewRequest(http.MethodGet, "/api/health", nil)
		req.Header.Set(apiTokenHeader, "secret-token")
		rr := httptest.NewRecorder()

		handler.ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Fatalf("expected %d, got %d", http.StatusOK, rr.Code)
		}
		if !nextCalled {
			t.Fatal("next handler should be called")
		}
	})
}
