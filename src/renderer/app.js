'use strict';

const SVG_NS = 'http://www.w3.org/2000/svg';
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 8;
const ZOOM_STEP = 0.1;
const WHEEL_ZOOM_STEP = 0.01;

const els = {
  title: document.getElementById('title'),
  prompt: document.getElementById('prompt'),
  artifactType: document.getElementById('artifact-type'),
  statusInfoToggle: document.getElementById('status-info-toggle'),
  statusPopover: document.getElementById('status-popover'),
  helpInfoToggle: document.getElementById('help-info-toggle'),
  helpPopover: document.getElementById('help-popover'),
  artifactHost: document.getElementById('artifact-host'),
  viewer: document.getElementById('viewer'),
  viewerStage: document.getElementById('viewer-stage'),
  annotationLayer: document.getElementById('annotation-layer'),
  message: document.getElementById('message'),
  approve: document.getElementById('approve'),
  changes: document.getElementById('changes'),
  cancel: document.getElementById('cancel'),
  undo: document.getElementById('undo-annotation'),
  duplicateSelected: document.getElementById('duplicate-selected'),
  deleteOrClear: document.getElementById('delete-or-clear'),
  zoomIn: document.getElementById('zoom-in'),
  zoomOut: document.getElementById('zoom-out'),
  zoomReset: document.getElementById('zoom-reset'),
  zoomLevel: document.getElementById('zoom-level'),
  zoomState: document.getElementById('zoom-state'),
  selectionState: document.getElementById('selection-state'),
  annotationCount: document.getElementById('annotation-count'),
  activeTool: document.getElementById('active-tool'),
  artifactBoxState: document.getElementById('artifact-box-state'),
  daemonConnectionState: document.getElementById('daemon-connection-state'),
  sessionModeState: document.getElementById('session-mode-state'),
  queueState: document.getElementById('queue-state'),
  requestState: document.getElementById('request-state'),
  daemonMessage: document.getElementById('daemon-message'),
  inspector: document.getElementById('annotation-inspector'),
  inspectorEmpty: document.getElementById('inspector-empty'),
  inspectorContent: document.getElementById('inspector-content'),
  inspectorType: document.getElementById('inspector-type'),
  inspectorLabel: document.getElementById('inspector-label'),
  inspectorInput: document.getElementById('annotation-meta-input'),
  toolButtons: Array.from(document.querySelectorAll('[data-tool]')),
};

let currentRequest = null;
let sessionPollTimer = null;
let actionsBound = false;
const state = {
  tool: 'rect',
  annotations: [],
  draft: null,
  stageRect: null,
  artifactMetrics: null,
  selectedAnnotationId: null,
  newlyCreatedTextId: null,
  dragging: null,
  panning: null,
  spacePan: false,
  zoom: 1,
  daemonConnected: false,
  queuedCount: 0,
  activeRequestId: null,
  uiRunning: false,
  daemonError: '',
  isSubmitting: false,
  statusPopoverOpen: false,
  helpPopoverOpen: false,
};

async function boot() {
  try {
    currentRequest = await window.reviewApp.getInitialRequest();
    state.daemonConnected = true;
    state.daemonError = '';
  } catch (error) {
    currentRequest = null;
    state.daemonConnected = false;
    state.daemonError = error.message || 'Unable to reach daemon.';
  }

  resetSessionState();
  renderRequest(currentRequest);

  if (!actionsBound) {
    bindActions();
    window.addEventListener('resize', onWindowResize);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    document.addEventListener('pointerdown', onDocumentPointerDown);
    actionsBound = true;
  }

  await refreshDaemonStatus();
  applyZoom(true);
  syncStageGeometry();
  syncArtifactMetrics();
  updateToolButtons();
  updateStatus();
  updateInspector();
  renderAnnotations();
  refreshVendorUi();
  startSessionPolling();
}

function resetSessionState() {
  state.annotations = [];
  state.draft = null;
  state.stageRect = null;
  state.artifactMetrics = null;
  state.selectedAnnotationId = null;
  state.newlyCreatedTextId = null;
  state.dragging = null;
  state.panning = null;
  state.spacePan = false;
  state.zoom = 1;
  state.isSubmitting = false;
  state.statusPopoverOpen = false;
  state.helpPopoverOpen = false;
  els.message.value = '';
  updateTopbarPopovers();
}

function refreshVendorUi() {
  if (typeof window.refreshLucideIcons === 'function') {
    window.refreshLucideIcons();
  }
}

function updateTopbarPopovers() {
  if (els.statusPopover) {
    els.statusPopover.classList.toggle('hidden', !state.statusPopoverOpen);
  }

  if (els.helpPopover) {
    els.helpPopover.classList.toggle('hidden', !state.helpPopoverOpen);
  }

  if (els.statusInfoToggle) {
    els.statusInfoToggle.setAttribute(
      'aria-expanded',
      state.statusPopoverOpen ? 'true' : 'false'
    );
  }

  if (els.helpInfoToggle) {
    els.helpInfoToggle.setAttribute(
      'aria-expanded',
      state.helpPopoverOpen ? 'true' : 'false'
    );
  }
}

function closeTopbarPopovers() {
  if (!state.statusPopoverOpen && !state.helpPopoverOpen) {
    return;
  }

  state.statusPopoverOpen = false;
  state.helpPopoverOpen = false;
  updateTopbarPopovers();
}

function onDocumentPointerDown(event) {
  if (!state.statusPopoverOpen && !state.helpPopoverOpen) {
    return;
  }

  const target = event.target;

  if (
    (els.statusInfoToggle && els.statusInfoToggle.contains(target)) ||
    (els.statusPopover && els.statusPopover.contains(target)) ||
    (els.helpInfoToggle && els.helpInfoToggle.contains(target)) ||
    (els.helpPopover && els.helpPopover.contains(target))
  ) {
    return;
  }

  closeTopbarPopovers();
}

function renderRequest(request) {
  if (!request) {
    els.title.textContent = 'Waiting for review request…';
    els.prompt.textContent = 'The review window is idle. Submit a request from the CLI and it will appear here automatically.';
    els.artifactType.textContent = 'IDLE';
    renderEmptyState('No active review request right now.');
    refreshVendorUi();
    return;
  }

  els.title.textContent = request.title || 'Untitled review';
  els.prompt.textContent = request.prompt || 'No review prompt provided.';
  els.artifactType.textContent = String(
    request.artifactType || 'unknown'
  ).toUpperCase();

  if (request.artifactType === 'image') {
    renderImage(request);
    return;
  }

  if (request.artifactType === 'html') {
    renderHtml(request);
    return;
  }

  if (request.artifactType === 'mermaid') {
    renderMermaid(request);
    return;
  }

  renderEmptyState(`Unsupported artifact type: ${request.artifactType}`);
  refreshVendorUi();
}

function renderImage(request) {
  setArtifactMode('image');

  const img = document.createElement('img');
  img.src = toFileUrl(request.sourcePath);
  img.alt = request.title || 'Review image';
  img.onload = onArtifactReady;

  resetArtifactHost();
  els.artifactHost.appendChild(img);
}

function renderHtml(request) {
  setArtifactMode('default');

  const iframe = document.createElement('iframe');
  iframe.setAttribute('sandbox', 'allow-scripts');
  iframe.srcdoc = request.inlineContent || '';
  iframe.onload = onArtifactReady;

  resetArtifactHost();
  els.artifactHost.appendChild(iframe);
}

function renderMermaid(request) {
  setArtifactMode('diagram');

  if (!request.mermaidScriptUrl) {
    renderEmptyState('Mermaid runtime path is missing.');
    return;
  }

  const host = document.createElement('div');
  host.className = 'mermaid-host';

  resetArtifactHost();
  els.artifactHost.appendChild(host);

  renderMermaidInIframe(host, request.inlineContent, request.mermaidScriptUrl);
}

