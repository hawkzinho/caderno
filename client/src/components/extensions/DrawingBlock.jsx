import { NodeViewWrapper } from '@tiptap/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const TOOL_CONFIG = {
  pen: { label: 'Caneta', opacity: 1 },
  marker: { label: 'Marcador', opacity: 0.28 },
  eraser: { label: 'Borracha', opacity: 1 },
  select: { label: 'Selecao', opacity: 1 },
};
const DEFAULT_CANVAS_WIDTH = 760;
const DEFAULT_CANVAS_HEIGHT = 360;
const MIN_CANVAS_WIDTH = 260;
const MIN_CANVAS_HEIGHT = 180;
const MAX_CANVAS_WIDTH = 1600;
const MAX_CANVAS_HEIGHT = 1200;

function sanitizeDimension(value, fallback, min = 1, max = MAX_CANVAS_WIDTH) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < min) {
    return fallback;
  }

  return Math.min(max, Math.round(parsed));
}

function sanitizeOpacity(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0.04, Math.min(1, parsed)) : fallback;
}

function buildFallbackStrokeId(points, index) {
  const anchor = points[0] || { x: 0, y: 0 };
  return `legacy-${index}-${Math.round(anchor.x)}-${Math.round(anchor.y)}-${points.length}`;
}

function sanitizePoint(point) {
  const x = Number(point?.x);
  const y = Number(point?.y);

  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }

  return { x, y };
}

function sanitizeStrokes(value) {
  const rawStrokes = Array.isArray(value)
    ? value
    : (() => {
      if (!value) return [];

      try {
        return JSON.parse(value);
      } catch {
        return [];
      }
    })();

  return rawStrokes
    .map((stroke, index) => {
      const points = Array.isArray(stroke?.points)
        ? stroke.points.map(sanitizePoint).filter(Boolean)
        : [];

      if (!points.length) {
        return null;
      }

      const tool = TOOL_CONFIG[stroke?.tool] ? stroke.tool : 'pen';
      const width = Number(stroke?.width);

      return {
        id: typeof stroke?.id === 'string' && stroke.id ? stroke.id : buildFallbackStrokeId(points, index),
        tool,
        color: typeof stroke?.color === 'string' && stroke.color ? stroke.color : '#1f2937',
        width: Number.isFinite(width) && width > 0 ? width : 4,
        opacity: sanitizeOpacity(stroke?.opacity, TOOL_CONFIG[tool].opacity),
        points,
      };
    })
    .filter(Boolean);
}

function cloneStrokes(strokes) {
  return strokes.map((stroke) => ({
    ...stroke,
    points: stroke.points.map((point) => ({ ...point })),
  }));
}

function getDistance(pointA, pointB) {
  return Math.hypot(pointA.x - pointB.x, pointA.y - pointB.y);
}

function getStrokeBounds(stroke) {
  if (!stroke?.points?.length) {
    return {
      left: 0,
      top: 0,
      right: 0,
      bottom: 0,
    };
  }

  const padding = stroke.width + 8;
  const xs = stroke.points.map((point) => point.x);
  const ys = stroke.points.map((point) => point.y);

  return {
    left: Math.min(...xs) - padding,
    top: Math.min(...ys) - padding,
    right: Math.max(...xs) + padding,
    bottom: Math.max(...ys) + padding,
  };
}

function hitTestStroke(stroke, point) {
  if (!stroke?.points?.length) {
    return false;
  }

  return stroke.points.some((sample) => getDistance(sample, point) <= stroke.width + 8);
}

function translateStroke(stroke, deltaX, deltaY) {
  return {
    ...stroke,
    points: stroke.points.map((point) => ({
      x: point.x + deltaX,
      y: point.y + deltaY,
    })),
  };
}

