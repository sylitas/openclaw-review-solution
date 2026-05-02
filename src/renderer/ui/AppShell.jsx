import React, { useState } from 'react';
import SlideUp from './SlideUp';
import {
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronDown,
  Copy,
  FileCode2,
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
              <div id="inline-editor" className="inline-editor hidden">
                <div className="slide-backdrop" id="inline-editor-backdrop"></div>
                <div className="slide-panel" role="dialog" aria-modal="true">
                  <div className="slide-panel-header">
                    <div id="inline-editor-title" className="slide-panel-title">Edit note</div>
                    <button id="inline-editor-close" className="tool-btn" aria-label="Close inline editor">✕</button>
                  </div>
                  <div className="slide-panel-body">
                    <textarea
                      id="inline-editor-input"
                      rows="4"
                      placeholder="Write note directly on design..."
                    />
                    <div className="inline-editor-actions">
                      <button id="inline-editor-save" className="tool-btn" type="button">Save</button>
                      <button id="inline-editor-cancel" className="tool-btn" type="button">Cancel</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <aside className="review-panel">
          <section id="generated-files" className="inspector-card generated-files-card">
            <div className="artifact-dropdown artifact-dropdown-single">
              <button
                id="artifact-picker-toggle"
                className="tool-btn artifact-picker-toggle artifact-picker-toggle-single"
                type="button"
                aria-label="Open artifact list"
                aria-haspopup="menu"
                aria-expanded="false"
              >
                <div className="artifact-picker-single-main">
                  <span id="artifact-picker-current" className="hidden">No artifact selected</span>
                  <div className="current-artifact-title-row current-artifact-title-row-single">
                    <FileCode2 aria-hidden="true" />
                    <div className="current-artifact-copy">
                      <div id="current-artifact-title" className="current-artifact-title">No active artifact</div>
                      <div id="current-artifact-meta" className="current-artifact-meta">Waiting for request…</div>
                    </div>
                  </div>
                </div>
                <ChevronDown className="draw-tool-chevron" aria-hidden="true" />
              </button>

              <div
                id="artifact-picker-menu"
                className="popover-card artifact-picker-menu hidden"
                role="menu"
                aria-label="Artifact files"
              >
                <div id="generated-files-empty" className="inspector-empty artifact-picker-empty">
                  No generated files yet.
                </div>
                <div id="generated-files-list" className="generated-files-list hidden" />
              </div>
            </div>
          </section>


          <section className="inspector-card review-actions-card">
            <div className="inspector-title">Review action</div>
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
          </section>
        </aside>
      </main>
    </div>
  );
}