function renderMermaidInIframe(host, source, mermaidScriptUrl) {
  var iframe = document.createElement('iframe');
  iframe.className = 'mermaid-iframe';
  iframe.setAttribute('sandbox', 'allow-scripts');
  iframe.style.border = 'none';
  iframe.style.width = '100%';
  iframe.style.minHeight = '400px';
  iframe.style.background = 'transparent';

  var escapedSource = (source || 'graph TD; A-->B;')
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/<\/script/gi, '<\\/script');

  var html = [
    '<!DOCTYPE html>',
    '<html><head>',
    '<style>',
    'html, body { margin: 0; padding: 0; background: transparent; overflow: hidden; }',
    '#diagram { display: flex; justify-content: center; align-items: flex-start; min-height: 100vh; padding: 24px; }',
    '#diagram svg { max-width: 100%; }',
    '</style>',
    '<script src="' + mermaidScriptUrl + '"><\/script>',
    '</head><body>',
    '<div id="diagram">Rendering\u2026</div>',
    '<script>',
    'async function render() {',
    '  try {',
    '    mermaid.initialize({ startOnLoad: false, theme: "dark", securityLevel: "strict" });',
    '    var result = await mermaid.render("mmd-" + Date.now(), `' + escapedSource + '`);',
    '    document.getElementById("diagram").innerHTML = result.svg;',
    '    var svg = document.querySelector("svg");',
    '    if (svg) {',
    '      var bbox = svg.getBBox();',
    '      if (bbox && bbox.width && bbox.height) {',
    '        var p = 24;',
    '        svg.setAttribute("viewBox", (bbox.x-p)+" "+(bbox.y-p)+" "+(bbox.width+p*2)+" "+(bbox.height+p*2));',
    '        svg.setAttribute("width", Math.ceil(bbox.width+p*2));',
    '        svg.setAttribute("height", Math.ceil(bbox.height+p*2));',
    '        svg.style.maxWidth = "none";',
    '      }',
    '      var h = svg.getAttribute("height") || svg.getBoundingClientRect().height;',
    '      parent.postMessage({ type: "mermaid-ready", width: svg.getAttribute("width"), height: h }, "*");',
    '    }',
    '  } catch (e) {',
    '    document.getElementById("diagram").textContent = "Mermaid error: " + e.message;',
    '    parent.postMessage({ type: "mermaid-error", message: e.message }, "*");',
    '  }',
    '}',
    'render();',
    '<\/script>',
    '</body></html>'
  ].join('\n');

  function onMessage(event) {
    if (!event.data || !event.data.type) {
      return;
    }

    if (event.data.type === 'mermaid-ready') {
      var h = parseInt(event.data.height, 10);
      if (h && h > 0) {
        iframe.style.height = (h + 48) + 'px';
      }

      window.removeEventListener('message', onMessage);
      onArtifactReady();
      return;
    }

    if (event.data.type === 'mermaid-error') {
      window.removeEventListener('message', onMessage);
      renderMermaidError(new Error(event.data.message || 'Unknown error'));
    }
  }

  window.addEventListener('message', onMessage);

  iframe.srcdoc = html;
  host.innerHTML = '';
  host.appendChild(iframe);
}


function renderMermaidError(error) {
  resetArtifactHost();

  const box = document.createElement('div');
  box.className = 'mermaid-error';
  box.textContent = `Mermaid render failed: ${error.message}`;

  els.artifactHost.appendChild(box);
}

function renderEmptyState(message) {
  setArtifactMode('default');
  resetArtifactHost();
  state.artifactMetrics = null;
  updateStatus();

  const box = document.createElement('div');
  box.className = 'empty-state';
  box.textContent = message;

  els.artifactHost.appendChild(box);
  refreshVendorUi();
}

function resetArtifactHost() {
  els.artifactHost.innerHTML = '';
}

function setArtifactMode(mode) {
  const isDiagram = mode === 'diagram';
  const isImage = mode === 'image';

  els.viewerStage.classList.toggle('is-diagram', isDiagram);
  els.viewerStage.classList.toggle('is-image', isImage);
  els.artifactHost.classList.toggle('is-diagram', isDiagram);
  els.artifactHost.classList.toggle('is-image', isImage);
}

function bindActions() {
  els.approve.addEventListener('click', function onApprove() {
    submit('approved');
  });

  els.changes.addEventListener('click', function onRequestChanges() {
    submit('changes_requested');
  });

  els.cancel.addEventListener('click', function onCancel() {
    submit('cancelled');
  });

  els.undo.addEventListener('click', function onUndo() {
    undoLastAnnotation();
  });

  els.duplicateSelected.addEventListener(
    'click',
    function onDuplicateSelected() {
      duplicateSelectedAnnotation();
    }
  );

  els.deleteOrClear.addEventListener('click', function onDeleteOrClear() {
    if (state.selectedAnnotationId) {
      deleteSelectedAnnotation();
      return;
    }

    clearAllAnnotations();
  });

  els.zoomIn.addEventListener('click', function onZoomIn() {
    setZoom(state.zoom + ZOOM_STEP);
  });

  els.zoomOut.addEventListener('click', function onZoomOut() {
    setZoom(state.zoom - ZOOM_STEP);
  });

  els.zoomReset.addEventListener('click', function onZoomReset() {
    setZoom(1);
  });

  ['input', 'change'].forEach((eventName) => {
    els.inspectorInput.addEventListener(eventName, function onInspectorInput() {
      applyInspectorValue(els.inspectorInput.value);
    });
  });

  if (els.statusInfoToggle) {
    els.statusInfoToggle.addEventListener('click', function onStatusInfoToggle(event) {
      event.preventDefault();
      event.stopPropagation();
      state.statusPopoverOpen = !state.statusPopoverOpen;
      if (state.statusPopoverOpen) {
        state.helpPopoverOpen = false;
      }
      updateTopbarPopovers();
    });
  }

  if (els.helpInfoToggle) {
    els.helpInfoToggle.addEventListener('click', function onHelpInfoToggle(event) {
      event.preventDefault();
      event.stopPropagation();
      state.helpPopoverOpen = !state.helpPopoverOpen;
      if (state.helpPopoverOpen) {
        state.statusPopoverOpen = false;
      }
      updateTopbarPopovers();
    });
  }

  els.toolButtons.forEach((button) => {
    button.addEventListener('click', function onToolSelect() {
      state.tool = button.dataset.tool;
      updateToolButtons();
      updateStatus();
    });
  });

  els.annotationLayer.addEventListener('pointerdown', onPointerDown);
  els.annotationLayer.addEventListener('pointermove', onPointerMove);
  els.annotationLayer.addEventListener('pointerup', onPointerUp);
  els.annotationLayer.addEventListener('pointerleave', onPointerUp);
  els.annotationLayer.addEventListener('dblclick', onDoubleClick);
  els.viewer.addEventListener('wheel', onViewerWheel, { passive: false });
}

