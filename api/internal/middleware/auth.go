package middleware

import "net/http"

const apiTokenHeader = "X-API-Token"

// RequireAPIToken rejects requests that do not include the expected API token.
func RequireAPIToken(token string, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodOptions {
			next.ServeHTTP(w, r)
			return
		}

		if r.Header.Get(apiTokenHeader) != token {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		next.ServeHTTP(w, r)
	})
}
