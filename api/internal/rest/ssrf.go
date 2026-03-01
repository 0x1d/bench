package rest

import (
	"fmt"
	"net"
	"net/url"
	"strings"
)

// ErrBlockedURL is returned when a URL is blocked for SSRF safety.
type ErrBlockedURL struct {
	Reason string
}

func (e ErrBlockedURL) Error() string {
	return fmt.Sprintf("URL blocked: %s", e.Reason)
}

// ValidateBaseURL checks that the base URL is safe to proxy (no SSRF).
// Blocks localhost, private IPs, link-local, and non-http(s) schemes.
func ValidateBaseURL(rawURL string) error {
	u, err := url.Parse(rawURL)
	if err != nil {
		return fmt.Errorf("invalid URL: %w", err)
	}

	scheme := strings.ToLower(u.Scheme)
	if scheme != "http" && scheme != "https" {
		return ErrBlockedURL{Reason: "only http and https schemes are allowed"}
	}

	host := u.Hostname()
	if host == "" {
		return ErrBlockedURL{Reason: "missing host"}
	}

	// Normalize for comparison
	hostLower := strings.ToLower(host)
	if hostLower == "localhost" || strings.HasSuffix(hostLower, ".localhost") {
		return ErrBlockedURL{Reason: "localhost is not allowed"}
	}

	// Check if host is a direct IP address
	if ip := net.ParseIP(host); ip != nil {
		if isBlockedIP(ip) {
			return ErrBlockedURL{Reason: fmt.Sprintf("private or loopback address %s is not allowed", ip.String())}
		}
		return nil
	}

	ips, err := net.LookupIP(host)
	if err != nil {
		// If we can't resolve, allow it - the outbound request will fail
		// but we don't want to block valid hostnames
		return nil
	}

	for _, ip := range ips {
		if isBlockedIP(ip) {
			return ErrBlockedURL{Reason: fmt.Sprintf("private or loopback address %s is not allowed", ip.String())}
		}
	}

	return nil
}

func isBlockedIP(ip net.IP) bool {
	if ip == nil {
		return true
	}
	ip = ip.To4()
	if ip == nil {
		// IPv6
		return ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast()
	}
	// IPv4: 127.x, 10.x, 172.16-31.x, 192.168.x, 169.254.x
	return ip.IsLoopback() ||
		ip.IsPrivate() ||
		ip.IsLinkLocalUnicast()
}