function onPointerDown(event) {
  syncStageGeometry();
  syncArtifactMetrics();

  if (shouldStartPanning(event)) {
    startPanning(event);
    return;
  }

  const handleInfo = findHandleInfo(event.target);
  if (handleInfo) {
    state.selectedAnnotationId = handleInfo.annotationId;
    startHandleDragging(handleInfo, event);
    updateStatus();
    updateInspector();
    renderAnnotations();
    return;
  }

  const clickedAnnotationId = findAnnotationId(event.target);
  if (clickedAnnotationId) {
    state.selectedAnnotationId = clickedAnnotationId;
    startMoveDragging(clickedAnnotationId, event);
    updateStatus();
    updateInspector();
    renderAnnotations();
    return;
  }

  state.selectedAnnotationId = null;
  updateStatus();
  updateInspector();

  const point = getArtifactLocalPoint(event);
  if (!point) {
    return;
  }

  if (state.tool === 'text') {
    const normalizedPoint = normalizeArtifactPoint(point);
    const textId = createId('text');
    state.annotations.push({
      id: textId,
      type: 'text',
      x: normalizedPoint.x,
      y: normalizedPoint.y,
      text: 'New note',
    });
    state.selectedAnnotationId = textId;
    state.newlyCreatedTextId = textId;
    updateStatus();
    updateInspector();
    renderAnnotations();
    focusInspectorInput({ selectAll: false, clearIfFreshText: true });
    return;
  }

  state.draft = {
    id: createId(state.tool),
    type: state.tool,
    start: point,
    end: point,
  };
  renderAnnotations();
}

function onPointerMove(event) {
  if (state.panning) {
    handlePanning(event);
    return;
  }

  if (state.dragging) {
    handleDragging(event);
    return;
  }

  if (!state.draft) {
    return;
  }

  const point = getArtifactLocalPoint(event, { clamp: true });
  if (!point) {
    return;
  }

  state.draft.end = point;
  renderAnnotations();
}

function onPointerUp(event) {
  if (state.panning) {
    finishPanning(event);
    return;
  }

  if (state.dragging) {
    finishDragging(event);
    return;
  }

  if (!state.draft) {
    return;
  }

  const point =
    getArtifactLocalPoint(event, { clamp: true }) || state.draft.end;
  state.draft.end = point;

  const annotation = finalizeDraft(state.draft);
  state.draft = null;

  if (annotation) {
    state.annotations.push(annotation);
    state.selectedAnnotationId = annotation.id;
  }

  updateStatus();
  updateInspector();
  renderAnnotations();

  if (annotation && annotation.type !== 'text') {
    focusInspectorInput(true);
  }
}

function onDoubleClick(event) {
  const annotationId = findAnnotationId(event.target);
  if (!annotationId) {
    return;
  }

  state.selectedAnnotationId = annotationId;
  updateStatus();
  updateInspector();
  renderAnnotations();
  focusInspectorInput(true);
}

function shouldStartPanning(_event) {
  return state.spacePan;
}

function startPanning(event) {
  event.preventDefault();
  state.panning = {
    startX: event.clientX,
    startY: event.clientY,
    scrollLeft: els.viewer.scrollLeft,
    scrollTop: els.viewer.scrollTop,
  };
  els.viewer.classList.add('is-panning');
}

function handlePanning(event) {
  const dx = event.clientX - state.panning.startX;
  const dy = event.clientY - state.panning.startY;
  els.viewer.scrollLeft = state.panning.scrollLeft - dx;
  els.viewer.scrollTop = state.panning.scrollTop - dy;
}

function finishPanning(_event) {
  state.panning = null;
  els.viewer.classList.remove('is-panning');
}

function startMoveDragging(annotationId, event) {
  const point = getArtifactLocalPoint(event, { clamp: true });
  const annotation = getAnnotationById(annotationId);

  if (!point || !annotation) {
    return;
  }

  state.dragging = {
    mode: 'move',
    annotationId,
    pointerStart: normalizeArtifactPoint(point),
    snapshot: cloneAnnotation(annotation),
  };

  els.annotationLayer.classList.add('is-dragging');
}

function startHandleDragging(handleInfo, event) {
  const point = getArtifactLocalPoint(event, { clamp: true });
  const annotation = getAnnotationById(handleInfo.annotationId);

  if (!point || !annotation) {
    return;
  }

  state.dragging = {
    mode: 'handle',
    annotationId: handleInfo.annotationId,
    handle: handleInfo.handle,
    snapshot: cloneAnnotation(annotation),
    pointerStart: normalizeArtifactPoint(point),
  };

  els.annotationLayer.classList.add('is-dragging');
}

function handleDragging(event) {
  const point = getArtifactLocalPoint(event, { clamp: true });
  const annotation = getAnnotationById(state.dragging.annotationId);

  if (!point || !annotation) {
    return;
  }

  const current = normalizeArtifactPoint(point);

  if (state.dragging.mode === 'handle') {
    applyHandleDrag(
      annotation,
      state.dragging.snapshot,
      state.dragging.handle,
      current
    );
    renderAnnotations();
    return;
  }

  const dx = round(current.x - state.dragging.pointerStart.x);
  const dy = round(current.y - state.dragging.pointerStart.y);
  applyMoveDrag(annotation, state.dragging.snapshot, dx, dy);
  renderAnnotations();
}

function finishDragging(event) {
  handleDragging(event);
  state.dragging = null;
  els.annotationLayer.classList.remove('is-dragging');
  updateStatus();
  updateInspector();
}

function applyMoveDrag(annotation, snapshot, dx, dy) {
  if (annotation.type === 'rect') {
    annotation.x = clamp(snapshot.x + dx, 0, 1 - annotation.width);
    annotation.y = clamp(snapshot.y + dy, 0, 1 - annotation.height);
    return;
  }

  if (annotation.type === 'arrow') {
    const minX = Math.min(snapshot.x1, snapshot.x2);
    const maxX = Math.max(snapshot.x1, snapshot.x2);
    const minY = Math.min(snapshot.y1, snapshot.y2);
    const maxY = Math.max(snapshot.y1, snapshot.y2);
    const clampedDx = clampDelta(dx, minX, maxX);
    const clampedDy = clampDelta(dy, minY, maxY);

    annotation.x1 = round(snapshot.x1 + clampedDx);
    annotation.y1 = round(snapshot.y1 + clampedDy);
    annotation.x2 = round(snapshot.x2 + clampedDx);
    annotation.y2 = round(snapshot.y2 + clampedDy);
    return;
  }

  if (annotation.type === 'text') {
    annotation.x = clamp(snapshot.x + dx);
    annotation.y = clamp(snapshot.y + dy);
  }
}

function applyHandleDrag(annotation, snapshot, handle, current) {
  if (annotation.type === 'rect') {
    const minSize = getMinimumNormalizedSize();
    let x1 = snapshot.x;
    let y1 = snapshot.y;
    let x2 = snapshot.x + snapshot.width;
    let y2 = snapshot.y + snapshot.height;

    if (handle === 'nw' || handle === 'sw') {
      x1 = clamp(current.x, 0, x2 - minSize.width);
    }
    if (handle === 'ne' || handle === 'se') {
      x2 = clamp(current.x, x1 + minSize.width, 1);
    }
    if (handle === 'nw' || handle === 'ne') {
      y1 = clamp(current.y, 0, y2 - minSize.height);
    }
    if (handle === 'sw' || handle === 'se') {
      y2 = clamp(current.y, y1 + minSize.height, 1);
    }

    annotation.x = round(x1);
    annotation.y = round(y1);
    annotation.width = round(x2 - x1);
    annotation.height = round(y2 - y1);
    return;
  }

  if (annotation.type === 'arrow') {
    if (handle === 'start') {
      annotation.x1 = clamp(current.x);
      annotation.y1 = clamp(current.y);
      return;
    }

    if (handle === 'end') {
      annotation.x2 = clamp(current.x);
      annotation.y2 = clamp(current.y);
    }
  }
}

