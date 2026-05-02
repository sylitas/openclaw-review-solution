import React from 'react';
import {
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronDown,
  Copy,
  Info,
  Minus,
  MousePointer2,
  PencilLine,
  Plus,
  RotateCcw,
  Square,
  Trash2,
  Type,
  X,
} from 'lucide-react';

const toolbarTools = [
  { key: 'select', title: 'Select', label: 'Select', icon: MousePointer2 },
  { key: 'rect', title: 'Rectangle', label: 'Rectangle', icon: Square },
  { key: 'arrow', title: 'Arrow', label: 'Arrow', icon: ArrowUpRight },
  { key: 'text', title: 'Text', label: 'Text', icon: Type },
];

function ToolbarButton({
  id,
  title,
  label,
  icon: Icon,
  className = '',
  dataTool,
}) {
  return (
    <button
      id={id}
      className={`tool-btn icon-btn ${className}`.trim()}
      type="button"
      aria-label={label}
      {...(dataTool ? { 'data-tool': dataTool } : {})}
    >
      <Icon aria-hidden="true" />
    </button>
  );
}

export function AppShell() {
  return (
    <div className="shell">
      <header className="topbar">
        <div className="topbar-copy">
          <p className="eyebrow">OpenClaw Review Solution</p>
          <h1 id="title">Loading review…</h1>
          <p id="prompt" className="prompt" />
        </div>

        <div className="topbar-actions">
          <div className="popover-group">
            <button
              id="status-info-toggle"
              className="tool-btn icon-btn topbar-icon-btn"
              type="button"
              aria-label="Show review status"
              aria-expanded="false"
            >
              <Info aria-hidden="true" />
            </button>

            <div id="status-popover" className="popover-card hidden">
              <div className="popover-section">
                <div className="popover-section-title">Artifact</div>
                <div className="popover-row">
                  Type: <strong id="artifact-type">UNKNOWN</strong>
                </div>
              </div>
              <div className="popover-divider" />
              <div className="popover-section">
                <div className="popover-section-title">Connection</div>
                <div className="status-grid">
                  <div
                    id="daemon-connection-state"
                    className="status-pill status-pill-neutral"
                  >
                    Daemon: checking…
                  </div>
                  <div
                    id="session-mode-state"
                    className="status-pill status-pill-neutral"
                  >
                    Session: booting
                  </div>
                </div>
              </div>
              <div className="popover-divider" />
              <div className="popover-section">
                <div className="popover-section-title">Queue</div>
                <div className="popover-row" id="queue-state">
                  Queued: 0
                </div>
                <div className="popover-row" id="request-state">
                  Request: none
                </div>
              </div>
              <div className="popover-divider" />
              <div className="popover-section">
                <div id="daemon-message" className="daemon-message">
                  Checking daemon status…
                </div>
              </div>
            </div>
          </div>

          <div className="popover-group">
            <button
              id="help-info-toggle"
              className="tool-btn icon-btn topbar-icon-btn"
              type="button"
              aria-label="Show app help"
              aria-expanded="false"
            >
              <BookOpen aria-hidden="true" />
            </button>

            <div
              id="help-popover"
              className="popover-card help-popover-card hidden"
            >
              <div className="popover-section">
                <div className="popover-section-title">Canvas</div>
                <div className="popover-row" id="selection-state">
                  Selected: none
                </div>
                <div className="popover-row" id="annotation-count">
                  Annotations: 0
                </div>
                <div className="popover-row" id="active-tool">
                  Tool: rect
                </div>
                <div className="popover-row" id="zoom-state">
                  Zoom: 100%
                </div>
                <div className="popover-row" id="artifact-box-state">
                  Artifact box: unavailable
                </div>
              </div>
              <div className="popover-divider" />
              <div className="popover-section">
                <div className="popover-section-title">Keyboard shortcuts</div>
                <div className="popover-row">
                  <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> <kbd>4</kbd> — Switch
                  tool
                </div>
                <div className="popover-row">
                  <kbd>Cmd+Z</kbd> — Undo
                </div>
                <div className="popover-row">
                  <kbd>Cmd+D</kbd> — Duplicate
                </div>
                <div className="popover-row">
                  <kbd>Delete</kbd> — Remove
                </div>
                <div className="popover-row">
                  <kbd>+</kbd> <kbd>-</kbd> <kbd>0</kbd> — Zoom
                </div>
              </div>
              <div className="popover-divider" />
              <div className="popover-section">
                <div className="popover-section-title">Tips</div>
                <div className="popover-row">
                  Hold <kbd>Space</kbd> and drag to pan.
                </div>
                <div className="popover-row">
                  Hold <kbd>Cmd</kbd> + scroll to zoom around cursor.
                </div>
                <div className="popover-row">
                  Selected rects/arrows expose handles for resize and endpoint
                  editing.
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="content">
        <section className="viewer-panel">
          <div className="toolbar">
            <div id="draw-tool-group" className="popover-group tool-dropdown">
              <button
                id="draw-tool-toggle"
                className="tool-btn draw-tool-btn"
                type="button"
                aria-label="Drawing tools"
                aria-haspopup="menu"
                aria-expanded="false"
              >
                <span className="draw-tool-current-icon">
                  {toolbarTools.map(({ key, icon: Icon }) => (
                    <span
                      key={key}
                      data-active-tool-icon={key}
                      className={`draw-tool-active-icon${key === 'select' ? '' : ' hidden'}`}
                    >
                      <Icon aria-hidden="true" />
                    </span>
                  ))}
                </span>
                <ChevronDown className="draw-tool-chevron" aria-hidden="true" />
              </button>

              <div
                id="draw-tool-menu"
                className="popover-card tool-menu hidden"
                role="menu"
                aria-label="Drawing tools"
              >
                <div className="tool-menu-list">
                  {toolbarTools.map(({ key, title, label, icon: Icon }) => (
                    <button
                      key={key}
                      type="button"
                      className={`tool-option${key === 'select' ? ' is-active' : ''}`}
                      role="menuitemradio"
                      aria-checked={key === 'select' ? 'true' : 'false'}
                      data-tool={key}
                    >
                      <Icon aria-hidden="true" />
                      <span>{label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <ToolbarButton
              id="undo-annotation"
              title="Undo"
              label="Undo"
              icon={RotateCcw}
            />
            <ToolbarButton
              id="duplicate-selected"
              title="Duplicate selected"
              label="Duplicate selected"
              icon={Copy}
            />
            <ToolbarButton
              id="delete-or-clear"
              title="Delete selected or clear all"
              label="Delete selected or clear all"
              icon={Trash2}
              className="tool-btn-danger"
            />

            <div className="toolbar-spacer" />

            <div className="zoom-controls">
              <ToolbarButton
                id="zoom-out"
                title="Zoom out"
                label="Zoom out"
                icon={Minus}
              />
              <div className="zoom-level" id="zoom-level">
                100%
              </div>
              <ToolbarButton
                id="zoom-in"
                title="Zoom in"
                label="Zoom in"
                icon={Plus}
              />
              <ToolbarButton
                id="zoom-reset"
                title="Reset zoom"
                label="Reset zoom"
                icon={RotateCcw}
              />
            </div>
          </div>

          <div id="viewer" className="viewer">
            <div id="viewer-stage" className="viewer-stage">
              <div id="artifact-host" className="artifact-host" />
              <svg id="annotation-layer" className="annotation-layer" />
            </div>
          </div>
        </section>

        <aside className="review-panel">
          <section
            id="annotation-inspector"
            className="inspector-card is-empty"
          >
            <div className="inspector-title">Selected annotation</div>
            <div id="inspector-empty" className="inspector-empty">
              Select an annotation to edit its metadata here.
            </div>
            <div id="inspector-content" className="inspector-content hidden">
              <div id="inspector-type" className="inspector-type" />
              <label className="field field-grow">
                <span id="inspector-label">Label / note</span>
                <textarea
                  id="annotation-meta-input"
                  rows="5"
                  placeholder="Write note or text here..."
                />
              </label>
            </div>
          </section>

          <div className="review-footer">
            <label className="field">
              <span>Review note</span>
              <textarea
                id="message"
                rows="6"
                placeholder="Write your decision or change request here..."
              />
            </label>

            <div className="actions">
              <button
                id="approve"
                className="tool-btn icon-btn action-icon-btn action-success"
                type="button"
                aria-label="Approve"
              >
                <Check aria-hidden="true" />
              </button>
              <button
                id="changes"
                className="tool-btn icon-btn action-icon-btn action-primary"
                type="button"
                aria-label="Request changes"
              >
                <PencilLine aria-hidden="true" />
              </button>
              <button
                id="cancel"
                className="tool-btn icon-btn action-icon-btn action-secondary"
                type="button"
                aria-label="Cancel"
              >
                <X aria-hidden="true" />
              </button>
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
}
