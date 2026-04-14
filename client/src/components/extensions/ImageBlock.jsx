import { NodeViewWrapper } from '@tiptap/react';
import { useCallback, useEffect, useRef, useState } from 'react';

const MIN_IMAGE_WIDTH = 180;
const MAX_IMAGE_WIDTH = 960;

function sanitizeDimension(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
}

function clampDimension(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export default function ImageBlock({ node, updateAttributes, deleteNode }) {
  const wrapperRef = useRef(null);
  const imageRef = useRef(null);
  const resizeStateRef = useRef(null);
  const displayWidthRef = useRef(sanitizeDimension(node.attrs.width));
  const aspectRatioRef = useRef(1.4);
  const [displayWidth, setDisplayWidth] = useState(() => sanitizeDimension(node.attrs.width));

  useEffect(() => {
    const nextWidth = sanitizeDimension(node.attrs.width);
    setDisplayWidth(nextWidth);
    displayWidthRef.current = nextWidth;

    const width = sanitizeDimension(node.attrs.width);
    const height = sanitizeDimension(node.attrs.height);
    if (width && height) {
      aspectRatioRef.current = width / height;
    }
  }, [node.attrs.height, node.attrs.width]);

  const getMaxWidth = useCallback(() => {
    const sheetBounds = wrapperRef.current?.closest('.document-sheet')?.getBoundingClientRect();
    const sheetWidth = sheetBounds?.width ? Math.round(sheetBounds.width - 44) : MAX_IMAGE_WIDTH;
    return clampDimension(sheetWidth, MIN_IMAGE_WIDTH, MAX_IMAGE_WIDTH);
  }, []);

  const persistDimensions = useCallback((widthValue) => {
    const safeWidth = clampDimension(Math.round(widthValue), MIN_IMAGE_WIDTH, getMaxWidth());
    const nextHeight = Math.max(60, Math.round(safeWidth / aspectRatioRef.current));

    updateAttributes({
      width: safeWidth,
      height: nextHeight,
    });
  }, [getMaxWidth, updateAttributes]);

  const handleImageLoad = useCallback(() => {
    const image = imageRef.current;
    if (!image) {
      return;
    }

    const naturalWidth = sanitizeDimension(image.naturalWidth) || 640;
    const naturalHeight = sanitizeDimension(image.naturalHeight) || 420;
    aspectRatioRef.current = naturalWidth / naturalHeight || 1.4;

    if (!sanitizeDimension(node.attrs.width)) {
      const nextWidth = clampDimension(naturalWidth, MIN_IMAGE_WIDTH, getMaxWidth());
      setDisplayWidth(nextWidth);
      displayWidthRef.current = nextWidth;
      persistDimensions(nextWidth);
    }
  }, [getMaxWidth, node.attrs.width, persistDimensions]);

  useEffect(() => {
    const handlePointerMove = (event) => {
      const state = resizeStateRef.current;
      if (!state) {
        return;
      }

      const nextWidth = clampDimension(
        Math.round(state.startWidth + (event.clientX - state.startX)),
        MIN_IMAGE_WIDTH,
        getMaxWidth(),
      );

      displayWidthRef.current = nextWidth;
      setDisplayWidth(nextWidth);
    };

    const handlePointerUp = () => {
      const state = resizeStateRef.current;
      if (!state) {
        return;
      }

      resizeStateRef.current = null;
      persistDimensions(displayWidthRef.current || state.startWidth);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [getMaxWidth, persistDimensions]);

  const effectiveWidth = displayWidth || sanitizeDimension(node.attrs.width) || undefined;

  return (
    <NodeViewWrapper className="image-node" contentEditable={false}>
      <div className="image-surface" ref={wrapperRef}>
        <img
          ref={imageRef}
          className="image-surface-media"
          src={node.attrs.src}
          alt={node.attrs.alt || ''}
          title={node.attrs.title || ''}
          onLoad={handleImageLoad}
          draggable={false}
          style={effectiveWidth ? { width: `${effectiveWidth}px` } : undefined}
        />

        <div className="image-surface-actions">
          <button type="button" className="image-surface-button" onClick={deleteNode}>
            Excluir
          </button>
        </div>

        <button
          type="button"
          className="image-resize-handle"
          aria-label="Redimensionar imagem"
          onPointerDown={(event) => {
            event.preventDefault();
            event.stopPropagation();

            const currentWidth = sanitizeDimension(displayWidthRef.current)
              || Math.round(imageRef.current?.getBoundingClientRect().width || MIN_IMAGE_WIDTH);

            resizeStateRef.current = {
              startX: event.clientX,
              startWidth: currentWidth,
            };
          }}
        />
      </div>
    </NodeViewWrapper>
  );
}