function finalizeDraft(draft) {
  if (draft.type === 'rect') {
    const x = Math.min(draft.start.x, draft.end.x);
    const y = Math.min(draft.start.y, draft.end.y);
    const width = Math.abs(draft.end.x - draft.start.x);
    const height = Math.abs(draft.end.y - draft.start.y);

    if (width < 6 || height < 6) {
      return null;
    }

    const normalizedOrigin = normalizeArtifactPoint({ x, y });
    const normalizedSize = normalizeArtifactSize({ width, height });

    return {
      id: draft.id,
      type: 'rect',
      x: normalizedOrigin.x,
      y: normalizedOrigin.y,
      width: normalizedSize.width,
      height: normalizedSize.height,
      text: '',
    };
  }

  if (draft.type === 'arrow') {
    const dx = Math.abs(draft.end.x - draft.start.x);
    const dy = Math.abs(draft.end.y - draft.start.y);

    if (dx < 6 && dy < 6) {
      return null;
    }

    const start = normalizeArtifactPoint(draft.start);
    const end = normalizeArtifactPoint(draft.end);

    return {
      id: draft.id,
      type: 'arrow',
      x1: start.x,
      y1: start.y,
      x2: end.x,
      y2: end.y,
      text: '',
    };
  }

  return null;
}

function renderAnnotations() {
  syncStageGeometry();
  syncArtifactMetrics();
  els.annotationLayer.innerHTML = '';
  els.annotationLayer.appendChild(buildDefs());

  state.annotations.forEach((annotation) => {
    els.annotationLayer.appendChild(createAnnotationElement(annotation));
  });

  if (state.draft) {
    const draftAnnotation = finalizeDraft(state.draft);
    if (draftAnnotation) {
      els.annotationLayer.appendChild(
        createAnnotationElement(draftAnnotation, true)
      );
    }
  }
}

function buildDefs() {
  const defs = document.createElementNS(SVG_NS, 'defs');
  const marker = document.createElementNS(SVG_NS, 'marker');
  marker.setAttribute('id', 'arrowhead');
  marker.setAttribute('markerWidth', '10');
  marker.setAttribute('markerHeight', '7');
  marker.setAttribute('refX', '9');
  marker.setAttribute('refY', '3.5');
  marker.setAttribute('orient', 'auto');

  const polygon = document.createElementNS(SVG_NS, 'polygon');
  polygon.setAttribute('points', '0 0, 10 3.5, 0 7');
  polygon.setAttribute('fill', '#e05252');

  marker.appendChild(polygon);
  defs.appendChild(marker);
  return defs;
}

function createAnnotationElement(annotation, isDraft) {
  const group = document.createElementNS(SVG_NS, 'g');
  group.dataset.annotationId = annotation.id;
  group.classList.add('annotation-group');

  if (isDraft) {
    group.classList.add('is-draft');
  }

  const isSelected = state.selectedAnnotationId === annotation.id;
  if (isSelected) {
    group.classList.add('is-selected');
  }

  if (annotation.type === 'rect') {
    const box = denormalizeRect(annotation);
    const rect = document.createElementNS(SVG_NS, 'rect');
    rect.setAttribute('class', 'annotation-rect');
    rect.setAttribute('x', box.x);
    rect.setAttribute('y', box.y);
    rect.setAttribute('width', box.width);
    rect.setAttribute('height', box.height);
    group.appendChild(rect);

    if (annotation.text) {
      appendRectInnerLabel(group, annotation.text, box);
    }

    if (isSelected && !isDraft) {
      appendRectHandles(group, annotation);
    }

    return group;
  }

  if (annotation.type === 'arrow') {
    const arrow = denormalizeArrow(annotation);
    const line = document.createElementNS(SVG_NS, 'line');
    line.setAttribute('class', 'annotation-arrow');
    line.setAttribute('x1', arrow.x1);
    line.setAttribute('y1', arrow.y1);
    line.setAttribute('x2', arrow.x2);
    line.setAttribute('y2', arrow.y2);
    line.setAttribute('marker-end', 'url(#arrowhead)');
    group.appendChild(line);

    if (annotation.text) {
      appendLabel(
        group,
        annotation.text,
        (arrow.x1 + arrow.x2) / 2 + 8,
        (arrow.y1 + arrow.y2) / 2 - 8
      );
    }

    if (isSelected && !isDraft) {
      appendArrowHandles(group, annotation);
    }

    return group;
  }

  if (annotation.type === 'text') {
    const point = denormalizeArtifactPoint(annotation);
    const labelWidth = measureLabelWidth(annotation.text || '');
    const background = document.createElementNS(SVG_NS, 'rect');
    background.setAttribute('class', 'annotation-text-bg');
    background.setAttribute('x', point.x - 8);
    background.setAttribute('y', point.y - 20);
    background.setAttribute('rx', '8');
    background.setAttribute('ry', '8');
    background.setAttribute('width', labelWidth);
    background.setAttribute('height', '28');

    const text = document.createElementNS(SVG_NS, 'text');
    text.setAttribute('class', 'annotation-text');
    text.setAttribute('x', point.x);
    text.setAttribute('y', point.y);
    text.textContent = annotation.text || '';

    group.appendChild(background);
    group.appendChild(text);
    return group;
  }

  return group;
}

function appendLabel(group, textValue, x, y) {
  const text = String(textValue || '').trim();
  if (!text) {
    return;
  }

  const labelWidth = measureLabelWidth(text);
  const background = document.createElementNS(SVG_NS, 'rect');
  background.setAttribute('class', 'annotation-label-bg');
  background.setAttribute('x', x - 8);
  background.setAttribute('y', y - 18);
  background.setAttribute('rx', '8');
  background.setAttribute('ry', '8');
  background.setAttribute('width', labelWidth);
  background.setAttribute('height', '24');

  const label = document.createElementNS(SVG_NS, 'text');
  label.setAttribute('class', 'annotation-label-text');
  label.setAttribute('x', x);
  label.setAttribute('y', y);
  label.textContent = text;

  group.appendChild(background);
  group.appendChild(label);
}

function appendRectInnerLabel(group, textValue, box) {
  const text = String(textValue || '').trim();
  if (!text) {
    return;
  }

  const padding = 10;
  const lineHeight = 18;
  const labelWidth = Math.max(80, Math.min(box.width - padding * 2, box.width - 16));
  const background = document.createElementNS(SVG_NS, 'rect');
  background.setAttribute('class', 'annotation-label-bg');
  background.setAttribute('x', box.x + padding);
  background.setAttribute('y', box.y + padding);
  background.setAttribute('rx', '8');
  background.setAttribute('ry', '8');
  background.setAttribute('width', Math.max(60, labelWidth));
  background.setAttribute('height', '26');

  const label = document.createElementNS(SVG_NS, 'text');
  label.setAttribute('class', 'annotation-label-text');
  label.setAttribute('x', box.x + padding + 8);
  label.setAttribute('y', box.y + padding + lineHeight);
  label.textContent = text;

  group.appendChild(background);
  group.appendChild(label);
}

function appendRectHandles(group, annotation) {
  const box = denormalizeRect(annotation);
  const corners = {
    nw: { x: box.x, y: box.y },
    ne: { x: box.x + box.width, y: box.y },
    sw: { x: box.x, y: box.y + box.height },
    se: { x: box.x + box.width, y: box.y + box.height },
  };

  Object.entries(corners).forEach(([handle, point]) => {
    group.appendChild(createHandle(annotation.id, handle, point.x, point.y));
  });
}

function appendArrowHandles(group, annotation) {
  const arrow = denormalizeArrow(annotation);
  group.appendChild(createHandle(annotation.id, 'start', arrow.x1, arrow.y1));
  group.appendChild(createHandle(annotation.id, 'end', arrow.x2, arrow.y2));
}

function createHandle(annotationId, handle, x, y) {
  const circle = document.createElementNS(SVG_NS, 'circle');
  circle.setAttribute('class', 'annotation-handle');
  circle.setAttribute('cx', x);
  circle.setAttribute('cy', y);
  circle.setAttribute('r', 6);
  circle.dataset.annotationId = annotationId;
  circle.dataset.handle = handle;
  return circle;
}

