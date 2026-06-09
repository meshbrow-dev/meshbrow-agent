# meshbrow-agent

The Meshbrow Browser Agent runs alongside each browser session to provide:

- Health reporting & heartbeat
- Browser process supervision
- Metrics collection (CPU, memory, disk, network)
- File system watching (session workspace changes)
- Graceful shutdown coordination

It communicates with the Meshbrow host over a unix socket.

## Installation

```bash
# Pre-built binary
curl -fsSL https://github.com/meshbrow-dev/meshbrow-agent/releases/latest/download/meshbrow-agent-linux-amd64 -o /usr/local/bin/meshbrow-agent
chmod +x /usr/local/bin/meshbrow-agent

# From source
go install github.com/meshbrow-dev/meshbrow-agent@latest

# Docker
docker pull ghcr.io/meshbrow-dev/meshbrow-agent:latest
```

## Usage

The agent starts automatically alongside Meshbrow browser sessions. For custom setups:

```bash
meshbrow-agent \
  --session-id sess_abc123 \
  --socket /run/meshbrow/agent.sock \
  --workspace /tmp/meshbrow-session \
  --log-level info
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MESHBROW_SESSION_ID` | (required) | Browser session ID |
| `MESHBROW_SOCKET` | `/run/meshbrow/agent.sock` | Communication socket path |
| `MESHBROW_WORKSPACE` | `/tmp/meshbrow-session` | Session workspace directory |
| `MESHBROW_LOG_LEVEL` | `info` | Log level (debug, info, warn, error) |
| `MESHBROW_HEARTBEAT_INTERVAL` | `5s` | Heartbeat reporting interval |
| `MESHBROW_METRICS_INTERVAL` | `10s` | Metrics collection interval |

## Architecture

```
┌──────────────────────────────────────────────────┐
│ Network Namespace / Firecracker VM               │
│                                                  │
│  ┌──────────────────────────────────────┐       │
│  │         meshbrow-agent                │       │
│  │                                       │       │
│  │  ┌───────────┐  ┌────────────────┐  │       │
│  │  │ FS Watcher │  │ Health/HB      │  │       │
│  │  └───────────┘  └────────────────┘  │       │
│  │  ┌───────────┐  ┌────────────────┐  │       │
│  │  │ Metrics   │  │ Process Mgr    │  │       │
│  │  └───────────┘  └────────────────┘  │       │
│  └──────────────────────────────────────┘       │
│           │ unix socket                          │
│           │                                      │
│  ┌────────┴─────────────────────────────┐       │
│  │         chromium (headless)            │       │
│  └───────────────────────────────────────┘       │
└──────────┼───────────────────────────────────────┘
           │
   ┌───────┴───────┐
   │ Meshbrow Host │
   │   (browserd)  │
   └───────────────┘
```

## Building

```bash
# Native
go build -o meshbrow-agent ./cmd/agent

# Linux AMD64 (for containers/VMs)
GOOS=linux GOARCH=amd64 go build -o meshbrow-agent ./cmd/agent

# Minimal static binary
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags="-s -w" -o meshbrow-agent ./cmd/agent
```

## Development

```bash
# Run tests
go test ./...

# Run with race detector
go test -race ./...

# Lint
golangci-lint run
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

MIT — see [LICENSE](LICENSE).
