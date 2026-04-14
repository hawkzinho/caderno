import { Mark, mergeAttributes } from '@tiptap/core';

const CommentMark = Mark.create({
  name: 'commentMark',
  inclusive: false,

  addAttributes() {
    return {
      note: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-comment') || '',
        renderHTML: (attributes) => {
          if (!attributes.note) {
            return {};
          }

          return {
            'data-comment': attributes.note,
            title: attributes.note,
          };
        },
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-comment]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { class: 'comment-mark' }), 0];
  },

  addCommands() {
    return {
      setComment: (note) => ({ chain }) => chain().setMark(this.name, { note }).run(),
      unsetComment: () => ({ chain }) => chain().unsetMark(this.name).run(),
    };
  },
});

export default CommentMark;