function renderScene(context, strokes, selectedStrokeId, width, height) {
  context.clearRect(0, 0, width, height);
  context.fillStyle = '#fffefc';
  context.fillRect(0, 0, width, height);
  context.strokeStyle = 'rgba(203, 213, 225, 0.9)';
  context.lineWidth = 1;
  context.strokeRect(0.5, 0.5, width - 1, height - 1);

  strokes.forEach((stroke) => {
    if (!stroke?.points?.length) {
      return;
    }

    context.save();
    context.globalAlpha = stroke.opacity ?? 1;
    context.strokeStyle = stroke.color;
    context.lineWidth = stroke.width;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.beginPath();
    context.moveTo(stroke.points[0].x, stroke.points[0].y);

    stroke.points.slice(1).forEach((point) => {
      context.lineTo(point.x, point.y);
    });

    if (stroke.points.length === 1) {
      context.lineTo(stroke.points[0].x + 0.001, stroke.points[0].y + 0.001);
    }

    context.stroke();
    context.restore();

    if (stroke.id === selectedStrokeId) {
      const bounds = getStrokeBounds(stroke);
      context.save();
      context.strokeStyle = '#2563eb';
      context.lineWidth = 1.5;
      context.setLineDash([8, 6]);
      context.strokeRect(bounds.left, bounds.top, bounds.right - bounds.left, bounds.bottom - bounds.top);
      context.restore();
    }
  });
}

function buildStroke({ tool, color, width, point }) {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    tool,
    color,
    width,
    opacity: TOOL_CONFIG[tool].opacity,
    points: [point],
  };
}