async function submit(status) {
  if (!currentRequest || state.isSubmitting) {
    return;
  }

  state.isSubmitting = true;
  updateStatus();

  try {
    const exportPayload = await buildExportPayload();

    await window.reviewApp.submitResult({
      status,
      message: els.message.value,
      annotations: state.annotations,
      coordinateSpace: buildCoordinateSpace(),
      exportPayload,
    });

    window.location.reload();
  } catch (error) {
    state.isSubmitting = false;
    state.daemonConnected = false;
    state.daemonError = error.message || 'Failed to submit review result.';
    updateStatus();
  }
}

async function buildExportPayload() {
  const payload = {
    overlaySvg: buildOverlaySvg(),
    artifactSnapshotSvg: buildArtifactSnapshotSvg(),
  };

  if (currentRequest && currentRequest.artifactType === 'image') {
    payload.annotatedImageDataUrl = await buildAnnotatedImageDataUrl();
  }

  return payload;
}

function buildCoordinateSpace() {
  const metrics = state.artifactMetrics;
  const sceneWidth = getSceneWidth();
  const sceneHeight = getSceneHeight();

  return {
    kind: 'normalized-scene-canvas',
    sceneWidth: Math.round(sceneWidth),
    sceneHeight: Math.round(sceneHeight),
    artifactBoxInScene: metrics
      ? {
          x: round(metrics.left / state.stageRect.width),
          y: round(metrics.top / state.stageRect.height),
          width: round(metrics.width / state.stageRect.width),
          height: round(metrics.height / state.stageRect.height),
        }
      : null,
    exportWidth: Math.round(sceneWidth),
    exportHeight: Math.round(sceneHeight),
    artifactExportWidth: metrics ? metrics.exportWidth : null,
    artifactExportHeight: metrics ? metrics.exportHeight : null,
    zoom: state.zoom,
  };
}

function buildOverlaySvg() {
  const metrics = state.artifactMetrics;
  if (!metrics) {
    return '';
  }

  const sceneWidth = getSceneWidth();
  const sceneHeight = getSceneHeight();
  const parts = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${sceneWidth}" height="${sceneHeight}" viewBox="0 0 ${sceneWidth} ${sceneHeight}">`,
    '<defs><marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto"><polygon points="0 0, 10 3.5, 0 7" fill="#e05252" /></marker></defs>',
  ];

  state.annotations.forEach((annotation) => {
    if (annotation.type === 'rect') {
      const rect = toExportRect(annotation);
      parts.push(
        `<rect x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}" fill="rgba(245,185,66,0.18)" stroke="#f5b942" stroke-width="2" />`
      );
      if (annotation.text) {
        parts.push(buildExportLabel(annotation.text, rect.x + 8, rect.y - 8));
      }
      return;
    }

    if (annotation.type === 'arrow') {
      const arrow = toExportArrow(annotation);
      parts.push(
        `<line x1="${arrow.x1}" y1="${arrow.y1}" x2="${arrow.x2}" y2="${arrow.y2}" stroke="#e05252" stroke-width="3" marker-end="url(#arrowhead)" />`
      );
      if (annotation.text) {
        parts.push(
          buildExportLabel(
            annotation.text,
            (arrow.x1 + arrow.x2) / 2 + 8,
            (arrow.y1 + arrow.y2) / 2 - 8
          )
        );
      }
      return;
    }

    if (annotation.type === 'text') {
      const point = toExportPoint(annotation);
      const labelWidth = Math.max(120, annotation.text.length * 8 + 16);
      parts.push(
        `<rect x="${point.x - 8}" y="${point.y - 20}" rx="8" ry="8" width="${labelWidth}" height="28" fill="rgba(15,17,21,0.9)" stroke="#f5b942" stroke-width="1" />`
      );
      parts.push(
        `<text x="${point.x}" y="${point.y}" fill="#f5b942" font-size="14" font-weight="700" font-family="Inter, system-ui, sans-serif">${escapeXml(annotation.text)}</text>`
      );
    }
  });

  parts.push('</svg>');
  return parts.join('');
}

function buildExportLabel(textValue, x, y) {
  const text = escapeXml(textValue);
  const width = measureLabelWidth(textValue);

  return [
    `<rect x="${x - 8}" y="${y - 18}" rx="8" ry="8" width="${width}" height="24" fill="rgba(15,17,21,0.9)" stroke="#f5b942" stroke-width="1" />`,
    `<text x="${x}" y="${y}" fill="#f5b942" font-size="12" font-weight="700" font-family="Inter, system-ui, sans-serif">${text}</text>`,
  ].join('');
}

function buildArtifactSnapshotSvg() {
  if (!state.artifactMetrics) {
    return '';
  }

  if (currentRequest && currentRequest.artifactType === 'mermaid') {
    const svg = els.artifactHost.querySelector('svg');
    if (svg) {
      return svg.outerHTML;
    }
  }

  return '';
}

async function buildAnnotatedImageDataUrl() {
  const metrics = state.artifactMetrics;
  const image = els.artifactHost.querySelector('img');

  if (!metrics || !image) {
    return null;
  }

  const sceneWidth = getSceneWidth();
  const sceneHeight = getSceneHeight();
  const artifactBox = getExportArtifactBox();
  const canvas = document.createElement('canvas');
  canvas.width = sceneWidth;
  canvas.height = sceneHeight;

  const ctx = canvas.getContext('2d');
  ctx.drawImage(
    image,
    artifactBox.x,
    artifactBox.y,
    artifactBox.width,
    artifactBox.height
  );

  state.annotations.forEach((annotation) => {
    drawAnnotationOnCanvas(ctx, annotation);
  });

  return canvas.toDataURL('image/png');
}

function drawAnnotationOnCanvas(ctx, annotation) {
  if (annotation.type === 'rect') {
    const rect = toExportRect(annotation);
    ctx.save();
    ctx.fillStyle = 'rgba(245, 185, 66, 0.18)';
    ctx.strokeStyle = '#f5b942';
    ctx.lineWidth = 4;
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
    ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
    if (annotation.text) {
      drawLabelOnCanvas(ctx, annotation.text, rect.x + 8, rect.y - 8, 12);
    }
    ctx.restore();
    return;
  }

  if (annotation.type === 'arrow') {
    const arrow = toExportArrow(annotation);
    drawArrowOnCanvas(ctx, arrow.x1, arrow.y1, arrow.x2, arrow.y2);
    if (annotation.text) {
      drawLabelOnCanvas(
        ctx,
        annotation.text,
        (arrow.x1 + arrow.x2) / 2 + 8,
        (arrow.y1 + arrow.y2) / 2 - 8,
        12
      );
    }
    return;
  }

  if (annotation.type === 'text') {
    const point = toExportPoint(annotation);
    drawLabelOnCanvas(ctx, annotation.text, point.x, point.y, 20, true);
  }
}

function drawLabelOnCanvas(ctx, textValue, x, y, fontSize, isTextAnnotation) {
  const text = String(textValue || '');
  const paddingX = isTextAnnotation ? 10 : 8;
  const boxWidth = Math.max(
    isTextAnnotation ? 160 : 120,
    text.length * (fontSize * 0.7) + paddingX * 2
  );
  const boxHeight = isTextAnnotation ? 36 : 24;

  ctx.save();
  ctx.fillStyle = 'rgba(15, 17, 21, 0.92)';
  ctx.strokeStyle = '#f5b942';
  ctx.lineWidth = 2;
  roundRect(
    ctx,
    x - paddingX,
    y - (isTextAnnotation ? 28 : 18),
    boxWidth,
    boxHeight,
    10
  );
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#f5b942';
  ctx.font = `700 ${fontSize}px Inter, system-ui, sans-serif`;
  ctx.fillText(text, x, y - (isTextAnnotation ? 4 : 0));
  ctx.restore();
}

