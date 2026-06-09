package agent

import (
	"context"
	"log/slog"
	"os"
	"path/filepath"
	"time"
)

// FileWatcher monitors a workspace directory for changes.
type FileWatcher struct {
	workspace string
	known     map[string]time.Time
}

// NewFileWatcher creates a new file watcher for the workspace.
func NewFileWatcher(workspace string) *FileWatcher {
	return &FileWatcher{
		workspace: workspace,
		known:     make(map[string]time.Time),
	}
}

// Watch starts watching the workspace and emits FileEvents.
func (fw *FileWatcher) Watch(ctx context.Context) <-chan FileEvent {
	events := make(chan FileEvent, 100)

	go func() {
		defer close(events)

		// Initial scan
		fw.scan(events)

		ticker := time.NewTicker(2 * time.Second)
		defer ticker.Stop()

		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				fw.scan(events)
			}
		}
	}()

	return events
}

func (fw *FileWatcher) scan(events chan<- FileEvent) {
	current := make(map[string]time.Time)

	err := filepath.Walk(fw.workspace, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil
		}
		// Skip hidden dirs and common noise
		name := info.Name()
		if info.IsDir() && (name == ".git" || name == "node_modules" || name == "__pycache__") {
			return filepath.SkipDir
		}

		relPath, _ := filepath.Rel(fw.workspace, path)
		current[relPath] = info.ModTime()

		if prevMod, exists := fw.known[relPath]; !exists {
			// New file
			select {
			case events <- FileEvent{Path: relPath, Operation: "create", IsDir: info.IsDir()}:
			default:
			}
		} else if info.ModTime().After(prevMod) {
			// Modified
			select {
			case events <- FileEvent{Path: relPath, Operation: "modify", IsDir: info.IsDir()}:
			default:
			}
		}

		return nil
	})
	if err != nil {
		slog.Warn("file watcher scan error", "error", err)
	}

	// Check for deletions
	for path := range fw.known {
		if _, exists := current[path]; !exists {
			select {
			case events <- FileEvent{Path: path, Operation: "delete", IsDir: false}:
			default:
			}
		}
	}

	fw.known = current
}
