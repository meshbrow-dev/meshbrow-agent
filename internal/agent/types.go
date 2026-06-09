package agent

import "time"

// Message is sent from agent to host.
type Message struct {
	Type      string                 `json:"type"`
	SessionID string                 `json:"session_id"`
	Payload   interface{}            `json:"payload,omitempty"`
	RequestID string                 `json:"request_id,omitempty"`
	Timestamp time.Time              `json:"timestamp"`
}

// Command is received from host.
type Command struct {
	ID      string                 `json:"id"`
	Type    string                 `json:"type"`
	Payload map[string]interface{} `json:"payload,omitempty"`
}

// HealthStatus represents the current health of the browser session.
type HealthStatus struct {
	Status       string  `json:"status"` // healthy, degraded, unhealthy
	BrowserAlive bool    `json:"browser_alive"`
	CPUPercent   float64 `json:"cpu_percent"`
	MemoryMB     float64 `json:"memory_mb"`
	Uptime       float64 `json:"uptime_seconds"`
	PID          int     `json:"pid"`
}

// Metrics represents collected system metrics.
type Metrics struct {
	CPUPercent    float64 `json:"cpu_percent"`
	MemoryUsedMB float64 `json:"memory_used_mb"`
	MemoryTotalMB float64 `json:"memory_total_mb"`
	DiskUsedMB   float64 `json:"disk_used_mb"`
	DiskTotalMB  float64 `json:"disk_total_mb"`
	NetworkRxMB  float64 `json:"network_rx_mb"`
	NetworkTxMB  float64 `json:"network_tx_mb"`
	OpenFiles    int     `json:"open_files"`
	Goroutines   int     `json:"goroutines"`
}

// FileEvent represents a filesystem change.
type FileEvent struct {
	Path      string `json:"path"`
	Operation string `json:"operation"` // create, modify, delete, rename
	IsDir     bool   `json:"is_dir"`
}