function drawArrowOnCanvas(ctx, x1, y1, x2, y2) {
  const headLength = 18;
  const angle = Math.atan2(y2 - y1, x2 - x1);

  ctx.save();
  ctx.strokeStyle = '#e05252';
  ctx.fillStyle = '#e05252';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(
    x2 - headLength * Math.cos(angle - Math.PI / 6),
    y2 - headLength * Math.sin(angle - Math.PI / 6)
  );
  ctx.lineTo(
    x2 - headLength * Math.cos(angle + Math.PI / 6),
    y2 - headLength * Math.sin(angle + Math.PI / 6)
  );
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function toExportPoint(point) {
  return {
    x: round(point.x * getSceneWidth()),
    y: round(point.y * getSceneHeight()),
  };
}

function toExportRect(annotation) {
  const origin = toExportPoint(annotation);

  return {
    x: origin.x,
    y: origin.y,
    width: round(annotation.width * getSceneWidth()),
    height: round(annotation.height * getSceneHeight()),
  };
}

function toExportArrow(annotation) {
  const start = toExportPoint({ x: annotation.x1, y: annotation.y1 });
  const end = toExportPoint({ x: annotation.x2, y: annotation.y2 });

  return {
    x1: start.x,
    y1: start.y,
    x2: end.x,
    y2: end.y,
  };
}

function undoLastAnnotation() {
  if (state.annotations.length === 0) {
    return;
  }

  const removed = state.annotations.pop();
  if (removed && removed.id === state.selectedAnnotationId) {
    state.selectedAnnotationId = null;
  }

  updateStatus();
  updateInspector();
  renderAnnotations();
}

function deleteSelectedAnnotation() {
  if (!state.selectedAnnotationId) {
    return;
  }

  state.annotations = state.annotations.filter((annotation) => {
    return annotation.id !== state.selectedAnnotationId;
  });
  state.selectedAnnotationId = null;
  updateStatus();
  updateInspector();
  renderAnnotations();
}

function clearAllAnnotations() {
  state.annotations = [];
  state.draft = null;
  state.selectedAnnotationId = null;
  state.dragging = null;
  updateStatus();
  updateInspector();
  renderAnnotations();
}

function duplicateSelectedAnnotation() {
  const annotation = getSelectedAnnotation();
  if (!annotation) {
    return;
  }

  const copy = cloneAnnotation(annotation);
  copy.id = createId(annotation.type);

  if (copy.type === 'rect') {
    copy.x = clamp(copy.x + 0.02, 0, 1 - copy.width);
    copy.y = clamp(copy.y + 0.02, 0, 1 - copy.height);
  } else if (copy.type === 'arrow') {
    const minX = Math.min(copy.x1, copy.x2);
    const maxX = Math.max(copy.x1, copy.x2);
    const minY = Math.min(copy.y1, copy.y2);
    const maxY = Math.max(copy.y1, copy.y2);
    const dx = clampDelta(0.02, minX, maxX);
    const dy = clampDelta(0.02, minY, maxY);
    copy.x1 = round(copy.x1 + dx);
    copy.y1 = round(copy.y1 + dy);
    copy.x2 = round(copy.x2 + dx);
    copy.y2 = round(copy.y2 + dy);
  } else if (copy.type === 'text') {
    copy.x = clamp(copy.x + 0.02);
    copy.y = clamp(copy.y + 0.02);
  }

  state.annotations.push(copy);
  state.selectedAnnotationId = copy.id;
  updateStatus();
  updateInspector();
  renderAnnotations();
}

function updateToolButtons() {
  els.toolButtons.forEach((button) => {
    button.classList.toggle('is-active', button.dataset.tool === state.tool);
  });
}

function updateStatus() {
  if (els.selectionState) {
    if (state.selectedAnnotationId) {
      const selected = getSelectedAnnotation();
      els.selectionState.textContent = selected
        ? `Selected: ${selected.type}`
        : 'Selected: unknown';
    } else {
      els.selectionState.textContent = 'Selected: none';
    }
  }

  els.annotationCount.textContent = `Annotations: ${state.annotations.length}`;
  els.activeTool.textContent = `Tool: ${state.spacePan ? 'pan (space)' : state.tool}`;
  els.zoomLevel.textContent = `${Math.round(state.zoom * 100)}%`;
  els.zoomState.textContent = `Zoom: ${Math.round(state.zoom * 100)}%`;
  els.queueState.textContent = `Queued: ${state.queuedCount}`;
  els.requestState.textContent = `Request: ${currentRequest ? currentRequest.id : 'none'}`;

  if (!state.artifactMetrics) {
    els.artifactBoxState.textContent = 'Artifact box: unavailable';
  } else {
    els.artifactBoxState.textContent = `Artifact box: ${Math.round(
      state.artifactMetrics.width
    )}×${Math.round(state.artifactMetrics.height)} | export ${state.artifactMetrics.exportWidth}×${state.artifactMetrics.exportHeight}`;
  }

  updateSessionIndicators();
  updateActionAvailability();
}

function updateSessionIndicators() {
  const daemonClass = state.daemonConnected
    ? 'status-pill status-pill-success'
    : 'status-pill status-pill-danger';
  els.daemonConnectionState.className = daemonClass;
  els.daemonConnectionState.textContent = state.daemonConnected
    ? 'Daemon: connected'
    : 'Daemon: disconnected';

  let sessionText = 'Session: idle';
  let sessionClass = 'status-pill status-pill-neutral';
  let daemonMessage = 'Ready and waiting for the next review request.';

  if (!state.daemonConnected) {
    sessionText = 'Session: unavailable';
    sessionClass = 'status-pill status-pill-danger';
    daemonMessage = state.daemonError
      ? `Daemon unavailable: ${state.daemonError}`
      : 'Daemon unavailable.';
  } else if (state.isSubmitting) {
    sessionText = 'Session: submitting';
    sessionClass = 'status-pill status-pill-warning';
    daemonMessage = 'Submitting your review result…';
  } else if (currentRequest) {
    sessionText = 'Session: reviewing';
    sessionClass = 'status-pill status-pill-warning';
    daemonMessage = state.queuedCount > 0
      ? `Review in progress. ${state.queuedCount} more request(s) waiting in queue.`
      : 'Review in progress. No queued requests behind this one.';
  }

  els.sessionModeState.className = sessionClass;
  els.sessionModeState.textContent = sessionText;
  els.daemonMessage.textContent = daemonMessage;
}

function updateActionAvailability() {
  const canSubmit = Boolean(currentRequest && state.daemonConnected && !state.isSubmitting);

  els.approve.disabled = !canSubmit;
  els.changes.disabled = !canSubmit;
  els.cancel.disabled = !canSubmit;
}

function updateInspector() {
  const annotation = getSelectedAnnotation();

  if (!annotation) {
    els.inspector.classList.add('is-empty');
    els.inspectorEmpty.classList.remove('hidden');
    els.inspectorContent.classList.add('hidden');
    els.inspectorInput.value = '';
    return;
  }

  els.inspector.classList.remove('is-empty');
  els.inspectorEmpty.classList.add('hidden');
  els.inspectorContent.classList.remove('hidden');
  els.inspectorType.textContent = annotation.type;

  if (annotation.type === 'text') {
    els.inspectorLabel.textContent = 'Text content';
    els.inspectorInput.placeholder = 'Write text content here...';
  } else {
    els.inspectorLabel.textContent = 'Label / note';
    els.inspectorInput.placeholder = 'Write optional label or note here...';
  }

  els.inspectorInput.value = annotation.text || '';
}

function applyInspectorValue(value) {
  const annotation = getSelectedAnnotation();
  if (!annotation) {
    return;
  }

  annotation.text = value;
  renderAnnotations();
}

function focusInspectorInput(options) {
  const settings =
    typeof options === 'boolean'
      ? { selectAll: options, clearIfFreshText: false }
      : { selectAll: false, clearIfFreshText: false, ...(options || {}) };

  updateInspector();

  const annotation = getSelectedAnnotation();
  if (
    settings.clearIfFreshText &&
    annotation &&
    annotation.type === 'text' &&
    annotation.id === state.newlyCreatedTextId
  ) {
    annotation.text = '';
    state.newlyCreatedTextId = null;
    updateInspector();
    renderAnnotations();
  }

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      els.inspectorInput.focus();
      if (settings.selectAll) {
        els.inspectorInput.select();
      }
    });
  });
}