export default function DrawingBlock({ node, updateAttributes, deleteNode }) {
  const [canvasSize, setCanvasSize] = useState(() => ({
    width: sanitizeDimension(node.attrs.width, DEFAULT_CANVAS_WIDTH, MIN_CANVAS_WIDTH, MAX_CANVAS_WIDTH),
    height: sanitizeDimension(node.attrs.height, DEFAULT_CANVAS_HEIGHT, MIN_CANVAS_HEIGHT, MAX_CANVAS_HEIGHT),
  }));
  const logicalWidth = sanitizeDimension(canvasSize.width, DEFAULT_CANVAS_WIDTH, MIN_CANVAS_WIDTH, MAX_CANVAS_WIDTH);
  const logicalHeight = sanitizeDimension(canvasSize.height, DEFAULT_CANVAS_HEIGHT, MIN_CANVAS_HEIGHT, MAX_CANVAS_HEIGHT);
  const [strokes, setStrokes] = useState(() => sanitizeStrokes(node.attrs.strokes));
  const [tool, setTool] = useState('pen');
  const [color, setColor] = useState('#1f2937');
  const [width, setWidth] = useState(4);
  const [selectedStrokeId, setSelectedStrokeId] = useState(null);
  const [displaySize, setDisplaySize] = useState(() => ({
    width: sanitizeDimension(node.attrs.width, DEFAULT_CANVAS_WIDTH, MIN_CANVAS_WIDTH, MAX_CANVAS_WIDTH),
    height: sanitizeDimension(node.attrs.height, DEFAULT_CANVAS_HEIGHT, MIN_CANVAS_HEIGHT, MAX_CANVAS_HEIGHT),
  }));
  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);
  const [isEditing, setIsEditing] = useState(() => node.attrs.isEditing !== false);
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const canvasSizeRef = useRef(canvasSize);
  const strokesRef = useRef(strokes);
  const interactionRef = useRef(null);
  const resizeStateRef = useRef(null);

  useEffect(() => {
    setCanvasSize({
      width: sanitizeDimension(node.attrs.width, DEFAULT_CANVAS_WIDTH, MIN_CANVAS_WIDTH, MAX_CANVAS_WIDTH),
      height: sanitizeDimension(node.attrs.height, DEFAULT_CANVAS_HEIGHT, MIN_CANVAS_HEIGHT, MAX_CANVAS_HEIGHT),
    });
  }, [node.attrs.height, node.attrs.width]);

  useEffect(() => {
    canvasSizeRef.current = canvasSize;
  }, [canvasSize]);

  useEffect(() => {
    setIsEditing(node.attrs.isEditing !== false);
  }, [node.attrs.isEditing]);

  useEffect(() => {
    const parsed = sanitizeStrokes(node.attrs.strokes);
    setStrokes(parsed);
    strokesRef.current = parsed;
    setSelectedStrokeId((current) => (
      current && !parsed.some((stroke) => stroke.id === current) ? null : current
    ));
  }, [node.attrs.strokes]);

  useEffect(() => {
    strokesRef.current = strokes;
  }, [strokes]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) {
      return undefined;
    }

    const updateSize = () => {
      if (!isEditing) {
        setDisplaySize({ width: logicalWidth, height: logicalHeight });
        return;
      }

      const widthValue = Math.max(280, Math.min(element.clientWidth, logicalWidth));
      const heightValue = Math.round((widthValue / logicalWidth) * logicalHeight);
      setDisplaySize({ width: widthValue, height: heightValue });
    };

    updateSize();

    if (typeof ResizeObserver === 'undefined') {
      return undefined;
    }

    const observer = new ResizeObserver(updateSize);
    observer.observe(element);

    return () => observer.disconnect();
  }, [isEditing, logicalHeight, logicalWidth]);

  const paintCanvas = useCallback((nextStrokes, activeStrokeId = selectedStrokeId) => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const context = canvas.getContext('2d');
    if (!context) {
      return;
    }

    if (!logicalWidth || !logicalHeight || !displaySize.width || !displaySize.height) {
      return;
    }

    const ratio = window.devicePixelRatio || 1;
    const scaleX = displaySize.width / logicalWidth;
    const scaleY = displaySize.height / logicalHeight;

    canvas.width = Math.round(displaySize.width * ratio);
    canvas.height = Math.round(displaySize.height * ratio);
    canvas.style.width = `${displaySize.width}px`;
    canvas.style.height = `${displaySize.height}px`;
    context.setTransform(ratio * scaleX, 0, 0, ratio * scaleY, 0, 0);

    renderScene(context, sanitizeStrokes(nextStrokes), activeStrokeId, logicalWidth, logicalHeight);
  }, [displaySize.height, displaySize.width, logicalHeight, logicalWidth, selectedStrokeId]);

  useEffect(() => {
    paintCanvas(strokes, selectedStrokeId);
  }, [paintCanvas, selectedStrokeId, strokes]);

  const persistStrokes = useCallback((nextStrokes) => {
    const safeStrokes = sanitizeStrokes(nextStrokes);
    updateAttributes({ strokes: JSON.stringify(safeStrokes) });
    strokesRef.current = safeStrokes;
  }, [updateAttributes]);

  const commitSnapshot = useCallback((nextStrokes, previousSnapshot) => {
    const safeNext = sanitizeStrokes(nextStrokes);
    const safePrevious = sanitizeStrokes(previousSnapshot);

    setUndoStack((current) => [...current, cloneStrokes(safePrevious)]);
    setRedoStack([]);
    setStrokes(safeNext);
    persistStrokes(safeNext);
  }, [persistStrokes]);

  const toCanvasPoint = useCallback((event) => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return { x: 0, y: 0 };
    }

    const bounds = canvas.getBoundingClientRect();
    if (!bounds.width || !bounds.height) {
      return { x: 0, y: 0 };
    }

    const scaleX = logicalWidth / bounds.width;
    const scaleY = logicalHeight / bounds.height;

    return {
      x: (event.clientX - bounds.left) * scaleX,
      y: (event.clientY - bounds.top) * scaleY,
    };
  }, [logicalHeight, logicalWidth]);

  const findStrokeAtPoint = useCallback((point) => (
    [...sanitizeStrokes(strokesRef.current)].reverse().find((stroke) => hitTestStroke(stroke, point))
  ), []);

  const eraseNearPoint = useCallback((sourceStrokes, point) => (
    sanitizeStrokes(sourceStrokes).filter((stroke) => !hitTestStroke(stroke, point))
  ), []);

  const startInteraction = (event) => {
    if (!isEditing) {
      return;
    }

    const point = toCanvasPoint(event);
    const snapshot = cloneStrokes(sanitizeStrokes(strokesRef.current));

    event.currentTarget.setPointerCapture?.(event.pointerId);

    if (tool === 'select') {
      const hitStroke = findStrokeAtPoint(point);
      setSelectedStrokeId(hitStroke?.id || null);

      interactionRef.current = hitStroke
        ? {
            mode: 'drag',
            snapshot,
            strokeId: hitStroke.id,
            lastPoint: point,
          }
        : null;

      return;
    }

    if (tool === 'eraser') {
      const nextStrokes = eraseNearPoint(snapshot, point);
      setStrokes(nextStrokes);
      interactionRef.current = {
        mode: 'erase',
        snapshot,
      };
      setSelectedStrokeId(null);
      return;
    }

    const nextStroke = buildStroke({ tool, color, width, point });
    const nextStrokes = [...snapshot, nextStroke];
    setStrokes(nextStrokes);
    setSelectedStrokeId(null);
    interactionRef.current = {
      mode: 'draw',
      snapshot,
      strokeId: nextStroke.id,
    };
  };

  const moveInteraction = (event) => {
    if (!isEditing) {
      return;
    }

    const activeInteraction = interactionRef.current;
    if (!activeInteraction) {
      return;
    }

    const point = toCanvasPoint(event);

    if (activeInteraction.mode === 'draw') {
      const drawingStrokeId = activeInteraction.strokeId;
      if (!drawingStrokeId) {
        return;
      }

      setStrokes((current) => sanitizeStrokes(current).map((stroke) => (
        stroke.id === drawingStrokeId
          ? { ...stroke, points: [...stroke.points, point] }
          : stroke
      )));
      return;
    }

    if (activeInteraction.mode === 'erase') {
      setStrokes((current) => eraseNearPoint(current, point));
      return;
    }

    if (activeInteraction.mode === 'drag') {
      const dragStrokeId = activeInteraction.strokeId;
      const lastPoint = activeInteraction.lastPoint;

      if (!dragStrokeId || !lastPoint) {
        return;
      }

      const deltaX = point.x - lastPoint.x;
      const deltaY = point.y - lastPoint.y;
      interactionRef.current = { ...activeInteraction, lastPoint: point };

      setStrokes((current) => sanitizeStrokes(current).map((stroke) => (
        stroke.id === dragStrokeId ? translateStroke(stroke, deltaX, deltaY) : stroke
      )));
    }
  };

  const endInteraction = (event) => {
    if (!isEditing) {
      return;
    }

    const activeInteraction = interactionRef.current;
    if (!activeInteraction) {
      return;
    }

    event?.currentTarget?.releasePointerCapture?.(event.pointerId);
    interactionRef.current = null;

    const previousSnapshot = sanitizeStrokes(activeInteraction.snapshot);
    const nextSnapshot = sanitizeStrokes(strokesRef.current);
    const changed = JSON.stringify(previousSnapshot) !== JSON.stringify(nextSnapshot);

    if (changed) {
      commitSnapshot(nextSnapshot, previousSnapshot);
      return;
    }

    setStrokes(nextSnapshot);
  };

  const handleUndo = () => {
    if (!undoStack.length) {
      return;
    }

    const previous = sanitizeStrokes(undoStack[undoStack.length - 1]);
    const current = cloneStrokes(sanitizeStrokes(strokesRef.current));

    setUndoStack((stack) => stack.slice(0, -1));
    setRedoStack((stack) => [...stack, current]);
    setStrokes(previous);
    persistStrokes(previous);
    setSelectedStrokeId(null);
  };

  const handleRedo = () => {
    if (!redoStack.length) {
      return;
    }

    const next = sanitizeStrokes(redoStack[redoStack.length - 1]);
    const current = cloneStrokes(sanitizeStrokes(strokesRef.current));

    setRedoStack((stack) => stack.slice(0, -1));
    setUndoStack((stack) => [...stack, current]);
    setStrokes(next);
    persistStrokes(next);
    setSelectedStrokeId(null);
  };

  const handleClear = () => {
    const current = sanitizeStrokes(strokesRef.current);
    if (!current.length) {
      return;
    }

    setUndoStack((stack) => [...stack, cloneStrokes(current)]);
    setRedoStack([]);
    setStrokes([]);
    persistStrokes([]);
    setSelectedStrokeId(null);
  };

  useEffect(() => {
    const handlePointerMove = (event) => {
      const state = resizeStateRef.current;
      if (!state) {
        return;
      }

      const nextWidth = Math.max(MIN_CANVAS_WIDTH, Math.min(
        MAX_CANVAS_WIDTH,
        Math.round(state.startWidth + (event.clientX - state.startX)),
      ));
      const nextHeight = Math.max(MIN_CANVAS_HEIGHT, Math.min(
        MAX_CANVAS_HEIGHT,
        Math.round(state.startHeight + (event.clientY - state.startY)),
      ));
      setCanvasSize({ width: nextWidth, height: nextHeight });
    };

    const handlePointerUp = () => {
      const state = resizeStateRef.current;
      if (!state) {
        return;
      }

      resizeStateRef.current = null;
      const safeCanvasSize = canvasSizeRef.current || canvasSize;
      updateAttributes({
        width: sanitizeDimension(safeCanvasSize.width, DEFAULT_CANVAS_WIDTH, MIN_CANVAS_WIDTH, MAX_CANVAS_WIDTH),
        height: sanitizeDimension(safeCanvasSize.height, DEFAULT_CANVAS_HEIGHT, MIN_CANVAS_HEIGHT, MAX_CANVAS_HEIGHT),
      });
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [canvasSize.height, canvasSize.width, updateAttributes]);

  const selectedToolLabel = useMemo(() => TOOL_CONFIG[tool].label, [tool]);

  const updateEditingState = useCallback((nextValue) => {
    interactionRef.current = null;
    if (!nextValue) {
      setSelectedStrokeId(null);
    }
    setIsEditing(nextValue);
    updateAttributes({ isEditing: nextValue });
  }, [updateAttributes]);

  return (
    <NodeViewWrapper className={`drawing-node ${isEditing ? 'is-editing' : 'is-finalized'}`} contentEditable={false}>
      <div className={`drawing-surface ${isEditing ? 'is-editing' : 'is-finalized'}`}>
        {isEditing ? (
          <div className="drawing-toolbar">
            <div className="drawing-toolbar-group">
              <button type="button" className="drawing-tool ghost drawing-drag-handle" data-drag-handle>
                Mover
              </button>

              {Object.entries(TOOL_CONFIG).map(([toolId, config]) => (
                <button
                  key={toolId}
                  type="button"
                  className={`drawing-tool ${tool === toolId ? 'active' : ''}`}
                  onClick={() => setTool(toolId)}
                >
                  {config.label}
                </button>
              ))}
            </div>

            <div className="drawing-toolbar-group">
              <label className="drawing-field">
                <span>Cor</span>
                <input type="color" value={color} onChange={(event) => setColor(event.target.value)} />
              </label>

              <label className="drawing-field drawing-field-range">
                <span>{selectedToolLabel}</span>
                <input
                  type="range"
                  min="2"
                  max="18"
                  step="1"
                  value={width}
                  onChange={(event) => setWidth(Number(event.target.value))}
                  disabled={tool === 'select'}
                />
              </label>
            </div>

            <div className="drawing-toolbar-group">
              <button type="button" className="drawing-tool ghost" onClick={handleUndo} disabled={!undoStack.length}>
                Desfazer
              </button>
              <button type="button" className="drawing-tool ghost" onClick={handleRedo} disabled={!redoStack.length}>
                Refazer
              </button>
              <button type="button" className="drawing-tool ghost" onClick={handleClear} disabled={!strokes.length}>
                Limpar
              </button>
              <button type="button" className="drawing-tool ghost" onClick={() => updateEditingState(false)}>
                Finalizar
              </button>
              <button type="button" className="drawing-tool ghost danger" onClick={deleteNode}>
                Excluir
              </button>
            </div>
          </div>
        ) : null}

        <div className="drawing-canvas-shell" ref={containerRef}>
          <canvas
            ref={canvasRef}
            className={`drawing-canvas ${isEditing ? '' : 'readonly'}`}
            onPointerDown={startInteraction}
            onPointerMove={moveInteraction}
            onPointerUp={endInteraction}
            onPointerCancel={endInteraction}
            onPointerLeave={endInteraction}
          />
          {!isEditing && (
            <button type="button" className="drawing-edit-button" onClick={() => updateEditingState(true)}>
              Editar
            </button>
          )}
          {isEditing && (
            <button
              type="button"
              className="drawing-resize-handle"
              aria-label="Redimensionar desenho"
              onPointerDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
                resizeStateRef.current = {
                  startX: event.clientX,
                  startY: event.clientY,
                  startWidth: canvasSize.width,
                  startHeight: canvasSize.height,
                };
              }}
            />
          )}
        </div>
      </div>
    </NodeViewWrapper>
  );
}
