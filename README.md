# OpenClaw Review Solution

Local review loop tool for OpenClaw agents on macOS. Lets an AI agent render visual artifacts (Mermaid diagrams, HTML, images) and present them to a human for approval, change requests, or cancellation — all through a local Electron UI.

## Architecture

```
CLI (review.js) → Daemon (reviewd) → Electron UI → Human Decision → JSON Result → Agent
```

- **CLI** — Entry point for agents. Submits review requests and polls for results.
- **Daemon** — HTTP server on `127.0.0.1:43129` that manages a request queue and launches the Electron window.
- **Electron UI** — Renders Mermaid/HTML/image artifacts with annotation tools (draw, text, arrows). Human can approve, request changes, or cancel.

## Prerequisites

- **Node.js** ≥ 18
- **macOS** (Electron UI requires a display)
- **PM2** (bundled as devDependency, used for daemon management)

## Setup

```bash
# Clone
git clone https://github.com/sylitas/openclaw-review-solution.git
cd openclaw-review-solution

# Install dependencies
npm install
```

The daemon auto-starts via PM2 when the CLI sends its first request. No manual startup needed.

### Manual daemon management (optional)

```bash
# Start
npm run daemon:pm2:start

# Restart
npm run daemon:pm2:restart

# Stop
npm run daemon:pm2:stop

# View logs
npm run daemon:pm2:logs
```

### Environment variables (optional)

| Variable | Default | Description |
|---|---|---|
| `REVIEWD_HOST` | `127.0.0.1` | Daemon bind address |
| `REVIEWD_PORT` | `43129` | Daemon port |
| `REVIEWD_POLL_MS` | `750` | CLI poll interval (ms) |

## CLI Usage

### Open an image for review

```bash
node src/cli/review.js open /path/to/file.png --title "Screenshot" --prompt "Check this layout"
```

### Render Mermaid from file

```bash
node src/cli/review.js render --format mermaid --title "System View" --prompt "Review the architecture" < diagram.mmd
```

### Render HTML from file

```bash
node src/cli/review.js render --format html --title "Component Preview" --prompt "Review this page" < page.html
```

### Render Mermaid from stdin (pipe)

```bash
echo 'flowchart TD
  A[Agent] --> B[Review]
  B --> C{Decision}' | node src/cli/review.js render --format mermaid --title "Quick diagram"
```

### Result

The CLI outputs a JSON result to stdout and exits with:

| Exit code | Meaning |
|---|---|
| `0` | Approved |
| `1` | Failed |
| `3` | Cancelled |

Result JSON includes the human's decision (`approved`, `changes_requested`, `cancelled`, `failed`) and any annotations (drawings, text notes) made on the artifact.

## OpenClaw Integration

### MEMORY.md

Add the following rule to your `MEMORY.md` (or equivalent long-term memory file) so the agent knows how to handle review results:

```markdown
## Review app workflow

- Khi mở review app bằng CLI (`review open` / `review render`), CLI chạy background và chờ user action
- Khi CLI hoàn tất (exec completed), mình **phải đọc result JSON ngay** và **chủ động gửi message cho user** (dùng message tool), không chờ user gửi tin nhắn hỏi:
  - `approved` + có annotation → đọc annotation text + message, thực hiện theo yêu cầu ngay, báo lại user
  - `approved` không annotation → confirm và tiếp tục flow, báo lại user
  - `changes_requested` → đọc feedback, sửa artifact, mở lại review, báo lại user
  - `cancelled` → dừng task, báo lại user
  - `failed` → báo lỗi cho user
- **Không được NO_REPLY** khi nhận exec completed từ review CLI — đây là user action, phải phản ứng
- **Phải chủ động gửi message** cho user ngay khi nhận result, không chờ user gửi tin nhắn hỏi
- Annotation text là chỉ dẫn/yêu cầu từ user, treat như message trực tiếp
```

### SKILL.md

To register as an OpenClaw skill, create a `SKILL.md` in your skills directory (e.g. `~/.openclaw/workspace/skills/openclaw-review-view/SKILL.md`) with frontmatter:

```yaml
---
name: openclaw-review-view
description: >
  Create project views, system views, design views, architecture diagrams,
  component maps, and visual repo walkthroughs using the local OpenClaw Review
  Solution. Use when the user asks for "view dự án", architecture overview,
  system diagram, or wants a visual artifact opened for review/iteration.
---
```

Key sections to include in the skill body:

1. **Core workflow** — Steps from identifying the target repo → drafting artifact → opening in review tool → handling result.
2. **Review tool commands** — The CLI commands (`review open`, `review render`) with full paths.
3. **Result handling** — Mandate that the agent reads the JSON result immediately and acts on it (approve/changes/cancel).
4. **Default output format** — Prefer Mermaid for architecture/flow diagrams, HTML only when Mermaid is limiting.
5. **Working conventions** — Where to store generated files, naming patterns, branch handling.

See the included `examples/` directory for sample Mermaid and HTML artifacts.

## Examples

```bash
# Review the sample Mermaid diagram
node src/cli/review.js render --format mermaid --title "Sample Flow" < examples/sample.mmd

# Review the sample HTML page
node src/cli/review.js open examples/sample.html --title "Sample HTML"
```

## Development

```bash
# Run Electron app directly (for UI development)
npm run dev

# Run daemon directly (without PM2)
npm run daemon

# Lint
npm run lint

# Format
npm run format
```

## License

Private — not published to npm.
