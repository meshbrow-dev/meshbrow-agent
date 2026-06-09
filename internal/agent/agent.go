package agent

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net"
	"os"
	"sync"
	"time"
)

// Config holds agent configuration.
type Config struct {
	SessionID         string
	SocketPath        string
	Workspace         string
	HeartbeatInterval string
	MetricsInterval   string
	LogLevel          string
}

// Agent runs alongside a browser session providing health monitoring,
// process supervision, and metrics collection.
type Agent struct {
	cfg      Config
	conn     net.Conn
	metrics  *MetricsCollector
	health   *HealthReporter
	watcher  *FileWatcher
	cancel   context.CancelFunc
	ctx      context.Context
	wg       sync.WaitGroup
	shutdown chan struct{}
}

// New creates a new Agent instance.
func New(cfg Config) (*Agent, error) {
	ctx, cancel := context.WithCancel(context.Background())

	// Ensure workspace exists
	if err := os.MkdirAll(cfg.Workspace, 0o755); err != nil {
		cancel()
		return nil, fmt.Errorf("creating workspace: %w", err)
	}

	return &Agent{
		cfg:      cfg,
		ctx:      ctx,
		cancel:   cancel,
		shutdown: make(chan struct{}),
	}, nil
}

// Run starts the agent's main loop.
func (a *Agent) Run() error {
	// Connect to host
	conn, err := net.Dial("unix", a.cfg.SocketPath)
	if err != nil {
		return fmt.Errorf("connecting to host socket: %w", err)
	}
	a.conn = conn
	defer conn.Close()

	// Parse intervals
	heartbeatInterval, err := time.ParseDuration(a.cfg.HeartbeatInterval)
	if err != nil {
		return fmt.Errorf("parsing heartbeat interval: %w", err)
	}
	metricsInterval, err := time.ParseDuration(a.cfg.MetricsInterval)
	if err != nil {
		return fmt.Errorf("parsing metrics interval: %w", err)
	}

	// Start subsystems
	a.metrics = NewMetricsCollector(a.cfg.SessionID)
	a.health = NewHealthReporter(a.cfg.SessionID, heartbeatInterval)
	a.watcher = NewFileWatcher(a.cfg.Workspace)

	// Send initial registration
	if err := a.sendMessage(Message{
		Type:      "register",
		SessionID: a.cfg.SessionID,
		Payload: map[string]interface{}{
			"version":   "agent/1.0",
			"workspace": a.cfg.Workspace,
			"pid":       os.Getpid(),
		},
	}); err != nil {
		return fmt.Errorf("sending registration: %w", err)
	}

	// Start heartbeat
	a.wg.Add(1)
	go func() {
		defer a.wg.Done()
		a.runHeartbeat(heartbeatInterval)
	}()

	// Start metrics collection
	a.wg.Add(1)
	go func() {
		defer a.wg.Done()
		a.runMetrics(metricsInterval)
	}()

	// Start file watcher
	a.wg.Add(1)
	go func() {
		defer a.wg.Done()
		a.runFileWatcher()
	}()

	// Start command listener
	a.wg.Add(1)
	go func() {
		defer a.wg.Done()
		a.listenCommands()
	}()

	// Wait for shutdown
	<-a.ctx.Done()
	a.wg.Wait()

	// Send deregistration
	_ = a.sendMessage(Message{
		Type:      "deregister",
		SessionID: a.cfg.SessionID,
		Payload:   map[string]interface{}{"reason": "shutdown"},
	})

	slog.Info("agent stopped", "session_id", a.cfg.SessionID)
	return nil
}

// Shutdown gracefully stops the agent.
func (a *Agent) Shutdown() {
	a.cancel()
}

func (a *Agent) runHeartbeat(interval time.Duration) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-a.ctx.Done():
			return
		case <-ticker.C:
			status := a.health.Check()
			if err := a.sendMessage(Message{
				Type:      "heartbeat",
				SessionID: a.cfg.SessionID,
				Payload:   status,
			}); err != nil {
				slog.Warn("failed to send heartbeat", "error", err)
			}
		}
	}
}

func (a *Agent) runMetrics(interval time.Duration) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-a.ctx.Done():
			return
		case <-ticker.C:
			m := a.metrics.Collect()
			if err := a.sendMessage(Message{
				Type:      "metrics",
				SessionID: a.cfg.SessionID,
				Payload:   m,
			}); err != nil {
				slog.Warn("failed to send metrics", "error", err)
			}
		}
	}
}

func (a *Agent) runFileWatcher() {
	events := a.watcher.Watch(a.ctx)
	for event := range events {
		if err := a.sendMessage(Message{
			Type:      "fs_event",
			SessionID: a.cfg.SessionID,
			Payload:   event,
		}); err != nil {
			slog.Warn("failed to send fs event", "error", err)
		}
	}
}

func (a *Agent) listenCommands() {
	decoder := json.NewDecoder(a.conn)
	for {
		select {
		case <-a.ctx.Done():
			return
		default:
		}

		var cmd Command
		if err := decoder.Decode(&cmd); err != nil {
			if a.ctx.Err() != nil {
				return
			}
			slog.Warn("failed to decode command", "error", err)
			continue
		}

		a.handleCommand(cmd)
	}
}

func (a *Agent) handleCommand(cmd Command) {
	slog.Debug("received command", "type", cmd.Type, "id", cmd.ID)

	switch cmd.Type {
	case "shutdown":
		slog.Info("received shutdown command")
		a.Shutdown()
	case "health_check":
		status := a.health.Check()
		_ = a.sendMessage(Message{
			Type:      "health_response",
			SessionID: a.cfg.SessionID,
			Payload:   status,
			RequestID: cmd.ID,
		})
	case "collect_metrics":
		m := a.metrics.Collect()
		_ = a.sendMessage(Message{
			Type:      "metrics_response",
			SessionID: a.cfg.SessionID,
			Payload:   m,
			RequestID: cmd.ID,
		})
	default:
		slog.Warn("unknown command type", "type", cmd.Type)
	}
}

func (a *Agent) sendMessage(msg Message) error {
	msg.Timestamp = time.Now().UTC()
	data, err := json.Marshal(msg)
	if err != nil {
		return fmt.Errorf("marshaling message: %w", err)
	}
	data = append(data, '\n')
	_, err = a.conn.Write(data)
	return err
}