function getSelectedAnnotation() {
  if (!state.selectedAnnotationId) {
    return null;
  }

  return getAnnotationById(state.selectedAnnotationId);
}

function onWindowResize() {
  syncStageGeometry();
  syncArtifactMetrics();
  updateStatus();
  renderAnnotations();
}

function onArtifactReady() {
  syncStageGeometry();
  syncArtifactMetrics();
  updateStatus();
  renderAnnotations();
  refreshVendorUi();
}

function onKeyDown(event) {
  const isInputFocused =
    document.activeElement === els.message ||
    document.activeElement === els.inspectorInput;

  if (
    (event.metaKey || event.ctrlKey) &&
    event.key.toLowerCase() === 'd' &&
    !isInputFocused
  ) {
    event.preventDefault();
    duplicateSelectedAnnotation();
    return;
  }

  if (event.code === 'Space' && !isInputFocused) {
    event.preventDefault();
    state.spacePan = true;
    updateStatus();
  }

  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
    event.preventDefault();
    undoLastAnnotation();
    return;
  }

  if (!isInputFocused && (event.key === '+' || event.key === '=')) {
    event.preventDefault();
    setZoom(state.zoom + ZOOM_STEP);
    return;
  }

  if (!isInputFocused && event.key === '-') {
    event.preventDefault();
    setZoom(state.zoom - ZOOM_STEP);
    return;
  }

  if (!isInputFocused && event.key === '0') {
    event.preventDefault();
    setZoom(1);
    return;
  }

  if (event.key === 'Backspace' || event.key === 'Delete') {
    if (isInputFocused) {
      return;
    }

    event.preventDefault();
    deleteSelectedAnnotation();
    return;
  }

  if (event.key === 'Escape') {
    if (state.statusPopoverOpen || state.helpPopoverOpen) {
      closeTopbarPopovers();
      return;
    }

    state.draft = null;
    state.dragging = null;
    state.panning = null;
    els.annotationLayer.classList.remove('is-dragging');
    els.viewer.classList.remove('is-panning');
    renderAnnotations();
    return;
  }

  if (isInputFocused) {
    return;
  }

  if (event.key === '1') {
    state.tool = 'rect';
    updateToolButtons();
    updateStatus();
    return;
  }

  if (event.key === '2') {
    state.tool = 'arrow';
    updateToolButtons();
    updateStatus();
    return;
  }

  if (event.key === '3') {
    state.tool = 'text';
    updateToolButtons();
    updateStatus();
    return;
  }

}

function onKeyUp(event) {
  if (event.code === 'Space' && state.spacePan) {
    state.spacePan = false;
    updateStatus();
  }
}

function setZoom(nextZoom, options) {
  const previousZoom = state.zoom;
  const clampedZoom = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM);

  if (clampedZoom === previousZoom) {
    return;
  }

  let anchorX =
    (els.viewer.scrollLeft + els.viewer.clientWidth / 2) / previousZoom;
  let anchorY =
    (els.viewer.scrollTop + els.viewer.clientHeight / 2) / previousZoom;

  if (
    options &&
    typeof options.anchorClientX === 'number' &&
    typeof options.anchorClientY === 'number'
  ) {
    const viewerRect = els.viewer.getBoundingClientRect();
    anchorX =
      (els.viewer.scrollLeft + (options.anchorClientX - viewerRect.left)) /
      previousZoom;
    anchorY =
      (els.viewer.scrollTop + (options.anchorClientY - viewerRect.top)) /
      previousZoom;
  }

  state.zoom = clampedZoom;
  applyZoom();

  requestAnimationFrame(() => {
    const viewerRect = els.viewer.getBoundingClientRect();
    const anchorOffsetX =
      options && typeof options.anchorClientX === 'number'
        ? options.anchorClientX - viewerRect.left
        : els.viewer.clientWidth / 2;
    const anchorOffsetY =
      options && typeof options.anchorClientY === 'number'
        ? options.anchorClientY - viewerRect.top
        : els.viewer.clientHeight / 2;

    els.viewer.scrollLeft = Math.max(0, anchorX * state.zoom - anchorOffsetX);
    els.viewer.scrollTop = Math.max(0, anchorY * state.zoom - anchorOffsetY);
    syncStageGeometry();
    syncArtifactMetrics();
    updateStatus();
    renderAnnotations();
  });
}

function applyZoom(initial) {
  els.viewerStage.style.zoom = String(state.zoom);
  if (!initial) {
    updateStatus();
  }
}

function fitZoomToArtifact() {
  syncStageGeometry();
  syncArtifactMetrics();

  if (!state.artifactMetrics) {
    return;
  }

  const availableWidth = Math.max(1, els.viewer.clientWidth - 32);
  const availableHeight = Math.max(1, els.viewer.clientHeight - 32);
  const zoomX = availableWidth / state.artifactMetrics.width;
  const zoomY = availableHeight / state.artifactMetrics.height;
  const nextZoom = clamp(Math.min(zoomX, zoomY), MIN_ZOOM, MAX_ZOOM);

  state.zoom = nextZoom;
  applyZoom();

  requestAnimationFrame(() => {
    syncStageGeometry();
    syncArtifactMetrics();
    const metrics = state.artifactMetrics;
    if (metrics) {
      const centerX = (metrics.left + metrics.width / 2) * state.zoom;
      const centerY = (metrics.top + metrics.height / 2) * state.zoom;
      els.viewer.scrollLeft = Math.max(0, centerX - els.viewer.clientWidth / 2);
      els.viewer.scrollTop = Math.max(0, centerY - els.viewer.clientHeight / 2);
    }
    updateStatus();
    renderAnnotations();
  });
}

function onViewerWheel(event) {
  if (!(event.metaKey || event.ctrlKey)) {
    return;
  }

  event.preventDefault();
  const direction = event.deltaY > 0 ? -WHEEL_ZOOM_STEP : WHEEL_ZOOM_STEP;
  setZoom(state.zoom + direction, {
    anchorClientX: event.clientX,
    anchorClientY: event.clientY,
  });
}

function syncStageGeometry() {
  state.stageRect = els.viewerStage.getBoundingClientRect();
  els.annotationLayer.setAttribute(
    'viewBox',
    `0 0 ${state.stageRect.width} ${state.stageRect.height}`
  );
}

