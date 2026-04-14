import Image from '@tiptap/extension-image';
import { ReactNodeViewRenderer } from '@tiptap/react';
import ImageBlock from './ImageBlock';

function parseDimension(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
}

const StudyImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: (element) => parseDimension(
          element.getAttribute('data-width')
          || element.getAttribute('width')
          || element.style.width?.replace('px', ''),
        ),
        renderHTML: (attributes) => {
          const width = parseDimension(attributes.width);
          return width ? { width, 'data-width': width } : {};
        },
      },
      height: {
        default: null,
        parseHTML: (element) => parseDimension(
          element.getAttribute('data-height')
          || element.getAttribute('height')
          || element.style.height?.replace('px', ''),
        ),
        renderHTML: (attributes) => {
          const height = parseDimension(attributes.height);
          return height ? { height, 'data-height': height } : {};
        },
      },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(ImageBlock);
  },
});

export default StudyImage;
