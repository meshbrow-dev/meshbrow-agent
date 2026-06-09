package agent

import (
	"os"
	"runtime"
	"time"

	"github.com/shirou/gopsutil/v3/cpu"
	"github.com/shirou/gopsutil/v3/disk"
	"github.com/shirou/gopsutil/v3/mem"
	"github.com/shirou/gopsutil/v3/net"
)

// MetricsCollector gathers system metrics.
type MetricsCollector struct {
	sessionID string
	startTime time.Time
}

// NewMetricsCollector creates a new metrics collector.
func NewMetricsCollector(sessionID string) *MetricsCollector {
	return &MetricsCollector{
		sessionID: sessionID,
		startTime: time.Now(),
	}
}

// Collect gathers current system metrics.
func (m *MetricsCollector) Collect() Metrics {
	metrics := Metrics{
		Goroutines: runtime.NumGoroutine(),
	}

	// CPU
	cpuPercent, err := cpu.Percent(0, false)
	if err == nil && len(cpuPercent) > 0 {
		metrics.CPUPercent = cpuPercent[0]
	}

	// Memory
	vmem, err := mem.VirtualMemory()
	if err == nil {
		metrics.MemoryUsedMB = float64(vmem.Used) / 1024 / 1024
		metrics.MemoryTotalMB = float64(vmem.Total) / 1024 / 1024
	}

	// Disk
	usage, err := disk.Usage("/")
	if err == nil {
		metrics.DiskUsedMB = float64(usage.Used) / 1024 / 1024
		metrics.DiskTotalMB = float64(usage.Total) / 1024 / 1024
	}

	// Network
	netIO, err := net.IOCounters(false)
	if err == nil && len(netIO) > 0 {
		metrics.NetworkRxMB = float64(netIO[0].BytesRecv) / 1024 / 1024
		metrics.NetworkTxMB = float64(netIO[0].BytesSent) / 1024 / 1024
	}

	// Open files (Linux)
	if entries, err := os.ReadDir("/proc/self/fd"); err == nil {
		metrics.OpenFiles = len(entries)
	}

	return metrics
}
