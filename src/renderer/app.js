'use strict';

function debugTrace(message, meta) {
  try {
    console.log('[review-renderer]', message, meta || '');
  } catch {}
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 8;
const ZOOM_STEP = 0.25;
const WHEEL_ZOOM_STEP = 0.3;
const TRACKPAD_ZOOM_STEP = 0.0035;
const DRAG_START_THRESHOLD = 4;

const els = {};
const annotationNodeCache = new Map();

function captureElements() {
  els.title = document.getElementById('title');
  els.prompt = document.getElementById('prompt');
  els.artifactType = document.getElementById('artifact-type');
  els.statusInfoToggle = document.getElementById('status-info-toggle');
  els.statusPopover = document.getElementById('status-popover');
  els.helpInfoToggle = document.getElementById('help-info-toggle');
  els.helpPopover = document.getElementById('help-popover');
  els.artifactHost = document.getElementById('artifact-host');
  els.viewer = document.getElementById('viewer');
  els.viewerStage = document.getElementById('viewer-stage');
  els.annotationLayer = document.getElementById('annotation-layer');
  els.message = document.getElementById('message');
  els.approve = document.getElementById('approve');
  els.changes = document.getElementById('changes');
  els.cancel = document.getElementById('cancel');
  els.undo = document.getElementById('undo-annotation');
  els.duplicateSelected = document.getElementById('duplicate-selected');
  els.deleteOrClear = document.getElementById('delete-or-clear');
  els.zoomIn = document.getElementById('zoom-in');
  els.zoomOut = document.getElementById('zoom-out');
  els.zoomReset = document.getElementById('zoom-reset');
  els.zoomLevel = document.getElementById('zoom-level');
  els.zoomState = document.getElementById('zoom-state');
  els.selectionState = document.getElementById('selection-state');
  els.annotationCount = document.getElementById('annotation-count');
  els.activeTool = document.getElementById('active-tool');
  els.artifactBoxState = document.getElementById('artifact-box-state');
  els.daemonConnectionState = document.getElementById(
    'daemon-connection-state'
  );
  els.sessionModeState = document.getElementById('session-mode-state');
  els.queueState = document.getElementById('queue-state');
  els.requestState = document.getElementById('request-state');
  els.daemonMessage = document.getElementById('daemon-message');
  els.generatedFiles = document.getElementById('generated-files');
  els.generatedFilesEmpty = document.getElementById('generated-files-empty');
  els.generatedFilesList = document.getElementById('generated-files-list');
  els.artifactPickerToggle = document.getElementById('artifact-picker-toggle');
  els.artifactPickerMenu = document.getElementById('artifact-picker-menu');
  els.artifactPickerCurrent = document.getElementById('artifact-picker-current');
  els.currentArtifactTitle = document.getElementById('current-artifact-title');
  els.currentArtifactMeta = document.getElementById('current-artifact-meta');
  els.annotationInspector = document.getElementById('annotation-inspector');
  els.inspectorEmpty = document.getElementById('inspector-empty');
  els.inspectorContent = document.getElementById('inspector-content');
  els.inspectorType = document.getElementById('inspector-type');
  els.inspectorLabel = document.getElementById('inspector-label');
  els.annotationMetaInput = document.getElementById('annotation-meta-input');
  els.inlineEditor = document.getElementById('inline-editor');
  els.inlineEditorBackdrop = document.getElementById('inline-editor-backdrop');
  els.inlineEditorClose = document.getElementById('inline-editor-close');
  els.inlineEditorTitle = document.getElementById('inline-editor-title');
  els.inlineEditorInput = document.getElementById('inline-editor-input');
  els.inlineEditorSave = document.getElementById('inline-editor-save');
  els.inlineEditorCancel = document.getElementById('inline-editor-cancel');
  els.toolButtons = Array.from(document.querySelectorAll('[data-tool]'));
  els.drawToolToggle = document.getElementById('draw-tool-toggle');
  els.drawToolMenu = document.getElementById('draw-tool-menu');
  els.drawToolGroup = document.getElementById('draw-tool-group');
  els.drawToolIcons = Array.from(
    document.querySelectorAll('[data-active-tool-icon]')
  );
}

function hasRequiredElements() {
  return Boolean(
    els.title &&
    els.prompt &&
    els.artifactType &&
    els.artifactHost &&
    els.viewer &&
    els.viewerStage &&
    els.annotationLayer &&
    els.message &&
    els.approve &&
    els.changes &&
    els.cancel
  );
}

let currentRequest = null;
let sessionPollTimer = null;
let heartbeatTimer = null;
let actionsBound = false;
const state = {
  tool: 'select',
  annotations: [],
  draft: null,
  marquee: null,
  stageRect: null,
  artifactMetrics: null,
  selectedAnnotationId: null,
  selectedAnnotationIds: [],
  newlyCreatedTextId: null,
  dragging: null,
  pendingDrag: null,
  panning: null,
  spacePan: false,
  zoom: 1,
  daemonConnected: false,
  queuedCount: 0,
  activeRequestId: null,
  uiRunning: false,
  daemonError: '',
  isSubmitting: false,
  lastSubmittedResult: null,
  statusPopoverOpen: false,
  helpPopoverOpen: false,
  drawToolMenuOpen: false,
  generatedRequests: [],
  selectedGeneratedArtifact: null,
  inlineEditor: {
    open: false,
    annotationId: null,
    value: '',
    x: 0,
    y: 0,
  },
};

async function boot() {
  captureElements();
  debugTrace('boot:start', { hasRequiredElements: hasRequiredElements() });

  if (!hasRequiredElements()) {
    debugTrace('boot:missing-elements');
    return;
  }

  try {
    currentRequest = await window.reviewApp.getInitialRequest();
    state.daemonConnected = true;
    state.daemonError = '';
  } catch (error) {
    currentRequest = null;
    state.daemonConnected = false;
    state.daemonError = error.message || 'Unable to reach daemon.';
  }

  debugTrace('boot:request-loaded', {
    hasRequest: Boolean(currentRequest),
    artifactType: currentRequest ? currentRequest.artifactType : null,
    requestId: currentRequest ? currentRequest.id : null,
  });

  resetSessionState();
  renderRequest(currentRequest);
  await refreshGeneratedFiles();

  if (!actionsBound) {
    bindActions();
    window.addEventListener('resize', onWindowResize);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    document.addEventListener('pointerdown', onDocumentPointerDown);

    if (
      window.reviewApp &&
      typeof window.reviewApp.onResultSubmitted === 'function'
    ) {
      window.reviewApp.onResultSubmitted(function onResultSubmitted(payload) {
        state.lastSubmittedResult = payload || null;
        state.isSubmitting = false;
        state.daemonConnected = true;
        state.daemonError =
          payload && payload.status
            ? `Review submitted: ${payload.status}`
            : 'Review submitted.';
        updateStatus();
      });
    }

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
  state.marquee = null;
  state.stageRect = null;
  state.artifactMetrics = null;
  state.selectedAnnotationId = null;
  state.selectedAnnotationIds = [];
  state.newlyCreatedTextId = null;
  state.dragging = null;
  state.pendingDrag = null;
  state.panning = null;
  state.spacePan = false;
  state.zoom = 1;
  state.isSubmitting = false;
  state.lastSubmittedResult = null;
  state.statusPopoverOpen = false;
  state.helpPopoverOpen = false;
  state.drawToolMenuOpen = false;
  els.message.value = '';
  updateTopbarPopovers();
  updateToolMenu();
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

function updateToolMenu() {
  if (els.drawToolMenu) {
    els.drawToolMenu.classList.toggle('hidden', !state.drawToolMenuOpen);
  }

  if (els.drawToolToggle) {
    els.drawToolToggle.setAttribute(
      'aria-expanded',
      state.drawToolMenuOpen ? 'true' : 'false'
    );
  }
}

function closeTopbarPopovers() {
  const hasOpenOverlay =
    state.statusPopoverOpen || state.helpPopoverOpen || state.drawToolMenuOpen;
  if (hasOpenOverlay) {
    state.statusPopoverOpen = false;
    state.helpPopoverOpen = false;
    state.drawToolMenuOpen = false;
    updateTopbarPopovers();
    updateToolMenu();
  }

  if (state.artifactPickerOpen) {
    state.artifactPickerOpen = false;
    updateArtifactPicker();
  }
}

function onDocumentPointerDown(event) {
  const hasTopbarOverlay =
    state.statusPopoverOpen ||
    state.helpPopoverOpen ||
    state.drawToolMenuOpen ||
    state.artifactPickerOpen;
  const hasInlineEditor = state.inlineEditor && state.inlineEditor.open;

  if (!hasTopbarOverlay && !hasInlineEditor) {
    return;
  }

  const target = event.target;

  if (
    (els.statusInfoToggle && els.statusInfoToggle.contains(target)) ||
    (els.statusPopover && els.statusPopover.contains(target)) ||
    (els.helpInfoToggle && els.helpInfoToggle.contains(target)) ||
    (els.helpPopover && els.helpPopover.contains(target)) ||
    (els.drawToolToggle && els.drawToolToggle.contains(target)) ||
    (els.drawToolMenu && els.drawToolMenu.contains(target)) ||
    (els.artifactPickerToggle && els.artifactPickerToggle.contains(target)) ||
    (els.artifactPickerMenu && els.artifactPickerMenu.contains(target)) ||
    (els.inlineEditor && els.inlineEditor.contains(target))
  ) {
    return;
  }

  closeTopbarPopovers();
  if (hasInlineEditor) {
    closeInlineEditor();
  }
}

function renderRequest(request) {
  debugTrace('renderRequest', {
    hasRequest: Boolean(request),
    artifactType: request ? request.artifactType : null,
    requestId: request ? request.id : null,
  });

  if (!request) {
    els.title.textContent = 'Waiting for review request…';
    els.prompt.textContent =
      'The review window is idle. Submit a request from the CLI and it will appear here automatically.';
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
  debugTrace('renderImage', {
    sourcePath: request ? request.sourcePath : null,
  });
  setArtifactMode('image');

  const img = document.createElement('img');
  img.src = toFileUrl(request.sourcePath);
  img.alt = request.title || 'Review image';
  img.onload = onArtifactReady;

  resetArtifactHost();
  els.artifactHost.appendChild(img);
}

function renderHtml(request) {
  debugTrace('renderHtml');
  setArtifactMode('default');

  const iframe = document.createElement('iframe');
  iframe.setAttribute('sandbox', 'allow-scripts');
  iframe.srcdoc = request.inlineContent || '';
  iframe.onload = onArtifactReady;

  resetArtifactHost();
  els.artifactHost.appendChild(iframe);
}

function renderMermaid(request) {
  debugTrace('renderMermaid', {
    hasInlineContent: Boolean(request && request.inlineContent),
    hasScriptUrl: Boolean(request && request.mermaidScriptUrl),
  });
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
  iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin');
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
    '<div id="diagram">Rendering…</div>',
    '<script>',
    'async function render() {',
    '  try {',
    '    mermaid.initialize({ startOnLoad: false, theme: "default", securityLevel: "strict" });',
    '    var result = await mermaid.render("mmd-" + Date.now(), `' +
      escapedSource +
      '`);',
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
    '</body></html>',
  ].join('\n');

  function onMessage(event) {
    if (!event.data || !event.data.type) {
      return;
    }

    if (event.data.type === 'mermaid-ready') {
      var h = parseInt(event.data.height, 10);
      if (h && h > 0) {
        iframe.style.height = h + 48 + 'px';
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

  if (els.inlineEditorInput) {
    ['input', 'change'].forEach((eventName) => {
      els.inlineEditorInput.addEventListener(eventName, function onInlineEditorInput() {
        state.inlineEditor.value = els.inlineEditorInput.value;
      });
    });
  }

  if (els.annotationMetaInput) {
    ['input', 'change'].forEach((eventName) => {
      els.annotationMetaInput.addEventListener(eventName, function onAnnotationMetaInput() {
        const annotation = getSelectedAnnotation();
        if (!annotation || state.selectedAnnotationIds.length > 1) {
          return;
        }

        applyAnnotationValue(annotation, els.annotationMetaInput.value);
      });
    });
  }

  if (els.inlineEditorSave) {
    els.inlineEditorSave.addEventListener('click', function onInlineEditorSave() {
      saveInlineEditor();
    });
  }

  if (els.inlineEditorCancel) {
    els.inlineEditorCancel.addEventListener('click', function onInlineEditorCancel() {
      closeInlineEditor();
    });
  }

  if (els.inlineEditorBackdrop) {
    els.inlineEditorBackdrop.addEventListener('click', function onBackdropClick() {
      closeInlineEditor();
    });
  }

  if (els.inlineEditorClose) {
    els.inlineEditorClose.addEventListener('click', function onCloseClick() {
      closeInlineEditor();
    });
  }

  if (els.statusInfoToggle) {
    els.statusInfoToggle.addEventListener(
      'click',
      function onStatusInfoToggle(event) {
        event.preventDefault();
        event.stopPropagation();
        state.statusPopoverOpen = !state.statusPopoverOpen;
        if (state.statusPopoverOpen) {
          state.helpPopoverOpen = false;
          state.drawToolMenuOpen = false;
        }
        updateTopbarPopovers();
        updateToolMenu();
      }
    );
  }

  if (els.helpInfoToggle) {
    els.helpInfoToggle.addEventListener(
      'click',
      function onHelpInfoToggle(event) {
        event.preventDefault();
        event.stopPropagation();
        state.helpPopoverOpen = !state.helpPopoverOpen;
        if (state.helpPopoverOpen) {
          state.statusPopoverOpen = false;
          state.drawToolMenuOpen = false;
        }
        updateTopbarPopovers();
        updateToolMenu();
      }
    );
  }

  if (els.artifactPickerToggle && els.artifactPickerMenu) {
    els.artifactPickerToggle.addEventListener(
      'click',
      function onArtifactPickerToggle(event) {
        event.preventDefault();
        event.stopPropagation();
        state.artifactPickerOpen = !state.artifactPickerOpen;
        updateArtifactPicker();
      }
    );
  }

  if (els.drawToolGroup && els.drawToolToggle && els.drawToolMenu) {
    els.drawToolToggle.addEventListener(
      'click',
      function onDrawToolToggleClick(event) {
        event.preventDefault();
        event.stopPropagation();
        state.drawToolMenuOpen = !state.drawToolMenuOpen;
        if (state.drawToolMenuOpen) {
          state.statusPopoverOpen = false;
          state.helpPopoverOpen = false;
        }
        updateTopbarPopovers();
        updateToolMenu();
      }
    );
  }

  els.toolButtons.forEach((button) => {
    button.addEventListener('click', function onToolSelect(event) {
      event.preventDefault();
      event.stopPropagation();
      state.tool = button.dataset.tool;
      state.drawToolMenuOpen = false;
      updateToolButtons();
      updateToolMenu();
      updateStatus();
    });
  });

  els.viewer.addEventListener('pointerdown', onPointerDown);
  els.viewer.addEventListener('pointermove', onPointerMove);
  els.viewer.addEventListener('pointerup', onPointerUp);
  els.viewer.addEventListener('pointercancel', onPointerUp);
  els.viewer.addEventListener('pointerleave', onPointerUp);
  els.viewer.addEventListener('scroll', onViewerScroll, { passive: true });
  els.annotationLayer.addEventListener('click', onAnnotationLayerClick);
  els.annotationLayer.addEventListener('dblclick', onDoubleClick);
  els.viewer.addEventListener('wheel', onViewerWheel, { passive: false });
}

function onPointerDown(event) {
  if (els.inlineEditor && els.inlineEditor.contains(event.target)) {
    return;
  }

  syncStageGeometry();
  syncArtifactMetrics();

  if (shouldStartPanning(event)) {
    startPanning(event);
    return;
  }

  if (
    event.target === els.viewer ||
    event.target === els.viewerStage ||
    event.target === els.artifactHost
  ) {
    if (state.tool === 'select' && isWithinArtifact(event)) {
      beginMarquee(event);
    } else {
      state.selectedAnnotationId = null;
      state.selectedAnnotationIds = [];
      closeInlineEditor();
      updateStatus();
      renderAnnotations();
    }
    return;
  }

  const handleInfo = findHandleInfo(event.target);
  if (handleInfo) {
    state.selectedAnnotationId = handleInfo.annotationId;
    state.selectedAnnotationIds = [handleInfo.annotationId];
    startHandleDragging(handleInfo, event);
    closeInlineEditor();
    updateStatus();
    renderAnnotations();
    return;
  }

  const annotationId = findAnnotationId(event.target);
  if (annotationId) {
    state.selectedAnnotationId = annotationId;
    state.selectedAnnotationIds = [annotationId];

    if (event.detail >= 2) {
      state.pendingDrag = null;
      updateStatus();
      updateInspector();
      renderAnnotations();
      openInlineEditor(annotationId);
      return;
    }

    const annotation = getSelectedAnnotation();
    if (annotation) {
      queueAnnotationDrag(annotation, event);
    }
    closeInlineEditor();
    updateStatus();
    updateInspector();
    renderAnnotations();
    return;
  }

  if (!isWithinArtifact(event)) {
    state.selectedAnnotationId = null;
    state.selectedAnnotationIds = [];
    closeInlineEditor();
    updateStatus();
    renderAnnotations();
    return;
  }

  if (state.tool === 'select') {
    beginMarquee(event);
    return;
  }

  beginDraft(event);
}

function onPointerMove(event) {
  if (state.panning) {
    continuePanning(event);
    return;
  }

  if (state.pendingDrag) {
    maybeStartPendingDrag(event);
  }

  if (state.dragging) {
    continueDragging(event);
    return;
  }

  if (state.draft) {
    updateDraft(event);
  }

  if (state.marquee) {
    updateMarquee(event);
  }
}

function onPointerUp(event) {
  if (state.panning) {
    releaseViewerPointerCapture(event);
    state.panning = null;
    return;
  }

  if (state.dragging) {
    releaseViewerPointerCapture(event);
    state.dragging = null;
    updateStatus();
    updateInspector();
    renderAnnotations();
    return;
  }

  if (state.pendingDrag) {
    state.pendingDrag = null;
    updateStatus();
    updateInspector();
    renderAnnotations();
    return;
  }

  if (state.marquee) {
    finalizeMarquee();
    return;
  }

  if (!state.draft) {
    return;
  }

  finalizeDraft();
}

function onAnnotationLayerClick(event) {
  if (event.detail < 2 || (els.inlineEditor && els.inlineEditor.contains(event.target))) {
    return;
  }

  const annotationId = findAnnotationId(event.target);
  if (!annotationId) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  state.pendingDrag = null;
  state.selectedAnnotationId = annotationId;
  state.selectedAnnotationIds = [annotationId];
  updateStatus();
  updateInspector();
  renderAnnotations();
  openInlineEditor(annotationId);
}

function onDoubleClick(event) {
  if (els.inlineEditor && els.inlineEditor.contains(event.target)) {
    return;
  }

  const annotationId = findAnnotationId(event.target);
  if (annotationId) {
    event.preventDefault();
    event.stopPropagation();
    state.pendingDrag = null;
    state.selectedAnnotationId = annotationId;
    state.selectedAnnotationIds = [annotationId];
    updateStatus();
    updateInspector();
    renderAnnotations();
    openInlineEditor(annotationId);
    return;
  }

  event.preventDefault();
  event.stopPropagation();

  if (state.tool !== 'text' || !isWithinArtifact(event)) {
    return;
  }

  const point = pointerToArtifactPoint(event);
  const annotation = {
    id: generateAnnotationId(),
    type: 'text',
    x: point.x,
    y: point.y,
    text: 'Text note',
  };

  state.annotations.push(annotation);
  state.selectedAnnotationId = annotation.id;
  state.selectedAnnotationIds = [annotation.id];
  state.newlyCreatedTextId = annotation.id;
  updateStatus();
  renderAnnotations();
  openInlineEditor(annotation.id);
}

function shouldStartPanning(event) {
  return state.spacePan || event.metaKey || event.ctrlKey || event.button === 1;
}

function startPanning(event) {
  if (event.pointerId != null && els.viewer.setPointerCapture) {
    try {
      els.viewer.setPointerCapture(event.pointerId);
    } catch {}
  }

  state.panning = {
    pointerId: event.pointerId,
    pointerX: event.clientX,
    pointerY: event.clientY,
    scrollLeft: els.viewer.scrollLeft,
    scrollTop: els.viewer.scrollTop,
  };
}

function continuePanning(event) {
  if (!state.panning) {
    return;
  }

  const deltaX = event.clientX - state.panning.pointerX;
  const deltaY = event.clientY - state.panning.pointerY;
  els.viewer.scrollLeft = state.panning.scrollLeft - deltaX;
  els.viewer.scrollTop = state.panning.scrollTop - deltaY;
}

function beginMarquee(event) {
  const point = pointerToArtifactPoint(event);
  if (!point) {
    return;
  }

  state.marquee = {
    start: point,
    end: point,
  };
  renderAnnotations();
}

function updateMarquee(event) {
  const point = pointerToArtifactPoint(event);
  if (!point || !state.marquee) {
    return;
  }

  state.marquee.end = point;
  renderAnnotations();
}

function finalizeMarquee() {
  const marquee = state.marquee;
  state.marquee = null;

  if (!marquee) {
    return;
  }

  const bounds = normalizeBounds(marquee.start, marquee.end);
  const selectedIds = state.annotations
    .filter((annotation) => annotationIntersectsBounds(annotation, bounds))
    .map((annotation) => annotation.id);

  state.selectedAnnotationIds = selectedIds;
  state.selectedAnnotationId = selectedIds[0] || null;
  closeInlineEditor();
  updateStatus();
  renderAnnotations();
}

function beginDraft(event) {
  const point = pointerToArtifactPoint(event);
  if (!point) {
    return;
  }

  if (state.tool === 'rect') {
    state.draft = {
      type: 'rect',
      start: point,
      end: point,
    };
    renderAnnotations();
    return;
  }

  if (state.tool === 'arrow') {
    state.draft = {
      type: 'arrow',
      start: point,
      end: point,
    };
    renderAnnotations();
    return;
  }
}

function updateDraft(event) {
  const point = pointerToArtifactPoint(event);
  if (!point) {
    return;
  }

  state.draft.end = point;
  renderAnnotations();
}

function finalizeDraft() {
  const draft = state.draft;
  state.draft = null;

  if (!draft) {
    return;
  }

  const annotation = draftToAnnotation(draft);
  if (!annotation) {
    renderAnnotations();
    return;
  }

  state.annotations.push(annotation);
  state.selectedAnnotationId = annotation.id;
  state.selectedAnnotationIds = [annotation.id];
  if (
    annotation.type === 'rect' ||
    annotation.type === 'arrow' ||
    annotation.type === 'text'
  ) {
    state.newlyCreatedTextId = annotation.id;
  }
  updateStatus();
  renderAnnotations();
  openInlineEditor(annotation.id);
}

function draftToAnnotation(draft) {
  if (draft.type === 'rect') {
    const width = draft.end.x - draft.start.x;
    const height = draft.end.y - draft.start.y;

    if (Math.abs(width) < 6 || Math.abs(height) < 6) {
      return null;
    }

    return {
      id: generateAnnotationId(),
      type: 'rect',
      x: Math.min(draft.start.x, draft.end.x),
      y: Math.min(draft.start.y, draft.end.y),
      width: Math.abs(width),
      height: Math.abs(height),
      label: '',
    };
  }

  if (draft.type === 'arrow') {
    if (
      Math.abs(draft.end.x - draft.start.x) < 6 &&
      Math.abs(draft.end.y - draft.start.y) < 6
    ) {
      return null;
    }

    return {
      id: generateAnnotationId(),
      type: 'arrow',
      x1: draft.start.x,
      y1: draft.start.y,
      x2: draft.end.x,
      y2: draft.end.y,
      label: '',
    };
  }

  return null;
}

function queueAnnotationDrag(annotation, event) {
  const stageRect = els.viewerStage.getBoundingClientRect();
  const point = pointerToArtifactPoint(event, stageRect);
  if (!point) {
    return;
  }

  state.pendingDrag = {
    pointerId: event.pointerId,
    annotationId: annotation.id,
    pointerStart: point,
    annotationSnapshot: cloneAnnotation(annotation),
    stageRect,
  };
}

function maybeStartPendingDrag(event) {
  const pendingDrag = state.pendingDrag;
  if (!pendingDrag) {
    return;
  }

  if (
    pendingDrag.pointerId != null &&
    event.pointerId != null &&
    pendingDrag.pointerId !== event.pointerId
  ) {
    return;
  }

  const point = pointerToArtifactPoint(event, pendingDrag.stageRect);
  if (!point) {
    return;
  }

  const dx = point.x - pendingDrag.pointerStart.x;
  const dy = point.y - pendingDrag.pointerStart.y;
  if (Math.hypot(dx, dy) < DRAG_START_THRESHOLD) {
    return;
  }

  if (event.pointerId != null && els.viewer.setPointerCapture) {
    try {
      els.viewer.setPointerCapture(event.pointerId);
    } catch {}
  }

  state.dragging = {
    mode: 'move',
    pointerId: event.pointerId,
    annotationId: pendingDrag.annotationId,
    pointerStart: pendingDrag.pointerStart,
    annotationSnapshot: pendingDrag.annotationSnapshot,
    stageRect: pendingDrag.stageRect,
  };
  state.pendingDrag = null;
}

function startHandleDragging(handleInfo, event) {
  const annotation = state.annotations.find(
    (item) => item.id === handleInfo.annotationId
  );
  if (!annotation) {
    return;
  }

  const stageRect = els.viewerStage.getBoundingClientRect();
  const point = pointerToArtifactPoint(event, stageRect);
  if (!point) {
    return;
  }

  if (event.pointerId != null && els.viewer.setPointerCapture) {
    try {
      els.viewer.setPointerCapture(event.pointerId);
    } catch {}
  }

  state.dragging = {
    mode: 'handle',
    pointerId: event.pointerId,
    annotationId: annotation.id,
    handle: handleInfo.handle,
    pointerStart: point,
    annotationSnapshot: cloneAnnotation(annotation),
    stageRect,
  };
}

function continueDragging(event) {
  const dragging = state.dragging;
  if (!dragging) {
    return;
  }

  const point = pointerToArtifactPoint(event, dragging.stageRect);
  if (!point) {
    return;
  }

  const annotation = state.annotations.find(
    (item) => item.id === dragging.annotationId
  );
  if (!annotation) {
    return;
  }

  const dx = point.x - dragging.pointerStart.x;
  const dy = point.y - dragging.pointerStart.y;

  if (dragging.mode === 'move') {
    applyAnnotationMove(annotation, dragging.annotationSnapshot, dx, dy);
  }

  if (dragging.mode === 'handle') {
    applyHandleMove(
      annotation,
      dragging.annotationSnapshot,
      dragging.handle,
      dx,
      dy
    );
  }

  patchAnnotationNode(annotation);
  updateInlineEditorPosition();
}

function applyAnnotationMove(annotation, snapshot, dx, dy) {
  if (annotation.type === 'rect') {
    annotation.x = snapshot.x + dx;
    annotation.y = snapshot.y + dy;
    return;
  }

  if (annotation.type === 'arrow') {
    annotation.x1 = snapshot.x1 + dx;
    annotation.y1 = snapshot.y1 + dy;
    annotation.x2 = snapshot.x2 + dx;
    annotation.y2 = snapshot.y2 + dy;
    return;
  }

  if (annotation.type === 'text') {
    annotation.x = snapshot.x + dx;
    annotation.y = snapshot.y + dy;
  }
}

function applyHandleMove(annotation, snapshot, handle, dx, dy) {
  if (annotation.type === 'rect') {
    applyRectHandleMove(annotation, snapshot, handle, dx, dy);
    return;
  }

  if (annotation.type === 'arrow') {
    if (handle === 'start') {
      annotation.x1 = snapshot.x1 + dx;
      annotation.y1 = snapshot.y1 + dy;
    }

    if (handle === 'end') {
      annotation.x2 = snapshot.x2 + dx;
      annotation.y2 = snapshot.y2 + dy;
    }
  }
}

function applyRectHandleMove(annotation, snapshot, handle, dx, dy) {
  const startX = snapshot.x;
  const startY = snapshot.y;
  const endX = snapshot.x + snapshot.width;
  const endY = snapshot.y + snapshot.height;

  let nextStartX = startX;
  let nextStartY = startY;
  let nextEndX = endX;
  let nextEndY = endY;

  if (handle.includes('left')) {
    nextStartX = startX + dx;
  }

  if (handle.includes('right')) {
    nextEndX = endX + dx;
  }

  if (handle.includes('top')) {
    nextStartY = startY + dy;
  }

  if (handle.includes('bottom')) {
    nextEndY = endY + dy;
  }

  annotation.x = Math.min(nextStartX, nextEndX);
  annotation.y = Math.min(nextStartY, nextEndY);
  annotation.width = Math.abs(nextEndX - nextStartX);
  annotation.height = Math.abs(nextEndY - nextStartY);
}

function undoLastAnnotation() {
  if (state.annotations.length === 0) {
    return;
  }

  const removed = state.annotations.pop();
  if (removed && removed.id === state.selectedAnnotationId) {
    state.selectedAnnotationId = null;
  }
  if (removed) {
    state.selectedAnnotationIds = state.selectedAnnotationIds.filter(
      (id) => id !== removed.id
    );
  }

  const activeAnnotation = getSelectedAnnotation();
  if (!activeAnnotation || state.selectedAnnotationIds.length !== 1) {
    closeInlineEditor();
  }

  updateStatus();
  updateInspector();
  renderAnnotations();
}

function duplicateSelectedAnnotation() {
  const sourceIds = state.selectedAnnotationIds.length
    ? state.selectedAnnotationIds
    : state.selectedAnnotationId
      ? [state.selectedAnnotationId]
      : [];

  if (!sourceIds.length) {
    return;
  }

  const idSet = new Set(sourceIds);
  const duplicates = state.annotations
    .filter((annotation) => idSet.has(annotation.id))
    .map((annotation) => {
      const duplicate = cloneAnnotation(annotation);
      duplicate.id = generateAnnotationId();

      if (duplicate.type === 'rect' || duplicate.type === 'text') {
        duplicate.x += 16;
        duplicate.y += 16;
      }

      if (duplicate.type === 'arrow') {
        duplicate.x1 += 16;
        duplicate.y1 += 16;
        duplicate.x2 += 16;
        duplicate.y2 += 16;
      }

      return duplicate;
    });

  if (!duplicates.length) {
    return;
  }

  state.annotations.push(...duplicates);
  state.selectedAnnotationId = duplicates[0].id;
  state.selectedAnnotationIds = duplicates.map((annotation) => annotation.id);
  closeInlineEditor();
  updateStatus();
  renderAnnotations();
}

function deleteSelectedAnnotation() {
  const idsToDelete = state.selectedAnnotationIds.length
    ? state.selectedAnnotationIds
    : state.selectedAnnotationId
      ? [state.selectedAnnotationId]
      : [];

  if (!idsToDelete.length) {
    return;
  }

  const idSet = new Set(idsToDelete);
  state.annotations = state.annotations.filter((item) => !idSet.has(item.id));
  state.selectedAnnotationId = null;
  state.selectedAnnotationIds = [];
  closeInlineEditor();
  updateStatus();
  renderAnnotations();
}

function clearAllAnnotations() {
  if (state.annotations.length === 0) {
    return;
  }

  state.annotations = [];
  state.selectedAnnotationId = null;
  state.selectedAnnotationIds = [];
  closeInlineEditor();
  updateStatus();
  renderAnnotations();
}

function getSelectedAnnotation() {
  return (
    state.annotations.find((item) => item.id === state.selectedAnnotationId) ||
    null
  );
}

function applyAnnotationValue(annotation, value) {
  if (!annotation) {
    return;
  }

  if (annotation.type === 'text') {
    annotation.text = value;
  } else {
    annotation.label = value;
    if (annotation.type === 'rect') {
      expandRectToFitLabel(annotation);
    }
  }

  if (els.annotationMetaInput && document.activeElement !== els.annotationMetaInput) {
    els.annotationMetaInput.value = getAnnotationDisplayValue(annotation);
  }

  renderAnnotations();
  updateInspector();
}

function expandRectToFitLabel(rect) {
  if (!rect || rect.type !== 'rect') {
    return;
  }

  const metrics = measureRectLabel(rect.label || '');
  if (!metrics) {
    return;
  }

  rect.width = Math.max(rect.width, metrics.width);
  rect.height = Math.max(rect.height, metrics.height);
}

function measureRectLabel(label) {
  const lines = String(label || '').split(/\r?\n/);
  if (!lines.length || lines.every((line) => !line)) {
    return null;
  }

  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) {
    return null;
  }

  context.font = '600 13px Inter, system-ui, sans-serif';

  const paddingLeft = 10;
  const paddingRight = 14;
  const paddingTop = 18;
  const paddingBottom = 12;
  const lineHeight = 16;
  const widestLine = lines.reduce((maxWidth, line) => {
    const nextWidth = context.measureText(line || ' ').width;
    return Math.max(maxWidth, nextWidth);
  }, 0);

  return {
    width: Math.ceil(paddingLeft + widestLine + paddingRight),
    height: Math.ceil(
      paddingTop + Math.max(lines.length - 1, 0) * lineHeight + paddingBottom
    ),
  };
}

function updateToolButtons() {
  els.toolButtons.forEach((button) => {
    const isActive = button.dataset.tool === state.tool;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-checked', isActive ? 'true' : 'false');
  });

  els.drawToolIcons.forEach((iconNode) => {
    iconNode.classList.toggle(
      'hidden',
      iconNode.dataset.activeToolIcon !== state.tool
    );
  });

  if (els.drawToolToggle) {
    const activeButton = els.toolButtons.find(
      (button) => button.dataset.tool === state.tool
    );
    els.drawToolToggle.setAttribute(
      'aria-label',
      activeButton
        ? `Drawing tools: ${activeButton.dataset.tool}`
        : 'Drawing tools'
    );
  }

  if (els.activeTool) {
    els.activeTool.textContent = `Tool: ${state.tool}`;
  }
}

function updateInspector() {
  if (!els.inspectorEmpty || !els.inspectorContent || !els.inspectorType || !els.annotationMetaInput || !els.inspectorLabel) {
    return;
  }

  const hasSingleSelection = state.selectedAnnotationIds.length === 1;
  const annotation = hasSingleSelection ? getSelectedAnnotation() : null;

  els.inspectorEmpty.classList.toggle('hidden', Boolean(annotation));
  els.inspectorContent.classList.toggle('hidden', !annotation);

  if (!annotation) {
    els.annotationMetaInput.value = '';
    els.annotationMetaInput.disabled = true;
    if (state.selectedAnnotationIds.length > 1) {
      els.inspectorEmpty.textContent = `Selected ${state.selectedAnnotationIds.length} annotations. Edit one at a time.`;
    } else {
      els.inspectorEmpty.textContent = 'Select an annotation to inspect its details.';
    }
    return;
  }

  const isTextAnnotation = annotation.type === 'text';
  els.inspectorType.textContent = isTextAnnotation
    ? 'Text annotation'
    : annotation.type === 'rect'
      ? 'Rectangle annotation'
      : 'Arrow annotation';
  els.inspectorLabel.textContent = isTextAnnotation ? 'Text content' : 'Annotation note';
  els.annotationMetaInput.disabled = false;
  els.annotationMetaInput.value = getAnnotationDisplayValue(annotation);
}

function getAnnotationDisplayValue(annotation) {
  if (!annotation) {
    return '';
  }

  return annotation.type === 'text' ? annotation.text || '' : annotation.label || '';
}

function updateStatus() {
  if (els.zoomLevel) {
    els.zoomLevel.textContent = `${Math.round(state.zoom * 100)}%`;
  }

  if (els.zoomState) {
    els.zoomState.textContent = `Zoom: ${Math.round(state.zoom * 100)}%`;
  }

  if (els.selectionState) {
    els.selectionState.textContent =
      state.selectedAnnotationIds.length > 1
        ? `Selected: ${state.selectedAnnotationIds.length} items`
        : state.selectedAnnotationId
          ? `Selected: ${state.selectedAnnotationId}`
          : 'Selected: none';
  }

  if (els.annotationCount) {
    els.annotationCount.textContent = `Annotations: ${state.annotations.length}`;
  }

  if (els.artifactBoxState) {
    els.artifactBoxState.textContent = state.artifactMetrics
      ? `Artifact box: ${Math.round(state.artifactMetrics.x)}, ${Math.round(state.artifactMetrics.y)} · ${Math.round(state.artifactMetrics.width)}×${Math.round(state.artifactMetrics.height)}`
      : 'Artifact box: unavailable';
  }

  if (els.daemonConnectionState) {
    els.daemonConnectionState.textContent = state.daemonConnected
      ? 'Daemon: connected'
      : 'Daemon: offline';
    els.daemonConnectionState.className = `status-pill ${state.daemonConnected ? 'status-pill-success' : 'status-pill-danger'}`;
  }

  if (els.sessionModeState) {
    els.sessionModeState.textContent = currentRequest
      ? 'Session: active request'
      : 'Session: idle';
    els.sessionModeState.className = `status-pill ${currentRequest ? 'status-pill-primary' : 'status-pill-neutral'}`;
  }

  if (els.queueState) {
    els.queueState.textContent = `Queued: ${state.queuedCount}`;
  }

  if (els.requestState) {
    els.requestState.textContent = currentRequest
      ? `Request: ${currentRequest.id}`
      : 'Request: none';
  }

  if (els.daemonMessage) {
    if (state.isSubmitting) {
      els.daemonMessage.textContent = 'Submitting review result…';
    } else if (state.lastSubmittedResult && state.lastSubmittedResult.status) {
      els.daemonMessage.textContent = `Last action: ${state.lastSubmittedResult.status}`;
    } else if (state.daemonError) {
      els.daemonMessage.textContent = state.daemonError;
    } else if (currentRequest) {
      els.daemonMessage.textContent = 'Review request ready.';
    } else {
      els.daemonMessage.textContent = 'Waiting for the next review request…';
    }
  }
}

function openInlineEditor(annotationId) {
  const annotation = state.annotations.find((item) => item.id === annotationId);
  if (!annotation || !els.inlineEditor || !els.inlineEditorInput) {
    return;
  }

  const point = getAnnotationEditorPoint(annotation);
  state.inlineEditor.open = true;
  state.inlineEditor.annotationId = annotationId;
  state.inlineEditor.value = annotation.type === 'text' ? annotation.text || '' : annotation.label || '';
  state.inlineEditor.x = point.x;
  state.inlineEditor.y = point.y;

  if (els.inlineEditorTitle) {
    els.inlineEditorTitle.textContent = annotation.type === 'text' ? 'Edit text note' : 'Edit annotation note';
  }

  els.inlineEditorInput.value = state.inlineEditor.value;
  els.inlineEditor.classList.remove('hidden');
  updateInlineEditorPosition();

  window.requestAnimationFrame(() => {
    updateInlineEditorPosition();
    els.inlineEditorInput.focus();
    const value = els.inlineEditorInput.value || '';
    els.inlineEditorInput.setSelectionRange(value.length, value.length);
    state.newlyCreatedTextId = null;
  });
}

function closeInlineEditor() {
  state.inlineEditor.open = false;
  state.inlineEditor.annotationId = null;
  state.inlineEditor.value = '';
  if (els.inlineEditor) {
    els.inlineEditor.classList.add('hidden');
    els.inlineEditor.style.left = '';
    els.inlineEditor.style.top = '';
  }
}

function saveInlineEditor() {
  const annotation = state.annotations.find(
    (item) => item.id === state.inlineEditor.annotationId
  );
  if (!annotation) {
    closeInlineEditor();
    return;
  }

  state.selectedAnnotationId = annotation.id;
  state.selectedAnnotationIds = [annotation.id];
  applyAnnotationValue(
    annotation,
    els.inlineEditorInput ? els.inlineEditorInput.value : state.inlineEditor.value
  );
  closeInlineEditor();
}

function getAnnotationEditorPoint(annotation) {
  const margin = 12;

  if (annotation.type === 'text') {
    return {
      x: annotation.x + margin,
      y: Math.max(annotation.y - 18, 8),
    };
  }

  if (annotation.type === 'rect') {
    return {
      x: annotation.x + Math.min(annotation.width + margin, 240),
      y: Math.max(annotation.y, 8),
    };
  }

  return {
    x: Math.max((annotation.x1 + annotation.x2) / 2 + margin, 8),
    y: Math.max((annotation.y1 + annotation.y2) / 2 - 12, 8),
  };
}

function updateInlineEditorPosition() {
  if (!state.inlineEditor.open || !els.inlineEditor || !els.viewer) {
    return;
  }

  const annotation = state.annotations.find(
    (item) => item.id === state.inlineEditor.annotationId
  );
  if (!annotation) {
    closeInlineEditor();
    return;
  }

  const point = getAnnotationEditorPoint(annotation);
  state.inlineEditor.x = point.x;
  state.inlineEditor.y = point.y;

  const editorWidth = els.inlineEditor.offsetWidth || 280;
  const editorHeight = els.inlineEditor.offsetHeight || 180;
  const margin = 12;
  const rawLeft = point.x * state.zoom - els.viewer.scrollLeft;
  const rawTop = point.y * state.zoom - els.viewer.scrollTop;
  const maxLeft = Math.max(els.viewer.clientWidth - editorWidth - margin, margin);
  const maxTop = Math.max(els.viewer.clientHeight - editorHeight - margin, margin);
  const left = Math.min(Math.max(rawLeft, margin), maxLeft);
  const top = Math.min(Math.max(rawTop, margin), maxTop);

  els.inlineEditor.style.left = `${left}px`;
  els.inlineEditor.style.top = `${top}px`;
}

let _renderScheduled = false;
function scheduleRenderAnnotations() {
  if (_renderScheduled) return;
  _renderScheduled = true;
  window.requestAnimationFrame(() => {
    _renderScheduled = false;
    performRenderAnnotations();
    // after annotations updated, ensure inline editor follows selected annotation if open
    if (state.inlineEditor && state.inlineEditor.open) {
      updateInlineEditorPosition();
    }
  });
}

function performRenderAnnotations() {
  annotationNodeCache.clear();

  while (els.annotationLayer.firstChild) {
    els.annotationLayer.removeChild(els.annotationLayer.firstChild);
  }

  state.annotations.forEach((annotation) => {
    els.annotationLayer.appendChild(buildAnnotationNode(annotation));
  });

  if (state.marquee) {
    els.annotationLayer.appendChild(buildMarqueeNode(state.marquee));
  }

  if (state.draft) {
    const draftNode = buildDraftNode(state.draft);
    if (draftNode) {
      els.annotationLayer.appendChild(draftNode);
    }
  }
}

// Backwards-compatible alias: immediate render request (schedules next frame)
function renderAnnotations() {
  scheduleRenderAnnotations();
}

function buildAnnotationNode(annotation) {
  const group = document.createElementNS(SVG_NS, 'g');
  group.setAttribute('class', 'annotation');
  group.dataset.annotationId = annotation.id;
  group.classList.toggle('is-selected', isAnnotationSelected(annotation.id));

  if (annotation.type === 'rect') {
    appendRectNode(group, annotation);
  }

  if (annotation.type === 'arrow') {
    appendArrowNode(group, annotation);
  }

  if (annotation.type === 'text') {
    appendTextNode(group, annotation);
  }

  annotationNodeCache.set(annotation.id, group);
  return group;
}

function isAnnotationSelected(annotationId) {
  return (
    annotationId === state.selectedAnnotationId ||
    state.selectedAnnotationIds.includes(annotationId)
  );
}

function buildDraftNode(draft) {
  if (!draft) {
    return null;
  }

  const group = document.createElementNS(SVG_NS, 'g');
  group.setAttribute('class', 'annotation annotation-draft');

  const annotation = draftToAnnotation(draft);
  if (!annotation) {
    return null;
  }

  if (annotation.type === 'rect') {
    appendRectNode(group, annotation, true);
  }

  if (annotation.type === 'arrow') {
    appendArrowNode(group, annotation, true);
  }

  return group;
}

function buildMarqueeNode(marquee) {
  const bounds = normalizeBounds(marquee.start, marquee.end);
  const node = document.createElementNS(SVG_NS, 'rect');
  node.setAttribute('class', 'annotation-marquee');
  node.setAttribute('x', bounds.x);
  node.setAttribute('y', bounds.y);
  node.setAttribute('width', bounds.width);
  node.setAttribute('height', bounds.height);
  return node;
}

function appendRectNode(group, rect, isDraft) {
  const node = document.createElementNS(SVG_NS, 'rect');
  node.setAttribute('class', 'annotation-rect');
  node.setAttribute('x', rect.x);
  node.setAttribute('y', rect.y);
  node.setAttribute('width', rect.width);
  node.setAttribute('height', rect.height);
  group.appendChild(node);

  if (rect.label) {
    group.appendChild(createRectLabelNode(rect));
  }

  if (!isDraft && isAnnotationSelected(rect.id)) {
    appendRectHandles(group, rect);
  }
}

function appendRectHandles(group, rect) {
  const corners = [
    ['top-left', rect.x, rect.y],
    ['top-right', rect.x + rect.width, rect.y],
    ['bottom-left', rect.x, rect.y + rect.height],
    ['bottom-right', rect.x + rect.width, rect.y + rect.height],
  ];

  corners.forEach(([handle, x, y]) => {
    group.appendChild(createHandle(rect.id, handle, x, y));
  });
}

function appendArrowNode(group, arrow, isDraft) {
  const geometry = getArrowHeadGeometry(arrow);

  const line = document.createElementNS(SVG_NS, 'line');
  line.setAttribute('class', 'annotation-arrow');
  line.setAttribute('x1', arrow.x1);
  line.setAttribute('y1', arrow.y1);
  line.setAttribute('x2', geometry ? geometry.lineEndX : arrow.x2);
  line.setAttribute('y2', geometry ? geometry.lineEndY : arrow.y2);
  group.appendChild(line);

  const head = createArrowHead(geometry);
  if (head) {
    group.appendChild(head);
  }

  if (arrow.label) {
    group.appendChild(
      createLabelNode(
        arrow.label,
        (arrow.x1 + arrow.x2) / 2,
        (arrow.y1 + arrow.y2) / 2 - 10
      )
    );
  }

  if (!isDraft && isAnnotationSelected(arrow.id)) {
    group.appendChild(createHandle(arrow.id, 'start', arrow.x1, arrow.y1));
    group.appendChild(createHandle(arrow.id, 'end', arrow.x2, arrow.y2));
  }
}

function getArrowHeadGeometry(arrow) {
  const dx = arrow.x2 - arrow.x1;
  const dy = arrow.y2 - arrow.y1;
  const length = Math.sqrt(dx * dx + dy * dy);

  if (!length) {
    return null;
  }

  const ux = dx / length;
  const uy = dy / length;
  const headLength = Math.min(10, Math.max(7, length * 0.18));
  const headWidth = headLength * 0.5;
  const tipInset = Math.min(1.5, headLength * 0.15);
  const tipX = arrow.x2 - ux * tipInset;
  const tipY = arrow.y2 - uy * tipInset;
  const baseX = tipX - ux * headLength;
  const baseY = tipY - uy * headLength;

  return {
    tipX,
    tipY,
    leftX: baseX - uy * headWidth,
    leftY: baseY + ux * headWidth,
    rightX: baseX + uy * headWidth,
    rightY: baseY - ux * headWidth,
    lineEndX: baseX,
    lineEndY: baseY,
  };
}

function createArrowHead(geometry) {
  if (!geometry) {
    return null;
  }

  const node = document.createElementNS(SVG_NS, 'path');
  node.setAttribute(
    'd',
    `M ${geometry.tipX} ${geometry.tipY} L ${geometry.leftX} ${geometry.leftY} L ${geometry.rightX} ${geometry.rightY} Z`
  );
  node.setAttribute('class', 'annotation-arrow-head');
  return node;
}

function appendTextNode(group, annotation) {
  const text = document.createElementNS(SVG_NS, 'text');
  text.setAttribute('class', 'annotation-text');
  text.setAttribute('x', annotation.x);
  text.setAttribute('y', annotation.y);
  text.textContent = annotation.text || 'Text note';
  group.appendChild(text);
}

function createLabelNode(label, x, y) {
  const text = document.createElementNS(SVG_NS, 'text');
  text.setAttribute('class', 'annotation-label');
  text.setAttribute('x', x);
  text.setAttribute('y', y);

  const lines = String(label || '').split(/\r?\n/);
  lines.forEach((line, index) => {
    const tspan = document.createElementNS(SVG_NS, 'tspan');
    tspan.setAttribute('x', x);
    tspan.setAttribute('dy', index === 0 ? '0' : '1.2em');
    tspan.textContent = line;
    text.appendChild(tspan);
  });

  return text;
}

function createRectLabelNode(rect) {
  const group = document.createElementNS(SVG_NS, 'g');
  group.setAttribute('class', 'annotation-rect-label-group');

  const paddingX = 10;
  const paddingY = 18;
  const text = document.createElementNS(SVG_NS, 'text');
  text.setAttribute('class', 'annotation-label annotation-label-inside');
  text.setAttribute('x', rect.x + paddingX);
  text.setAttribute('y', rect.y + paddingY);

  const lines = String(rect.label || '').split(/\r?\n/);
  lines.forEach((line, index) => {
    const tspan = document.createElementNS(SVG_NS, 'tspan');
    tspan.setAttribute('x', rect.x + paddingX);
    tspan.setAttribute('dy', index === 0 ? '0' : '1.2em');
    tspan.textContent = line;
    text.appendChild(tspan);
  });

  group.appendChild(text);
  return group;
}

function createHandle(annotationId, handle, x, y) {
  const circle = document.createElementNS(SVG_NS, 'circle');
  circle.setAttribute('class', 'annotation-handle');
  circle.setAttribute('cx', x);
  circle.setAttribute('cy', y);
  circle.setAttribute('r', 4.5);
  circle.dataset.annotationId = annotationId;
  circle.dataset.handle = handle;
  return circle;
}

async function submit(status) {
  debugTrace('submit:start', {
    status,
    hasRequest: Boolean(currentRequest),
    isSubmitting: state.isSubmitting,
  });

  if (!currentRequest || state.isSubmitting) {
    return;
  }

  state.isSubmitting = true;
  updateStatus();

  try {
    const exportPayload = await buildExportPayload();

    const result = await window.reviewApp.submitResult({
      status,
      message: els.message.value,
      annotations: state.annotations,
      coordinateSpace: buildCoordinateSpace(),
      exportPayload,
    });

    await refreshGeneratedFiles();

    state.lastSubmittedResult = {
      requestId: currentRequest.id,
      status,
      nextRequestId:
        result && result.nextRequest ? result.nextRequest.id || null : null,
    };
    state.daemonError = `Review submitted: ${status}`;
    updateStatus();

    if (result && result.nextRequest && result.nextRequest.id) {
      window.location.reload();
      return;
    }
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
    kind: 'normalized-artifact-box',
    stageWidth: Number.isFinite(sceneWidth) ? sceneWidth : null,
    stageHeight: Number.isFinite(sceneHeight) ? sceneHeight : null,
    artifactBox:
      metrics && sceneWidth > 0 && sceneHeight > 0
        ? {
            x: metrics.x / sceneWidth,
            y: metrics.y / sceneHeight,
            width: metrics.width / sceneWidth,
            height: metrics.height / sceneHeight,
          }
        : null,
    exportWidth: metrics ? metrics.width : null,
    exportHeight: metrics ? metrics.height : null,
  };
}

function buildOverlaySvg() {
  const width = getSceneWidth();
  const height = getSceneHeight();

  return [
    `<svg xmlns="${SVG_NS}" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    serializeAnnotationsToSvg(),
    '</svg>',
  ].join('');
}

function buildArtifactSnapshotSvg() {
  const metrics = state.artifactMetrics || {
    x: 0,
    y: 0,
    width: getSceneWidth(),
    height: getSceneHeight(),
  };

  return [
    `<svg xmlns="${SVG_NS}" width="${metrics.width}" height="${metrics.height}" viewBox="0 0 ${metrics.width} ${metrics.height}">`,
    `<rect width="${metrics.width}" height="${metrics.height}" fill="#ffffff" opacity="0.01"></rect>`,
    '<g>',
    serializeAnnotationsToSvg(metrics.x, metrics.y),
    '</g>',
    '</svg>',
  ].join('');
}

function serializeAnnotationsToSvg(offsetX = 0, offsetY = 0) {
  return state.annotations
    .map((annotation) => annotationToSvg(annotation, offsetX, offsetY))
    .filter(Boolean)
    .join('');
}

function annotationToSvg(annotation, offsetX, offsetY) {
  if (annotation.type === 'rect') {
    const rectSvg = [
      `<rect x="${annotation.x - offsetX}" y="${annotation.y - offsetY}" width="${annotation.width}" height="${annotation.height}" fill="rgba(239,68,68,0.12)" stroke="#ef4444" stroke-width="3" rx="8" ry="8" />`,
    ];

    if (annotation.label) {
      const lines = String(annotation.label).split(/\r?\n/);
      const x = annotation.x - offsetX + 10;
      const y = annotation.y - offsetY + 18;
      rectSvg.push(
        `<text x="${x}" y="${y}" fill="#fee2e2" font-size="16" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif">`
      );
      lines.forEach((line, index) => {
        rectSvg.push(
          `<tspan x="${x}" dy="${index === 0 ? '0' : '1.2em'}">${escapeXml(line)}</tspan>`
        );
      });
      rectSvg.push('</text>');
    }

    return rectSvg.join('');
  }

  if (annotation.type === 'arrow') {
    const geometry = getArrowHeadGeometry(annotation);
    const lineEndX = geometry ? geometry.lineEndX : annotation.x2;
    const lineEndY = geometry ? geometry.lineEndY : annotation.y2;
    const parts = [
      `<line x1="${annotation.x1 - offsetX}" y1="${annotation.y1 - offsetY}" x2="${lineEndX - offsetX}" y2="${lineEndY - offsetY}" stroke="#60a5fa" stroke-width="4" stroke-linecap="butt" />`,
    ];

    if (geometry) {
      parts.push(
        `<path d="M ${geometry.tipX - offsetX} ${geometry.tipY - offsetY} L ${geometry.leftX - offsetX} ${geometry.leftY - offsetY} L ${geometry.rightX - offsetX} ${geometry.rightY - offsetY} Z" fill="#60a5fa" />`
      );
    }

    if (annotation.label) {
      const labelX = (annotation.x1 + annotation.x2) / 2 - offsetX;
      const labelY = (annotation.y1 + annotation.y2) / 2 - 10 - offsetY;
      const lines = String(annotation.label).split(/\r?\n/);
      parts.push(
        `<text x="${labelX}" y="${labelY}" fill="#60a5fa" font-size="16" font-weight="600" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" paint-order="stroke" stroke="rgba(255,255,255,0.92)" stroke-width="4" stroke-linejoin="round">`
      );
      lines.forEach((line, index) => {
        parts.push(
          `<tspan x="${labelX}" dy="${index === 0 ? '0' : '1.2em'}">${escapeXml(line)}</tspan>`
        );
      });
      parts.push('</text>');
    }

    return parts.join('');
  }

  if (annotation.type === 'text') {
    const lines = String(annotation.text || '').split(/\r?\n/);
    const x = annotation.x - offsetX;
    const y = annotation.y - offsetY;
    const parts = [
      `<text x="${x}" y="${y}" fill="#f97316" font-size="24" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif">`,
    ];
    lines.forEach((line, index) => {
      parts.push(
        `<tspan x="${x}" dy="${index === 0 ? '0' : '1.2em'}">${escapeXml(line)}</tspan>`
      );
    });
    parts.push('</text>');
    return parts.join('');
  }

  return '';
}

async function buildAnnotatedImageDataUrl() {
  const img = els.artifactHost.querySelector('img');
  if (!img || !img.naturalWidth || !img.naturalHeight) {
    return null;
  }

  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const context = canvas.getContext('2d');
  context.drawImage(img, 0, 0);

  const scaleX =
    img.naturalWidth /
    (state.artifactMetrics ? state.artifactMetrics.width : img.naturalWidth);
  const scaleY =
    img.naturalHeight /
    (state.artifactMetrics ? state.artifactMetrics.height : img.naturalHeight);

  state.annotations.forEach((annotation) => {
    drawAnnotationOnCanvas(context, annotation, scaleX, scaleY);
  });

  return canvas.toDataURL('image/png');
}

function drawAnnotationOnCanvas(context, annotation, scaleX, scaleY) {
  context.save();

  if (annotation.type === 'rect') {
    context.strokeStyle = '#ef4444';
    context.lineWidth = 5;
    context.fillStyle = 'rgba(239,68,68,0.12)';
    context.fillRect(
      annotation.x * scaleX,
      annotation.y * scaleY,
      annotation.width * scaleX,
      annotation.height * scaleY
    );
    context.strokeRect(
      annotation.x * scaleX,
      annotation.y * scaleY,
      annotation.width * scaleX,
      annotation.height * scaleY
    );

    if (annotation.label) {
      context.fillStyle = '#fee2e2';
      context.font = `${16 * Math.max(scaleY, 1)}px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`;
      const lines = String(annotation.label).split(/\r?\n/);
      lines.forEach((line, index) => {
        context.fillText(
          line,
          (annotation.x + 10) * scaleX,
          (annotation.y + 18 + index * 20) * scaleY
        );
      });
    }

    context.restore();
    return;
  }

  if (annotation.type === 'arrow') {
    const geometry = getArrowHeadGeometry(annotation);
    context.strokeStyle = '#60a5fa';
    context.lineWidth = 6;
    context.lineCap = 'butt';
    context.beginPath();
    context.moveTo(annotation.x1 * scaleX, annotation.y1 * scaleY);
    context.lineTo(
      (geometry ? geometry.lineEndX : annotation.x2) * scaleX,
      (geometry ? geometry.lineEndY : annotation.y2) * scaleY
    );
    context.stroke();

    if (geometry) {
      context.fillStyle = '#60a5fa';
      context.beginPath();
      context.moveTo(geometry.tipX * scaleX, geometry.tipY * scaleY);
      context.lineTo(geometry.leftX * scaleX, geometry.leftY * scaleY);
      context.lineTo(geometry.rightX * scaleX, geometry.rightY * scaleY);
      context.closePath();
      context.fill();
    }

    if (annotation.label) {
      context.fillStyle = '#60a5fa';
      context.strokeStyle = 'rgba(255,255,255,0.92)';
      context.lineWidth = 4;
      context.lineJoin = 'round';
      context.paintOrder = 'stroke';
      context.font = `${16 * Math.max(scaleY, 1)}px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`;
      const lines = String(annotation.label).split(/\r?\n/);
      const x = ((annotation.x1 + annotation.x2) / 2) * scaleX;
      const y = ((annotation.y1 + annotation.y2) / 2 - 10) * scaleY;
      lines.forEach((line, index) => {
        const lineY = y + index * 20 * scaleY;
        context.strokeText(line, x, lineY);
        context.fillText(line, x, lineY);
      });
    }

    context.restore();
    return;
  }

  if (annotation.type === 'text') {
    context.fillStyle = '#f97316';
    context.font = `${24 * scaleY}px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`;
    const lines = String(annotation.text || '').split(/\r?\n/);
    lines.forEach((line, index) => {
      context.fillText(
        line,
        annotation.x * scaleX,
        (annotation.y + index * 28) * scaleY
      );
    });
  }

  context.restore();
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function onArtifactReady() {
  syncStageGeometry();
  syncArtifactMetrics();
  applyZoom(true);
  updateStatus();
  renderAnnotations();
  refreshVendorUi();
}

async function refreshGeneratedFiles() {
  if (!window.reviewApp || typeof window.reviewApp.listGeneratedFiles !== 'function') {
    return;
  }

  try {
    state.generatedRequests = await window.reviewApp.listGeneratedFiles();
  } catch (error) {
    debugTrace('generated-files:load-failed', {
      message: error && error.message ? error.message : String(error),
    });
    state.generatedRequests = [];
  }

  renderGeneratedFiles();
}

function renderGeneratedFiles() {
  if (!els.generatedFilesEmpty || !els.generatedFilesList) {
    return;
  }

  const artifactFiles = getArtifactFiles();
  els.generatedFilesList.innerHTML = '';

  const hasItems = artifactFiles.length > 0;
  els.generatedFilesEmpty.classList.toggle('hidden', hasItems);
  els.generatedFilesList.classList.toggle('hidden', !hasItems);

  const artifactFilesMmdOnly = artifactFiles.filter((entry) => {
    const name = String(entry && entry.file && entry.file.name || '').toLowerCase();
    return name.endsWith('.mmd') || name.endsWith('.mermaid');
  });

  const currentArtifactEntry = getCurrentArtifactEntry(artifactFilesMmdOnly);
  const currentArtifact = currentArtifactEntry ? currentArtifactEntry.file : null;

  if (els.currentArtifactTitle) {
    els.currentArtifactTitle.textContent = currentArtifactEntry
      ? currentArtifactEntry.request.title || 'Untitled artifact'
      : 'No active artifact';
  }

  if (els.currentArtifactMeta) {
    els.currentArtifactMeta.textContent = currentArtifactEntry
      ? `${currentArtifact.name || 'Unnamed file'} · ${formatDateTime24(currentArtifact.createdAt || currentArtifactEntry.request.createdAt)}`
      : 'Waiting for request…';
  }

  const hasMmdItems = artifactFilesMmdOnly.length > 0;
  els.generatedFilesEmpty.classList.toggle('hidden', hasMmdItems);
  els.generatedFilesList.classList.toggle('hidden', !hasMmdItems);

  if (!hasMmdItems) {
    updateArtifactPicker();
    return;
  }

  artifactFilesMmdOnly.forEach((entry) => {
    const file = entry.file;
    const fileRow = document.createElement('div');
    fileRow.className = 'generated-file-item';

    const copy = document.createElement('div');
    copy.className = 'generated-file-copy';

    const fileName = document.createElement('div');
    fileName.className = 'generated-file-name';
    fileName.textContent = entry.request.title || 'Untitled artifact';
    copy.appendChild(fileName);

    const kind = document.createElement('div');
    kind.className = 'generated-file-kind';
    kind.textContent = `${file.name || 'Unnamed file'} · ${formatDateTime24(file.createdAt || entry.request.createdAt)}`;
    copy.appendChild(kind);

    fileRow.tabIndex = 0;
    fileRow.addEventListener('click', async () => {
      if (!window.reviewApp || typeof window.reviewApp.loadGeneratedArtifact !== 'function') {
        return;
      }
      const loaded = await window.reviewApp.loadGeneratedArtifact({
        filePath: file.path,
        artifactType: entry.request.artifactType,
        requestId: entry.request.requestId,
        title: entry.request.title || file.name,
        prompt: entry.request.title || 'Viewing generated artifact',
        createdAt: file.createdAt || entry.request.createdAt,
      });
      state.selectedGeneratedArtifact = {
        request: entry.request,
        file,
        loaded,
      };
      renderRequest(loaded);
      state.artifactPickerOpen = false;
      updateArtifactPicker();
      renderGeneratedFiles();
    });
    fileRow.addEventListener('keydown', async (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      fileRow.click();
    });

    fileRow.appendChild(copy);
    els.generatedFilesList.appendChild(fileRow);
  });

  updateArtifactPicker();
}

function getArtifactFiles() {
  return (Array.isArray(state.generatedRequests) ? state.generatedRequests : [])
    .flatMap((request) =>
      (Array.isArray(request.files) ? request.files : [])
        .filter((file) => file && file.kind === 'artifact')
        .map((file) => ({ request, file }))
    )
    .sort(
      (a, b) =>
        Date.parse(b.file.createdAt || b.request.createdAt || 0) -
        Date.parse(a.file.createdAt || a.request.createdAt || 0)
    );
}

function getCurrentArtifactEntry(artifactFiles = getArtifactFiles()) {
  if (state.selectedGeneratedArtifact && state.selectedGeneratedArtifact.file) {
    const selectedPath = state.selectedGeneratedArtifact.file.path;
    const matchedSelected = artifactFiles.find((entry) => entry.file && entry.file.path === selectedPath);
    if (matchedSelected) {
      return matchedSelected;
    }
  }

  if (!currentRequest || !currentRequest.id) {
    return artifactFiles[0] || null;
  }

  const matched = artifactFiles.find(
    (entry) => entry.request.requestId === currentRequest.id
  );
  return matched || artifactFiles[0] || null;
}

function updateArtifactPicker() {
  if (els.artifactPickerMenu) {
    els.artifactPickerMenu.classList.toggle('hidden', !state.artifactPickerOpen);
  }

  if (els.artifactPickerToggle) {
    els.artifactPickerToggle.setAttribute(
      'aria-expanded',
      state.artifactPickerOpen ? 'true' : 'false'
    );
  }
}

function formatDateTime(value) {
  if (!value) {
    return 'unknown time';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

function formatDateTime24(value) {
  if (!value) {
    return 'unknown time';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    hour12: false,
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function onWindowResize() {
  syncStageGeometry();
  syncArtifactMetrics();
  applyZoom(true);
  updateInlineEditorPosition();
  updateStatus();
  renderAnnotations();
}

function onViewerScroll() {
  updateInlineEditorPosition();
}

function onKeyDown(event) {
  if (event.target && ['INPUT', 'TEXTAREA'].includes(event.target.tagName)) {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeInlineEditor();
      event.target.blur();
      return;
    }

    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      saveInlineEditor();
      return;
    }

    return;
  }

  if (event.key === '1') {
    state.tool = 'select';
    updateToolButtons();
    updateStatus();
  }

  if (event.key === '2') {
    state.tool = 'rect';
    updateToolButtons();
    updateStatus();
  }

  if (event.key === '3') {
    state.tool = 'arrow';
    updateToolButtons();
    updateStatus();
  }

  if (event.key === '4') {
    state.tool = 'text';
    updateToolButtons();
    updateStatus();
  }

  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
    event.preventDefault();
    undoLastAnnotation();
  }

  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'd') {
    event.preventDefault();
    duplicateSelectedAnnotation();
  }

  if (event.key === 'Backspace' || event.key === 'Delete') {
    event.preventDefault();
    if (state.selectedAnnotationId) {
      deleteSelectedAnnotation();
    }
  }

  if (event.key === '+' || event.key === '=') {
    event.preventDefault();
    setZoom(state.zoom + ZOOM_STEP);
  }

  if (event.key === '-') {
    event.preventDefault();
    setZoom(state.zoom - ZOOM_STEP);
  }

  if (event.key === '0') {
    event.preventDefault();
    setZoom(1);
  }

  if (event.code === 'Space') {
    state.spacePan = true;
  }
}

function onKeyUp(event) {
  if (event.code === 'Space') {
    state.spacePan = false;
  }
}

function onViewerWheel(event) {
  if (event.target && event.target.closest && event.target.closest('#inline-editor')) {
    return;
  }

  if (!(event.metaKey || event.ctrlKey)) {
    event.preventDefault();
    els.viewer.scrollLeft += event.deltaX;
    els.viewer.scrollTop += event.deltaY;
    return;
  }

  event.preventDefault();

  const isTrackpadLike = Math.abs(event.deltaY) < 20;
  const zoomStep = isTrackpadLike ? TRACKPAD_ZOOM_STEP : WHEEL_ZOOM_STEP * 0.01;
  const delta = event.deltaY * -zoomStep;

  setZoom(state.zoom + delta, {
    anchorX: event.clientX,
    anchorY: event.clientY,
  });
}

function setZoom(nextZoom, options) {
  const minZoom = getMinZoom();
  const clamped = Math.min(MAX_ZOOM, Math.max(minZoom, nextZoom));
  const previous = state.zoom;
  state.zoom = clamped;
  applyZoom(false, previous, options);
}

function applyZoom(skipAnchorAdjust, previousZoom = state.zoom, options = {}) {
  if (!els.viewerStage) {
    return;
  }

  const { anchorX, anchorY } = options;
  let relativeX = null;
  let relativeY = null;

  if (
    !skipAnchorAdjust &&
    Number.isFinite(anchorX) &&
    Number.isFinite(anchorY)
  ) {
    const rect = els.viewer.getBoundingClientRect();
    relativeX = anchorX - rect.left + els.viewer.scrollLeft;
    relativeY = anchorY - rect.top + els.viewer.scrollTop;
  }

  els.viewerStage.style.transform = `scale(${state.zoom})`;
  els.viewerStage.style.transformOrigin = 'top left';

  if (
    !skipAnchorAdjust &&
    relativeX !== null &&
    relativeY !== null &&
    previousZoom
  ) {
    const scaleRatio = state.zoom / previousZoom;
    els.viewer.scrollLeft =
      relativeX * scaleRatio -
      (anchorX - els.viewer.getBoundingClientRect().left);
    els.viewer.scrollTop =
      relativeY * scaleRatio -
      (anchorY - els.viewer.getBoundingClientRect().top);
  }

  updateInlineEditorPosition();
  updateStatus();
}

function syncStageGeometry() {
  state.stageRect = els.viewerStage.getBoundingClientRect();
}

function syncArtifactMetrics() {
  const artifactNode = els.artifactHost.firstElementChild;
  if (!artifactNode) {
    state.artifactMetrics = null;
    return;
  }

  const artifactRect = artifactNode.getBoundingClientRect();
  const stageRect = els.viewerStage.getBoundingClientRect();
  state.artifactMetrics = {
    x: (artifactRect.left - stageRect.left) / state.zoom,
    y: (artifactRect.top - stageRect.top) / state.zoom,
    width: artifactRect.width / state.zoom,
    height: artifactRect.height / state.zoom,
  };
}

function pointerToArtifactPoint(event, stageRect = null) {
  if (!state.artifactMetrics) {
    return null;
  }

  const resolvedStageRect = stageRect || els.viewerStage.getBoundingClientRect();
  const x = (event.clientX - resolvedStageRect.left) / state.zoom;
  const y = (event.clientY - resolvedStageRect.top) / state.zoom;

  return {
    x,
    y,
  };
}

function isWithinArtifact(event) {
  const point = pointerToArtifactPoint(event);
  if (!point || !state.artifactMetrics) {
    return false;
  }

  return (
    point.x >= state.artifactMetrics.x &&
    point.y >= state.artifactMetrics.y &&
    point.x <= state.artifactMetrics.x + state.artifactMetrics.width &&
    point.y <= state.artifactMetrics.y + state.artifactMetrics.height
  );
}

function findAnnotationId(target) {
  if (!target || !target.closest) {
    return null;
  }

  const group = target.closest('[data-annotation-id]');
  return group ? group.dataset.annotationId : null;
}

function normalizeBounds(start, end) {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  };
}

function annotationIntersectsBounds(annotation, bounds) {
  const annotationBounds = getAnnotationBounds(annotation);
  if (!annotationBounds) {
    return false;
  }

  return !(
    annotationBounds.x > bounds.x + bounds.width ||
    annotationBounds.x + annotationBounds.width < bounds.x ||
    annotationBounds.y > bounds.y + bounds.height ||
    annotationBounds.y + annotationBounds.height < bounds.y
  );
}

function getAnnotationBounds(annotation) {
  if (annotation.type === 'rect') {
    return {
      x: annotation.x,
      y: annotation.y,
      width: annotation.width,
      height: annotation.height,
    };
  }

  if (annotation.type === 'arrow') {
    return {
      x: Math.min(annotation.x1, annotation.x2),
      y: Math.min(annotation.y1, annotation.y2),
      width: Math.abs(annotation.x2 - annotation.x1),
      height: Math.abs(annotation.y2 - annotation.y1),
    };
  }

  if (annotation.type === 'text') {
    return {
      x: annotation.x,
      y: annotation.y - 24,
      width: 180,
      height: Math.max(
        28,
        String(annotation.text || '').split(/\r?\n/).length * 28
      ),
    };
  }

  return null;
}

function findHandleInfo(target) {
  if (!target || !target.dataset || !target.dataset.handle) {
    return null;
  }

  return {
    annotationId: target.dataset.annotationId,
    handle: target.dataset.handle,
  };
}

function patchAnnotationNode(annotation) {
  const group = annotationNodeCache.get(annotation.id);
  if (!group) {
    renderAnnotations();
    return;
  }

  const freshNode = buildAnnotationNode(annotation);
  annotationNodeCache.set(annotation.id, freshNode);
  group.replaceWith(freshNode);
}

function releaseViewerPointerCapture(event) {
  if (
    !event ||
    event.pointerId == null ||
    !els.viewer.releasePointerCapture ||
    !els.viewer.hasPointerCapture ||
    !els.viewer.hasPointerCapture(event.pointerId)
  ) {
    return;
  }

  try {
    els.viewer.releasePointerCapture(event.pointerId);
  } catch {}
}

function cloneAnnotation(annotation) {
  return JSON.parse(JSON.stringify(annotation));
}

function generateAnnotationId() {
  return `ann_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
}

function getSceneWidth() {
  return Math.round(
    els.viewerStage
      ? els.viewerStage.scrollWidth || els.viewerStage.clientWidth || 0
      : 0
  );
}

function getSceneHeight() {
  return Math.round(
    els.viewerStage
      ? els.viewerStage.scrollHeight || els.viewerStage.clientHeight || 0
      : 0
  );
}

function getMinZoom() {
  if (!els.viewer || !state.artifactMetrics || !state.artifactMetrics.width) {
    return MIN_ZOOM;
  }

  const viewerRect = els.viewer.getBoundingClientRect();
  if (!viewerRect.width) {
    return MIN_ZOOM;
  }

  const fitWidthZoom = viewerRect.width / state.artifactMetrics.width;
  return Math.max(0.05, Math.min(1, fitWidthZoom));
}

function toFileUrl(filePath) {
  if (!filePath) {
    return '';
  }

  if (/^file:\/\//i.test(filePath)) {
    return filePath;
  }

  var normalized = String(filePath).replace(/\\/g, '/');
  if (!normalized.startsWith('/')) {
    normalized = '/' + normalized;
  }
  return 'file://' + encodeURI(normalized);
}

async function sendRendererHeartbeat() {
  if (!window.reviewApp || typeof window.reviewApp.heartbeat !== 'function') {
    return;
  }

  try {
    await window.reviewApp.heartbeat({
      requestId: currentRequest ? currentRequest.id || null : null,
    });
  } catch (error) {
    debugTrace('heartbeat:error', {
      message: error && error.message ? error.message : String(error),
    });
  }
}

async function refreshDaemonStatus() {
  try {
    const health = await window.reviewApp.getHealth();
    state.daemonConnected = Boolean(health && health.ok);
    state.daemonError = '';
    state.queuedCount = Number(
      health && health.queuedCount ? health.queuedCount : 0
    );
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

  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
  }

  heartbeatTimer = setInterval(async function heartbeatSession() {
    await sendRendererHeartbeat();
  }, 1000);

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

function bootWhenShellReady() {
  captureElements();

  debugTrace('bootWhenShellReady:check', {
    hasTitle: Boolean(els.title),
    hasViewer: Boolean(els.viewer),
    hasLayer: Boolean(els.annotationLayer),
  });

  if (hasRequiredElements()) {
    boot();
    return;
  }

  window.addEventListener(
    'review-shell-ready',
    function handleShellReady() {
      window.removeEventListener('review-shell-ready', handleShellReady);
      boot();
    },
    { once: true }
  );
}

waitForShoelace().then(bootWhenShellReady);
