package agent

import (
	"fmt"
	"os"
	"time"
)

// HealthReporter checks browser session health.
type HealthReporter struct {
	sessionID string
	interval  time.Duration
	startTime time.Time
}

// NewHealthReporter creates a new health reporter.
func NewHealthReporter(sessionID string, interval time.Duration) *HealthReporter {
	return &HealthReporter{
		sessionID: sessionID,
		interval:  interval,
		startTime: time.Now(),
	}
}

// Check returns the current health status.
func (h *HealthReporter) Check() HealthStatus {
	status := HealthStatus{
		Status:       "healthy",
		BrowserAlive: h.isBrowserAlive(),
		Uptime:       time.Since(h.startTime).Seconds(),
		PID:          os.Getpid(),
	}

	if !status.BrowserAlive {
		status.Status = "unhealthy"
	}

	return status
}

// isBrowserAlive checks if the Chromium process is still running.
func (h *HealthReporter) isBrowserAlive() bool {
	// Check for chrome/chromium process via /proc
	entries, err := os.ReadDir("/proc")
	if err != nil {
		// Not on Linux, fallback to checking if a known PID file exists
		return h.checkPIDFile()
	}

	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		cmdline, err := os.ReadFile(fmt.Sprintf("/proc/%s/cmdline", entry.Name()))
		if err != nil {
			continue
		}
		cmd := string(cmdline)
		if len(cmd) > 0 && (contains(cmd, "chrome") || contains(cmd, "chromium")) {
			return true
		}
	}
	return false
}

func (h *HealthReporter) checkPIDFile() bool {
	pidFile := "/run/meshbrow/browser.pid"
	data, err := os.ReadFile(pidFile)
	if err != nil {
		return false
	}
	// Check if the PID is still running
	var pid int
	if _, err := fmt.Sscanf(string(data), "%d", &pid); err != nil {
		return false
	}
	proc, err := os.FindProcess(pid)
	if err != nil {
		return false
	}
	// Signal 0 checks if process exists
	return proc.Signal(nil) == nil
}

func contains(s, substr string) bool {
	return len(s) >= len(substr) && searchString(s, substr)
}

func searchString(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}
