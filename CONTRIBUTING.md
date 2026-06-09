# Contributing to meshbrow-agent

## Development Setup

1. Install Go 1.23+
2. Clone the repo: `git clone https://github.com/meshbrow-dev/meshbrow-agent.git`
3. Install dependencies: `go mod download`
4. Run tests: `go test ./...`

## Code Style

- Follow standard Go conventions
- Use `golangci-lint run` before committing
- Write table-driven tests with `t.Run()`
- Use `slog` for structured logging

## Pull Requests

- Create feature branches from `main`
- Include tests for new functionality
- Keep commits focused and use conventional commit messages
- Ensure CI passes before requesting review

## Commit Messages

Use conventional commits:
- `feat:` New features
- `fix:` Bug fixes
- `docs:` Documentation changes
- `test:` Test additions/changes
- `chore:` Maintenance tasks
- `refactor:` Code refactoring
