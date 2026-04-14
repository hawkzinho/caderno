import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import DrawingBlock from './DrawingBlock';

const DrawingExtension = Node.create({
  name: 'drawing',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      strokes: {
        default: '[]',
      },
      width: {
        default: 760,
      },
      height: {
        default: 360,
      },
      isEditing: {
        default: true,
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="drawing"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'drawing' })];
  },

  addCommands() {
    return {
      insertDrawing: (attrs = {}) => ({ commands }) => commands.insertContent({
        type: this.name,
        attrs: {
          strokes: '[]',
          width: attrs.width || 760,
          height: attrs.height || 360,
          isEditing: typeof attrs.isEditing === 'boolean' ? attrs.isEditing : true,
        },
      }),
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(DrawingBlock);
  },
});

export default DrawingExtension;
