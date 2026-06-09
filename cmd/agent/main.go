package main

import (
	"flag"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	"github.com/meshbrow-dev/meshbrow-agent/internal/agent"
)

var (
	Version = "dev"
	Commit  = "none"
	Date    = "unknown"
)

func main() {
	socketPath := flag.String("socket", "/run/meshbrow/agent.sock", "Communication socket path")
	sessionID := flag.String("session-id", "", "Browser session ID")
	workspace := flag.String("workspace", "/tmp/meshbrow-session", "Session workspace directory")
	logLevel := flag.String("log-level", "info", "Log level: debug, info, warn, error")
	heartbeatInterval := flag.String("heartbeat-interval", "5s", "Heartbeat reporting interval")
	metricsInterval := flag.String("metrics-interval", "10s", "Metrics collection interval")
	version := flag.Bool("version", false, "Print version and exit")
	flag.Parse()

	if *version {
		fmt.Printf("meshbrow-agent %s\n  commit: %s\n  built:  %s\n", Version, Commit, Date)
		os.Exit(0)
	}

	// Configure logging
	var level slog.Level
	switch *logLevel {
	case "debug":
		level = slog.LevelDebug
	case "warn":
		level = slog.LevelWarn
	case "error":
		level = slog.LevelError
	default:
		level = slog.LevelInfo
	}
	logger := slog.New(slog.NewJSONHandler(os.Stderr, &slog.HandlerOptions{Level: level}))
	slog.SetDefault(logger)

	// Resolve session ID
	sid := *sessionID
	if sid == "" {
		sid = os.Getenv("MESHBROW_SESSION_ID")
	}
	if sid == "" {
		slog.Error("session ID is required (flag --session-id or MESHBROW_SESSION_ID)")
		os.Exit(1)
	}

	// Resolve socket path from env
	sock := *socketPath
	if envSock := os.Getenv("MESHBROW_SOCKET"); envSock != "" {
		sock = envSock
	}

	cfg := agent.Config{
		SessionID:         sid,
		SocketPath:        sock,
		Workspace:         *workspace,
		HeartbeatInterval: *heartbeatInterval,
		MetricsInterval:   *metricsInterval,
		LogLevel:          *logLevel,
	}

	a, err := agent.New(cfg)
	if err != nil {
		slog.Error("failed to create agent", "error", err)
		os.Exit(1)
	}

	// Handle graceful shutdown
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGTERM, syscall.SIGINT)

	go func() {
		sig := <-sigCh
		slog.Info("received signal, shutting down", "signal", sig)
		a.Shutdown()
	}()

	slog.Info("starting meshbrow-agent",
		"session_id", sid,
		"socket", sock,
		"workspace", *workspace,
		"version", Version,
	)

	if err := a.Run(); err != nil {
		slog.Error("agent error", "error", err)
		os.Exit(1)
	}
}
