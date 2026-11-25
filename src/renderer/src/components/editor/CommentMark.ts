import { Mark, mergeAttributes } from '@tiptap/core'

export interface CommentMarkOptions {
  HTMLAttributes: Record<string, unknown>
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    commentMark: {
      setCommentMark: (commentId: string) => ReturnType
      unsetCommentMark: (commentId: string) => ReturnType
    }
  }
}

/**
 * MIT-licensed ProseMirror Mark for Office-style inline comment anchors.
 * Inspired by sereneinserenade/tiptap-comment-extension (MIT).
 */
export const CommentMark = Mark.create<CommentMarkOptions>({
  name: 'commentMark',

  inclusive: false,

  addOptions() {
    return {
      HTMLAttributes: {
        class: 'ink-comment-mark'
      }
    }
  },

  addAttributes() {
    return {
      commentId: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-comment-id'),
        renderHTML: (attrs) => (attrs.commentId ? { 'data-comment-id': attrs.commentId } : {})
      }
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-comment-id]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes), 0]
  },

  addCommands() {
    return {
      setCommentMark:
        (commentId: string) =>
        ({ commands }) =>
          commands.setMark(this.name, { commentId }),
      unsetCommentMark:
        (commentId: string) =>
        ({ tr, state, dispatch }) => {
          const { doc } = state
          doc.descendants((node, pos) => {
            node.marks.forEach((m) => {
              if (m.type.name === this.name && m.attrs.commentId === commentId) {
                tr.removeMark(pos, pos + node.nodeSize, m)
              }
            })
          })
          if (dispatch) dispatch(tr)
          return true
        }
    }
  }
})