function syncArtifactMetrics() {
  if (!state.stageRect) {
    syncStageGeometry();
  }

  const stage = state.stageRect;
  if (!stage) {
    state.artifactMetrics = null;
    return;
  }

  const image = els.artifactHost.querySelector('img');
  if (image) {
    const rect = image.getBoundingClientRect();
    state.artifactMetrics = {
      left: rect.left - stage.left,
      top: rect.top - stage.top,
      width: rect.width,
      height: rect.height,
      exportWidth: image.naturalWidth || Math.round(rect.width) || 1,
      exportHeight: image.naturalHeight || Math.round(rect.height) || 1,
    };
    return;
  }

  const iframe = els.artifactHost.querySelector('iframe');
  if (iframe) {
    const rect = iframe.getBoundingClientRect();
    state.artifactMetrics = {
      left: rect.left - stage.left,
      top: rect.top - stage.top,
      width: rect.width,
      height: rect.height,
      exportWidth: Math.round(rect.width) || 1,
      exportHeight: Math.round(rect.height) || 1,
    };
    return;
  }

  const svg = els.artifactHost.querySelector('svg');
  if (svg) {
    const rect = svg.getBoundingClientRect();
    const viewBox =
      svg.viewBox && svg.viewBox.baseVal ? svg.viewBox.baseVal : null;
    state.artifactMetrics = {
      left: rect.left - stage.left,
      top: rect.top - stage.top,
      width: rect.width,
      height: rect.height,
      exportWidth:
        viewBox && viewBox.width
          ? Math.round(viewBox.width)
          : Math.round(rect.width) || 1,
      exportHeight:
        viewBox && viewBox.height
          ? Math.round(viewBox.height)
          : Math.round(rect.height) || 1,
    };
    return;
  }

  const fallback = els.artifactHost.getBoundingClientRect();
  state.artifactMetrics = {
    left: fallback.left - stage.left,
    top: fallback.top - stage.top,
    width: fallback.width,
    height: fallback.height,
    exportWidth: Math.round(fallback.width) || 1,
    exportHeight: Math.round(fallback.height) || 1,
  };
}

function getArtifactLocalPoint(event, options) {
  if (!state.stageRect) {
    syncStageGeometry();
  }

  if (!state.stageRect) {
    return null;
  }

  const clampToScene = options && options.clamp;
  let localX = event.clientX - state.stageRect.left;
  let localY = event.clientY - state.stageRect.top;

  if (clampToScene) {
    localX = Math.max(0, Math.min(localX, state.stageRect.width));
    localY = Math.max(0, Math.min(localY, state.stageRect.height));
  }

  if (
    localX < 0 ||
    localY < 0 ||
    localX > state.stageRect.width ||
    localY > state.stageRect.height
  ) {
    return null;
  }

  return { x: localX, y: localY };
}

function normalizeArtifactPoint(point) {
  const width = state.stageRect && state.stageRect.width ? state.stageRect.width : 1;
  const height = state.stageRect && state.stageRect.height ? state.stageRect.height : 1;

  return {
    x: round(point.x / width),
    y: round(point.y / height),
  };
}

function normalizeArtifactSize(size) {
  const width = state.stageRect && state.stageRect.width ? state.stageRect.width : 1;
  const height = state.stageRect && state.stageRect.height ? state.stageRect.height : 1;

  return {
    width: round(size.width / width),
    height: round(size.height / height),
  };
}

function denormalizeArtifactPoint(point) {
  const width = state.stageRect && state.stageRect.width ? state.stageRect.width : 1;
  const height = state.stageRect && state.stageRect.height ? state.stageRect.height : 1;

  return {
    x: point.x * width,
    y: point.y * height,
  };
}

function denormalizeRect(annotation) {
  const origin = denormalizeArtifactPoint(annotation);
  const width = state.stageRect && state.stageRect.width ? state.stageRect.width : 1;
  const height = state.stageRect && state.stageRect.height ? state.stageRect.height : 1;

  return {
    x: origin.x,
    y: origin.y,
    width: annotation.width * width,
    height: annotation.height * height,
  };
}

function denormalizeArrow(annotation) {
  const start = denormalizeArtifactPoint({
    x: annotation.x1,
    y: annotation.y1,
  });
  const end = denormalizeArtifactPoint({ x: annotation.x2, y: annotation.y2 });

  return {
    x1: start.x,
    y1: start.y,
    x2: end.x,
    y2: end.y,
  };
}

function findAnnotationId(target) {
  let current = target;
  while (current && current !== els.annotationLayer) {
    if (current.dataset && current.dataset.annotationId) {
      return current.dataset.annotationId;
    }
    current = current.parentNode;
  }
  return null;
}

function findHandleInfo(target) {
  let current = target;
  while (current && current !== els.annotationLayer) {
    if (
      current.dataset &&
      current.dataset.annotationId &&
      current.dataset.handle
    ) {
      return {
        annotationId: current.dataset.annotationId,
        handle: current.dataset.handle,
      };
    }
    current = current.parentNode;
  }
  return null;
}

function getAnnotationById(annotationId) {
  return state.annotations.find((annotation) => annotation.id === annotationId);
}

function cloneAnnotation(annotation) {
  return JSON.parse(JSON.stringify(annotation));
}

function getMinimumNormalizedSize() {
  const width = state.stageRect && state.stageRect.width ? state.stageRect.width : 1;
  const height = state.stageRect && state.stageRect.height ? state.stageRect.height : 1;
  return {
    width: Math.max(8 / width, 0.01),
    height: Math.max(8 / height, 0.01),
  };
}

function applyInspectorValue(value) {
  const annotation = getSelectedAnnotation();
  if (!annotation) {
    return;
  }

  annotation.text = value;
  renderAnnotations();
}

function measureLabelWidth(textValue) {
  return Math.max(120, String(textValue || '').length * 8 + 16);
}

function getSceneWidth() {
  return els.viewerStage ? els.viewerStage.offsetWidth || 1 : 1;
}

function getSceneHeight() {
  return els.viewerStage ? els.viewerStage.offsetHeight || 1 : 1;
}

function getExportArtifactBox() {
  if (!state.artifactMetrics || !state.stageRect) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  const sceneWidth = getSceneWidth();
  const sceneHeight = getSceneHeight();

  return {
    x: round((state.artifactMetrics.left / state.stageRect.width) * sceneWidth),
    y: round((state.artifactMetrics.top / state.stageRect.height) * sceneHeight),
    width: round((state.artifactMetrics.width / state.stageRect.width) * sceneWidth),
    height: round((state.artifactMetrics.height / state.stageRect.height) * sceneHeight),
  };
}

function toFileUrl(filePath) {
  if (!filePath) {
    return '';
  }

  return `file://${filePath}`;
}

function createId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
}

function round(value) {
  return Math.round(value * 10000) / 10000;
}

function clamp(value, min, max) {
  const actualMin = typeof min === 'number' ? min : 0;
  const actualMax = typeof max === 'number' ? max : 1;
  return Math.max(actualMin, Math.min(actualMax, round(value)));
}

function clampDelta(delta, minValue, maxValue) {
  return round(Math.max(-minValue, Math.min(1 - maxValue, delta)));
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

async function refreshDaemonStatus() {
  try {
    const health = await window.reviewApp.getHealth();
    state.daemonConnected = Boolean(health && health.ok);
    state.daemonError = '';
    state.queuedCount = Number(health && health.queuedCount ? health.queuedCount : 0);
    state.activeRequestId = health ? health.activeRequestId || null : null;
    state.uiRunning = Boolean(health && health.uiRunning);
  } catch (error) {
    state.daemonConnected = false;
    state.daemonError = error.message || 'Unable to reach daemon.';
    state.queuedCount = 0;
    state.activeRequestId = null;
    state.uiRunning = false;
  }

  updateStatus();
}

function startSessionPolling() {
  if (sessionPollTimer) {
    clearInterval(sessionPollTimer);
  }

  sessionPollTimer = setInterval(async function pollSession() {
    await refreshDaemonStatus();

    if (!state.daemonConnected) {
      return;
    }

    if (currentRequest) {
      if (state.activeRequestId !== currentRequest.id) {
        window.location.reload();
        return;
      }

      return;
    }

    try {
      const nextRequest = await window.reviewApp.getInitialRequest();
      if (nextRequest && nextRequest.id) {
        window.location.reload();
      }
    } catch (error) {
      state.daemonConnected = false;
      state.daemonError = error.message || 'Unable to reach daemon.';
      updateStatus();
    }
  }, 1000);
}

function waitForShoelace() {
  return Promise.resolve();
}

waitForShoelace().then(boot);
