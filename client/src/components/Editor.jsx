import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { TextSelection } from '@tiptap/pm/state';
import { EditorContent, useEditor } from '@tiptap/react';
import Color from '@tiptap/extension-color';
import Highlight from '@tiptap/extension-highlight';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import Table from '@tiptap/extension-table';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import TableRow from '@tiptap/extension-table-row';
import TaskItem from '@tiptap/extension-task-item';
import TaskList from '@tiptap/extension-task-list';
import TextStyle from '@tiptap/extension-text-style';
import Underline from '@tiptap/extension-underline';
import StarterKit from '@tiptap/starter-kit';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import {
  buildPageSettingsFromPreferences,
  EDITOR_FONT_OPTIONS,
  getPageWidthValue,
  getWritingPaddingValue,
  normalizePreferences,
} from '../utils/preferences';
import CommentMark from './extensions/CommentMark';
import DrawingExtension from './extensions/DrawingExtension';
import FontFamily from './extensions/FontFamily';
import FontSize from './extensions/FontSize';
import StudyImage from './extensions/StudyImage';

const FONT_SIZE_OPTIONS = ['14px', '16px', '18px', '20px', '24px'];
const SHEET_OPTIONS = [
  { value: 'lined', label: 'Pautado' },
  { value: 'grid', label: 'Quadriculado' },
  { value: 'plain', label: 'Liso' },
];
const TEXT_COLOR_SWATCHES = ['#2a221c', '#3551ba', '#0f766e', '#a16207', '#b42318', '#7c3aed'];
const HIGHLIGHT_SWATCHES = ['#fde68a', '#bfdbfe', '#bbf7d0', '#fecaca', '#fbcfe8', '#ddd6fe'];
const CONTEXT_BLOCK_TYPES = ['table', 'codeBlock', 'taskList', 'horizontalRule', 'image', 'drawing'];
const HOVER_BLOCK_TYPES = ['table', 'codeBlock', 'taskList', 'horizontalRule'];

function getBlockLabel(type) {
  const labels = {
    table: 'Tabela',
    codeBlock: 'Bloco de codigo',
    taskList: 'Checklist',
    horizontalRule: 'Divisor',
    image: 'Imagem',
    drawing: 'Desenho',
  };

  return labels[type] || 'Bloco';
}

function buildBlockDescriptor(doc, position, preferredType = null) {
  const safePos = Math.max(0, Math.min(position, doc.content.size));
  const $pos = doc.resolve(safePos);
  const allowedTypes = preferredType ? [preferredType] : CONTEXT_BLOCK_TYPES;

  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const node = $pos.node(depth);
    if (allowedTypes.includes(node.type.name)) {
      return {
        type: node.type.name,
        pos: $pos.before(depth),
        nodeSize: node.nodeSize,
        label: getBlockLabel(node.type.name),
      };
    }
  }

  const adjacentNodes = [
    { node: $pos.nodeAfter, pos: safePos },
    { node: $pos.nodeBefore, pos: safePos - ($pos.nodeBefore?.nodeSize || 0) },
  ];

  const matchedAdjacent = adjacentNodes.find(({ node, pos }) => (
    node
    && allowedTypes.includes(node.type.name)
    && Number.isFinite(pos)
    && pos >= 0
  ));

  if (!matchedAdjacent) {
    return null;
  }

  return {
    type: matchedAdjacent.node.type.name,
    pos: matchedAdjacent.pos,
    nodeSize: matchedAdjacent.node.nodeSize,
    label: getBlockLabel(matchedAdjacent.node.type.name),
  };
}

function buildTableNodeJson(rows = 3, cols = 3) {
  return {
    type: 'table',
    content: Array.from({ length: rows }, (_, rowIndex) => ({
      type: 'tableRow',
      content: Array.from({ length: cols }, () => ({
        type: rowIndex === 0 ? 'tableHeader' : 'tableCell',
        content: [{ type: 'paragraph' }],
      })),
    })),
  };
}

function createEmptyPageContent() {
  return { type: 'doc', content: [{ type: 'paragraph' }] };
}

function parsePageContent(raw) {
  if (!raw) {
    return createEmptyPageContent();
  }

  if (typeof raw === 'object') {
    return raw;
  }

  try {
    return JSON.parse(raw);
  } catch {
    return createEmptyPageContent();
  }
}

function normalizePageSettings(settings, defaults = { sheetStyle: 'lined', showMargin: true }) {
  if (!settings) {
    return defaults;
  }

  if (typeof settings === 'string') {
    try {
      return normalizePageSettings(JSON.parse(settings), defaults);
    } catch {
      return defaults;
    }
  }

  const sheetStyle = ['lined', 'grid', 'plain'].includes(settings.sheetStyle)
    ? settings.sheetStyle
    : defaults.sheetStyle;

  return {
    sheetStyle,
    showMargin: typeof settings.showMargin === 'boolean' ? settings.showMargin : defaults.showMargin,
  };
}

function parseDatabaseDate(value) {
  if (!value) {
    return 0;
  }

  const normalized = String(value).includes('T')
    ? String(value)
    : `${String(value).replace(' ', 'T')}Z`;

  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getDraftKey(pageId) {
  return `caderno_draft_${pageId}`;
}

function loadDraft(pageId) {
  if (typeof window === 'undefined') {
    return null;
  }

  const raw = window.localStorage.getItem(getDraftKey(pageId));
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveDraft(pageId, payload) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(
    getDraftKey(pageId),
    JSON.stringify({ ...payload, updatedAt: Date.now() }),
  );
}

function countWordsFromJson(json) {
  const collectText = (node) => {
    let text = '';

    if (node.text) {
      text += `${node.text} `;
    }

    if (Array.isArray(node.content)) {
      node.content.forEach((child) => {
        text += collectText(child);
      });
    }

    return text;
  };

  const text = Array.isArray(json?.content)
    ? json.content.map((node) => collectText(node)).join(' ')
    : '';

  return text.trim().split(/\s+/).filter(Boolean).length;
}

function collectComments(node, bucket = []) {
  if (!node) {
    return bucket;
  }

  if (Array.isArray(node.marks)) {
    node.marks.forEach((mark) => {
      if (mark.type === 'commentMark' && mark.attrs?.note) {
        bucket.push(mark.attrs.note);
      }
    });
  }

  if (Array.isArray(node.content)) {
    node.content.forEach((child) => collectComments(child, bucket));
  }

  return bucket;
}

function getBlockType(editor) {
  if (!editor) {
    return 'paragraph';
  }

  if (editor.isActive('heading', { level: 1 })) return 'heading-1';
  if (editor.isActive('heading', { level: 2 })) return 'heading-2';
  if (editor.isActive('heading', { level: 3 })) return 'heading-3';
  if (editor.isActive('taskList')) return 'taskList';
  if (editor.isActive('orderedList')) return 'orderedList';
  if (editor.isActive('bulletList')) return 'bulletList';
  if (editor.isActive('codeBlock')) return 'codeBlock';
  return 'paragraph';
}

function clampFloatingPosition(anchorX, anchorY, panelWidth, panelHeight) {
  const padding = 16;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  let left = anchorX;
  let top = anchorY;

  if (left + panelWidth > viewportWidth - padding) {
    left = viewportWidth - panelWidth - padding;
  }

  if (top + panelHeight > viewportHeight - padding) {
    top = Math.max(padding, anchorY - panelHeight - 12);
  }

  left = Math.max(padding, left);
  top = Math.max(padding, top);

  return { left, top };
}

function ToolbarButton({ active = false, onClick, children, title }) {
  return (
    <button type="button" className={`toolbar-button ${active ? 'active' : ''}`} onClick={onClick} title={title}>
      {children}
    </button>
  );
}

function ToolbarIcon({ children }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

function BoldIcon() {
  return <ToolbarIcon><path d="M7 5h6a4 4 0 0 1 0 8H7z" /><path d="M7 13h7a4 4 0 1 1 0 8H7z" /></ToolbarIcon>;
}

function ItalicIcon() {
  return <ToolbarIcon><path d="M19 4h-8M13 20H5M15 4 9 20" /></ToolbarIcon>;
}

function UnderlineIcon() {
  return <ToolbarIcon><path d="M7 4v6a5 5 0 0 0 10 0V4" /><path d="M5 20h14" /></ToolbarIcon>;
}

function StrikeIcon() {
  return <ToolbarIcon><path d="M16 4H9a3 3 0 0 0 0 6h6a3 3 0 1 1 0 6H8" /><path d="M4 12h16" /></ToolbarIcon>;
}

function HighlighterIcon() {
  return <ToolbarIcon><path d="m15 5 4 4" /><path d="M6 18 3 21l3-9 9-9 4 4-9 9Z" /><path d="M10 14 17 21" /></ToolbarIcon>;
}

function PlusSquareIcon() {
  return <ToolbarIcon><rect x="3" y="3" width="18" height="18" rx="4" /><path d="M12 8v8M8 12h8" /></ToolbarIcon>;
}

function UndoIcon() {
  return <ToolbarIcon><path d="M9 14 4 9l5-5" /><path d="M20 20a8 8 0 0 0-8-8H4" /></ToolbarIcon>;
}

function RedoIcon() {
  return <ToolbarIcon><path d="m15 14 5-5-5-5" /><path d="M4 20a8 8 0 0 1 8-8h8" /></ToolbarIcon>;
}

function TableIcon() {
  return <ToolbarIcon><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18M9 5v14M15 5v14" /></ToolbarIcon>;
}

function TextColorIcon() {
  return <ToolbarIcon><path d="m9 17 3-10 3 10" /><path d="M10.8 11h2.4" /><path d="M5 20h14" /></ToolbarIcon>;
}

function ChevronDownIcon() {
  return <ToolbarIcon><path d="m6 9 6 6 6-6" /></ToolbarIcon>;
}

function TrashIcon() {
  return <ToolbarIcon><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v5M14 11v5" /></ToolbarIcon>;
}

function formatShortcutLabel(shortcut) {
  if (!shortcut) {
    return '';
  }

  const map = {
    ctrl: 'Ctrl',
    alt: 'Alt',
    shift: 'Shift',
    meta: 'Cmd',
  };

  return shortcut
    .split('+')
    .map((part) => map[part] || part.toUpperCase())
    .join(' + ');
}

export default function Editor({
  pageId,
  onOpenHome,
  onOpenNotebook,
  onOpenSubject,
  onToggleSidebar,
  onWorkspaceRefresh,
  onShowNotice,
}) {
  const { user } = useAuth();
  const preferences = useMemo(() => normalizePreferences(user?.preferences), [user?.preferences]);
  const defaultPageSettings = useMemo(
    () => buildPageSettingsFromPreferences(preferences),
    [preferences],
  );
  const [page, setPage] = useState(null);
  const [title, setTitle] = useState('');
  const [pageSettings, setPageSettings] = useState(defaultPageSettings);
  const [saveStatus, setSaveStatus] = useState('Salvo');
  const [wordCount, setWordCount] = useState(0);
  const [commentCount, setCommentCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [contextMenu, setContextMenu] = useState(null);
  const [highlightMenu, setHighlightMenu] = useState({
    open: false,
    x: 0,
    y: 0,
    anchorX: 0,
    anchorY: 0,
  });
  const [insertMenu, setInsertMenu] = useState({
    open: false,
    x: 0,
    y: 0,
    anchorX: 0,
    anchorY: 0,
    query: '',
    source: 'toolbar',
    range: null,
  });
  const [activeInsertIndex, setActiveInsertIndex] = useState(0);
  const [drawingPlacement, setDrawingPlacement] = useState({ active: false, range: null, draft: null });
  const [preferredHighlightColor, setPreferredHighlightColor] = useState('#fde68a');
  const [hoveredBlock, setHoveredBlock] = useState(null);
  const saveTimeoutRef = useRef(null);
  const titleInputRef = useRef(null);
  const toolbarInsertButtonRef = useRef(null);
  const highlightPaletteButtonRef = useRef(null);
  const floatingInsertButtonRef = useRef(null);
  const fileInputRef = useRef(null);
  const highlightMenuPanelRef = useRef(null);
  const insertMenuPanelRef = useRef(null);
  const contextMenuPanelRef = useRef(null);
  const documentScrollAreaRef = useRef(null);
  const insertMenuRef = useRef(insertMenu);
  const activeInsertIndexRef = useRef(activeInsertIndex);
  const filteredInsertActionsRef = useRef([]);
  const pendingTitleRef = useRef(title);
  const pendingSettingsRef = useRef(pageSettings);
  const documentSheetRef = useRef(null);
  const drawingPlacementPointerRef = useRef(null);
  const pageWidthValue = getPageWidthValue(preferences.editorLayout);
  const writingPaddingValue = getWritingPaddingValue(preferences.editorLayout);

  const closeMenus = useCallback(() => {
    setContextMenu(null);
    setHighlightMenu((current) => ({ ...current, open: false }));
    setInsertMenu((current) => ({ ...current, open: false }));
  }, []);

  const persistDraftSnapshot = useCallback((currentTitle, currentContent, currentSettings) => {
    if (!pageId) {
      return;
    }

    saveDraft(pageId, {
      title: currentTitle,
      content: currentContent,
      pageSettings: currentSettings,
    });
  }, [pageId]);

  const queueAutoSave = useCallback((currentTitle, currentContent) => {
    if (!pageId) {
      return;
    }

    pendingTitleRef.current = currentTitle;
    setSaveStatus('Salvando...');

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(async () => {
      try {
        const response = await api.autoSavePage(pageId, {
          title: pendingTitleRef.current,
          content: currentContent,
        });

        setSaveStatus('Salvo');
        setWordCount(response.wordCount || 0);
        onWorkspaceRefresh();
      } catch (error) {
        console.error(error);
        setSaveStatus('Rascunho local salvo');
        onShowNotice?.('Falha no autosave remoto. Seu rascunho local foi preservado.', 'error');
      }
    }, 750);
  }, [onShowNotice, onWorkspaceRefresh, pageId]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Placeholder.configure({
        placeholder: ({ node }) => (
          node.type.name === 'heading'
            ? 'Titulo'
            : 'Digite "/" para inserir blocos, listas, tabelas ou desenho'
        ),
      }),
      Underline,
      Highlight.configure({ multicolor: true }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Link.configure({ autolink: true, linkOnPaste: true, openOnClick: false }),
      StudyImage.configure({ allowBase64: true }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      TextStyle,
      Color,
      FontFamily,
      FontSize,
      CommentMark,
      DrawingExtension,
    ],
    content: createEmptyPageContent(),
    editorProps: {
      attributes: {
        class: 'document-editor',
      },
      handleKeyDown: (_view, event) => {
        const currentMenu = insertMenuRef.current;

        if (drawingPlacement.active && event.key === 'Escape') {
          event.preventDefault();
          setDrawingPlacement({ active: false, range: null, draft: null });
          return true;
        }

        if (!currentMenu.open) {
          return false;
        }

        if (event.key === 'Escape') {
          event.preventDefault();
          setInsertMenu((current) => ({ ...current, open: false }));
          return true;
        }

        if (event.key === 'ArrowDown') {
          event.preventDefault();
          setActiveInsertIndex((current) => Math.min(
            current + 1,
            Math.max(filteredInsertActionsRef.current.length - 1, 0),
          ));
          return true;
        }

        if (event.key === 'ArrowUp') {
          event.preventDefault();
          setActiveInsertIndex((current) => Math.max(0, current - 1));
          return true;
        }

        if (event.key === 'Enter') {
          event.preventDefault();
          const menuEvent = new CustomEvent('editor:insert-enter', {
            detail: { index: activeInsertIndexRef.current },
          });
          window.dispatchEvent(menuEvent);
          return true;
        }

        return false;
      },
    },
    onUpdate: ({ editor: currentEditor }) => {
      const currentContent = currentEditor.getJSON();
      const nextWordCount = countWordsFromJson(currentContent);
      setWordCount(nextWordCount);
      setCommentCount(collectComments(currentContent).length);

      const selectionFrom = currentEditor.state.selection.from;
      const textBefore = currentEditor.state.doc.textBetween(Math.max(0, selectionFrom - 60), selectionFrom, '\n', '\0');
      const match = textBefore.match(/(?:^|\s)\/([^\s/]*)$/);

      if (match) {
        const query = match[1] || '';
        const rangeFrom = selectionFrom - query.length - 1;
        const coords = currentEditor.view.coordsAtPos(selectionFrom);

        setInsertMenu((current) => (
          current.open && current.source !== 'slash'
            ? current
              : {
                open: true,
                query,
                x: coords.left,
                y: coords.bottom + 10,
                anchorX: coords.left,
                anchorY: coords.bottom + 10,
                source: 'slash',
                range: { from: rangeFrom, to: selectionFrom },
              }
        ));
      } else if (insertMenuRef.current.open && insertMenuRef.current.source === 'slash') {
        setInsertMenu((current) => ({ ...current, open: false }));
      }

      persistDraftSnapshot(pendingTitleRef.current, currentContent, pendingSettingsRef.current);
      queueAutoSave(pendingTitleRef.current, currentContent);
    },
    onSelectionUpdate: ({ editor: currentEditor }) => {
      if (!insertMenuRef.current.open || insertMenuRef.current.source !== 'slash') {
        return;
      }

      const selectionFrom = currentEditor.state.selection.from;
      const textBefore = currentEditor.state.doc.textBetween(Math.max(0, selectionFrom - 60), selectionFrom, '\n', '\0');
      const match = textBefore.match(/(?:^|\s)\/([^\s/]*)$/);

      if (!match) {
        setInsertMenu((current) => ({ ...current, open: false }));
      }
    },
  });

  useEffect(() => {
    insertMenuRef.current = insertMenu;
  }, [insertMenu]);

  useEffect(() => {
    activeInsertIndexRef.current = activeInsertIndex;
  }, [activeInsertIndex]);

  useEffect(() => {
    pendingSettingsRef.current = pageSettings;
  }, [pageSettings]);

  useLayoutEffect(() => {
    if (!insertMenu.open || !insertMenuPanelRef.current) {
      return;
    }

    const rect = insertMenuPanelRef.current.getBoundingClientRect();
    const { left, top } = clampFloatingPosition(insertMenu.anchorX, insertMenu.anchorY, rect.width, rect.height);

    if (left !== insertMenu.x || top !== insertMenu.y) {
      setInsertMenu((current) => ({ ...current, x: left, y: top }));
    }
  }, [insertMenu.anchorX, insertMenu.anchorY, insertMenu.open, insertMenu.query, insertMenu.x, insertMenu.y]);

  useLayoutEffect(() => {
    if (!contextMenu?.open || !contextMenuPanelRef.current) {
      return;
    }

    const rect = contextMenuPanelRef.current.getBoundingClientRect();
    const { left, top } = clampFloatingPosition(contextMenu.anchorX, contextMenu.anchorY, rect.width, rect.height);

    if (left !== contextMenu.x || top !== contextMenu.y) {
      setContextMenu((current) => (current ? { ...current, x: left, y: top } : current));
    }
  }, [contextMenu]);

  useLayoutEffect(() => {
    if (!highlightMenu.open || !highlightMenuPanelRef.current) {
      return;
    }

    const rect = highlightMenuPanelRef.current.getBoundingClientRect();
    const { left, top } = clampFloatingPosition(highlightMenu.anchorX, highlightMenu.anchorY, rect.width, rect.height);

    if (left !== highlightMenu.x || top !== highlightMenu.y) {
      setHighlightMenu((current) => ({ ...current, x: left, y: top }));
    }
  }, [highlightMenu]);

  const applyPageSettings = useCallback(async (nextSettings) => {
    if (!pageId) {
      return;
    }

    const normalizedSettings = normalizePageSettings(nextSettings, defaultPageSettings);
    setPageSettings(normalizedSettings);
    pendingSettingsRef.current = normalizedSettings;

    if (editor) {
      persistDraftSnapshot(pendingTitleRef.current, editor.getJSON(), normalizedSettings);
    }

    try {
      await api.updatePage(pageId, { page_settings: normalizedSettings });
      onWorkspaceRefresh();
    } catch (error) {
      console.error(error);
      onShowNotice?.('Nao foi possivel salvar as preferencias da folha agora.', 'error');
    }
  }, [defaultPageSettings, editor, onShowNotice, onWorkspaceRefresh, pageId, persistDraftSnapshot]);

  const handleTitleChange = (event) => {
    const nextTitle = event.target.value;
    setTitle(nextTitle);
    pendingTitleRef.current = nextTitle;

    if (editor) {
      const currentContent = editor.getJSON();
      persistDraftSnapshot(nextTitle, currentContent, pendingSettingsRef.current);
      queueAutoSave(nextTitle, currentContent);
    }
  };

  const loadPage = useCallback(async () => {
    if (!pageId || !editor) {
      return;
    }

    setLoading(true);

    try {
      const data = await api.getPage(pageId);
      const serverContent = parsePageContent(data.content);
      const serverSettings = normalizePageSettings(data.page_settings, defaultPageSettings);
      const localDraft = loadDraft(pageId);
      const hasNewerDraft = localDraft && localDraft.updatedAt > parseDatabaseDate(data.updated_at);
      const activeContent = hasNewerDraft ? parsePageContent(localDraft.content) : serverContent;
      const activeTitle = hasNewerDraft ? localDraft.title || data.title : data.title;
      const activeSettings = hasNewerDraft
        ? normalizePageSettings(localDraft.pageSettings, defaultPageSettings)
        : serverSettings;

      setPage(data);
      setTitle(activeTitle || '');
      pendingTitleRef.current = activeTitle || '';
      setPageSettings(activeSettings);
      pendingSettingsRef.current = activeSettings;
      setWordCount(countWordsFromJson(activeContent));
      setCommentCount(collectComments(activeContent).length);
      editor.commands.setContent(activeContent, false);
      setSaveStatus('Salvo');
      persistDraftSnapshot(activeTitle || '', activeContent, activeSettings);

      if (hasNewerDraft) {
        onShowNotice?.('Rascunho local mais recente restaurado com sucesso.', 'info');
      }
    } catch (error) {
      console.error(error);
      onShowNotice?.('Nao foi possivel carregar esta pagina.', 'error');
    } finally {
      setLoading(false);
    }
  }, [defaultPageSettings, editor, onShowNotice, pageId, persistDraftSnapshot]);

  useEffect(() => {
    loadPage();
  }, [loadPage]);

  useEffect(() => {
    if (!pageId) {
      return undefined;
    }

    api.startSession(pageId).catch(() => {});

    return () => {
      api.endSession().catch(() => {});
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [pageId]);

  useEffect(() => {
    const handleGlobalCommand = (event) => {
      if (!editor) {
        return;
      }

      const commandMap = {
        bold: () => editor.chain().focus().toggleBold().run(),
        underline: () => editor.chain().focus().toggleUnderline().run(),
        highlight: () => editor.chain().focus().toggleHighlight({ color: preferredHighlightColor }).run(),
      };

      const command = commandMap[event.type.replace('editor:', '')];
      if (command) {
        command();
      }
    };

    const events = ['editor:bold', 'editor:underline', 'editor:highlight'];
    events.forEach((eventName) => window.addEventListener(eventName, handleGlobalCommand));

    return () => {
      events.forEach((eventName) => window.removeEventListener(eventName, handleGlobalCommand));
    };
  }, [editor, preferredHighlightColor]);

  useEffect(() => {
    const handleClickOutside = () => {
      closeMenus();
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [closeMenus]);

  useEffect(() => {
    const handleEscape = (event) => {
      if (event.key !== 'Escape') {
        return;
      }

      if (contextMenu?.open || insertMenuRef.current.open) {
        closeMenus();
      }

      if (drawingPlacement.active) {
        drawingPlacementPointerRef.current = null;
        setDrawingPlacement({ active: false, range: null, draft: null });
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [closeMenus, contextMenu?.open, drawingPlacement.active]);

  const resolveBlockDescriptorFromElement = useCallback((target, allowedTypes = CONTEXT_BLOCK_TYPES) => {
    const elementTarget = target instanceof HTMLElement ? target : target?.parentElement;

    if (!editor || !(elementTarget instanceof HTMLElement)) {
      return null;
    }

    const selectorMap = [
      { selector: '.drawing-node', type: 'drawing' },
      { selector: '.image-node', type: 'image' },
      { selector: 'table', type: 'table' },
      { selector: 'pre', type: 'codeBlock' },
      { selector: 'ul[data-type="taskList"]', type: 'taskList' },
      { selector: 'hr', type: 'horizontalRule' },
    ];

    for (const candidate of selectorMap) {
      if (!allowedTypes.includes(candidate.type)) {
        continue;
      }

      const element = elementTarget.closest(candidate.selector);
      if (!element) {
        continue;
      }

      let position = null;

      try {
        position = editor.view.posAtDOM(element, 0);
      } catch {
        position = null;
      }

      if (!Number.isFinite(position)) {
        const rect = element.getBoundingClientRect();
        position = editor.view.posAtCoords({
          left: Math.max(0, rect.left + 12),
          top: Math.max(0, rect.top + 12),
        })?.pos;
      }

      if (!Number.isFinite(position)) {
        continue;
      }

      const descriptor = buildBlockDescriptor(editor.state.doc, position, candidate.type);
      if (!descriptor) {
        continue;
      }

      return {
        ...descriptor,
        rect: element.getBoundingClientRect(),
      };
    }

    return null;
  }, [editor]);

  const deleteBlockDescriptor = useCallback((descriptor) => {
    if (!editor || !descriptor || !Number.isFinite(descriptor.pos) || !Number.isFinite(descriptor.nodeSize)) {
      return;
    }

    const docSize = editor.state.doc.content.size;
    const from = Math.max(0, Math.min(descriptor.pos, docSize));
    const to = Math.max(from, Math.min(from + descriptor.nodeSize, docSize));

    if (from === to) {
      return;
    }

    try {
      const transaction = editor.state.tr.delete(from, to).scrollIntoView();
      editor.view.dispatch(transaction);
      setHoveredBlock(null);
      setContextMenu(null);
    } catch (error) {
      console.error(error);
      onShowNotice?.(`Nao foi possivel excluir ${descriptor.label.toLowerCase()} agora.`, 'error');
    }
  }, [editor, onShowNotice]);

  const syncHoveredBlock = useCallback((eventTarget) => {
    const elementTarget = eventTarget instanceof HTMLElement ? eventTarget : eventTarget?.parentElement;

    if (elementTarget?.closest('.block-hover-actions')) {
      return;
    }

    if (drawingPlacement.active) {
      setHoveredBlock(null);
      return;
    }

    const descriptor = resolveBlockDescriptorFromElement(elementTarget, HOVER_BLOCK_TYPES);

    if (!descriptor?.rect) {
      setHoveredBlock(null);
      return;
    }

    const buttonWidth = 128;
    const left = Math.max(18, Math.min(window.innerWidth - buttonWidth - 18, descriptor.rect.right - buttonWidth));
    const top = Math.max(18, descriptor.rect.top + 10);

    setHoveredBlock((current) => {
      if (
        current
        && current.type === descriptor.type
        && current.pos === descriptor.pos
        && Math.abs(current.left - left) < 1
        && Math.abs(current.top - top) < 1
      ) {
        return current;
      }

      return {
        ...descriptor,
        left,
        top,
      };
    });
  }, [drawingPlacement.active, resolveBlockDescriptorFromElement]);

  useEffect(() => {
    const handleWindowResize = () => setHoveredBlock(null);
    window.addEventListener('resize', handleWindowResize);
    return () => window.removeEventListener('resize', handleWindowResize);
  }, []);

  const handleBlockTypeChange = (value) => {
    if (!editor) {
      return;
    }

    const chain = editor.chain().focus();

    if (value === 'paragraph') chain.setParagraph().run();
    if (value === 'heading-1') chain.toggleHeading({ level: 1 }).run();
    if (value === 'heading-2') chain.toggleHeading({ level: 2 }).run();
    if (value === 'heading-3') chain.toggleHeading({ level: 3 }).run();
    if (value === 'bulletList') chain.toggleBulletList().run();
    if (value === 'orderedList') chain.toggleOrderedList().run();
    if (value === 'taskList') chain.toggleTaskList().run();
    if (value === 'codeBlock') chain.toggleCodeBlock().run();
  };

  const openInsertMenu = (anchor, source = 'toolbar', range = null) => {
    setInsertMenu({
      open: true,
      x: anchor.x,
      y: anchor.y,
      anchorX: anchor.x,
      anchorY: anchor.y,
      query: '',
      source,
      range,
    });
    setActiveInsertIndex(0);
  };

  const openMenuFromButton = (button) => {
    const bounds = button.getBoundingClientRect();
    openInsertMenu({ x: bounds.left, y: bounds.bottom + 10 }, 'toolbar');
  };

  const insertBlockInFlow = useCallback((nodeJson, options = {}) => {
    if (!editor) {
      return false;
    }

    const { range = null } = options;
    const targetRange = range && Number.isFinite(range.from) && Number.isFinite(range.to)
      ? range
      : editor.state.selection;

    try {
      const blockNode = editor.schema.nodeFromJSON(nodeJson);
      const paragraphNode = editor.schema.nodes.paragraph?.create();

      if (!blockNode || !paragraphNode) {
        return false;
      }

      let tr = editor.state.tr;
      const docSize = tr.doc.content.size;
      const from = Math.max(0, Math.min(targetRange.from, docSize));
      const to = Math.max(from, Math.min(targetRange.to, docSize));

      tr = tr.replaceRangeWith(from, to, blockNode);

      const paragraphPos = Math.min(from + blockNode.nodeSize, tr.doc.content.size);
      tr = tr.insert(paragraphPos, paragraphNode);
      tr = tr.setSelection(TextSelection.create(tr.doc, Math.min(paragraphPos + 1, tr.doc.content.size)));

      editor.view.dispatch(tr.scrollIntoView());
      editor.view.focus();
      return true;
    } catch (error) {
      console.error(error);
      onShowNotice?.('Nao foi possivel inserir esse bloco agora.', 'error');
      return false;
    }
  }, [editor, onShowNotice]);

  const beginDrawingPlacement = useCallback((range = null) => {
    closeMenus();
    setDrawingPlacement({ active: true, range, draft: null });
  }, [closeMenus]);

  const insertActions = useMemo(() => {
    if (!editor) {
      return [];
    }

    const runWithOptionalSlashRange = (callback) => {
      const { range } = insertMenuRef.current;
      callback(range);
    };

    return [
      {
        id: 'checklist',
        label: 'Checklist',
        description: 'Lista de tarefas para acompanhamento rapido',
        keywords: 'todo tarefa checklist',
        run: () => runWithOptionalSlashRange((range) => insertBlockInFlow({
          type: 'taskList',
          content: [{
            type: 'taskItem',
            attrs: { checked: false },
            content: [{ type: 'paragraph' }],
          }],
        }, { range })),
      },
      {
        id: 'table',
        label: 'Tabela',
        description: 'Grade simples para organizar conteudo',
        keywords: 'table tabela grade',
        run: () => runWithOptionalSlashRange((range) => insertBlockInFlow(buildTableNodeJson(), { range })),
      },
      {
        id: 'image',
        label: 'Imagem',
        description: 'Inserir imagem na pagina',
        keywords: 'imagem foto upload',
        run: () => {
          runWithOptionalSlashRange((range) => {
            if (range && Number.isFinite(range.from) && Number.isFinite(range.to)) {
              editor.chain().focus().deleteRange(range).run();
            }
          });
          fileInputRef.current?.click();
        },
      },
      {
        id: 'link',
        label: 'Link',
        description: 'Adicionar um link clicavel',
        keywords: 'link url site',
        run: () => {
          const url = window.prompt('Cole o link que deseja inserir');
          if (!url) return;
          runWithOptionalSlashRange((chain) => chain.extendMarkRange('link').setLink({ href: url }).run());
        },
      },
      {
        id: 'code',
        label: 'Codigo',
        description: 'Bloco de codigo com fonte monoespacada',
        keywords: 'codigo code bloco',
        run: () => runWithOptionalSlashRange((range) => insertBlockInFlow({ type: 'codeBlock' }, { range })),
      },
      {
        id: 'drawing',
        label: 'Desenho',
        description: 'Escolha a area e insira o canvas no tamanho certo',
        keywords: 'desenho canvas sketch',
        run: () => {
          const { range } = insertMenuRef.current;
          beginDrawingPlacement(range || null);
        },
      },
      {
        id: 'divider',
        label: 'Divisor',
        description: 'Linha de separacao visual',
        keywords: 'divider linha separador',
        run: () => runWithOptionalSlashRange((range) => insertBlockInFlow({ type: 'horizontalRule' }, { range })),
      },
    ];
  }, [beginDrawingPlacement, editor, insertBlockInFlow]);

  const filteredInsertActions = useMemo(() => {
    const query = insertMenu.query.trim().toLowerCase();
    if (!query) {
      return insertActions;
    }

    return insertActions.filter((action) => (
      action.label.toLowerCase().includes(query)
      || action.description.toLowerCase().includes(query)
      || action.keywords.includes(query)
    ));
  }, [insertActions, insertMenu.query]);

  useEffect(() => {
    filteredInsertActionsRef.current = filteredInsertActions;
  }, [filteredInsertActions]);

  useEffect(() => {
    if (!filteredInsertActions.length) {
      setActiveInsertIndex(0);
      return;
    }

    setActiveInsertIndex((current) => Math.min(current, filteredInsertActions.length - 1));
  }, [filteredInsertActions.length]);

  useEffect(() => {
    const handleInsertEnter = (event) => {
      const action = filteredInsertActions[event.detail.index];
      if (!action) {
        return;
      }

      action.run();
      setInsertMenu((current) => ({ ...current, open: false }));
    };

    window.addEventListener('editor:insert-enter', handleInsertEnter);
    return () => window.removeEventListener('editor:insert-enter', handleInsertEnter);
  }, [filteredInsertActions]);

  const handleContextMenu = async (item) => {
    if (!editor) {
      return;
    }

    if (item === 'deleteBlock') {
      deleteBlockDescriptor(contextMenu?.block);
      return;
    }

    const chain = editor.chain().focus();

    if (item === 'copy') {
      try {
        const { from, to } = editor.state.selection;
        const text = editor.state.doc.textBetween(from, to, ' ');
        await navigator.clipboard.writeText(text);
      } catch (error) {
        console.error(error);
        onShowNotice?.('Nao foi possivel copiar usando a area de transferencia do navegador.', 'error');
      }
    }

    if (item === 'paste') {
      try {
        const text = await navigator.clipboard.readText();
        chain.insertContent(text).run();
      } catch (error) {
        console.error(error);
        onShowNotice?.('Nao foi possivel colar automaticamente aqui.', 'error');
      }
    }

    if (item === 'bold') chain.toggleBold().run();
    if (item === 'underline') chain.toggleUnderline().run();
    if (item === 'highlight') chain.toggleHighlight({ color: currentHighlightColor }).run();
    if (item === 'clearHighlight') chain.unsetHighlight().run();
    if (item === 'heading') chain.toggleHeading({ level: 1 }).run();
    if (item === 'task') chain.toggleTaskList().run();
    if (item === 'deleteRow') chain.deleteRow().run();
    if (item === 'deleteColumn') chain.deleteColumn().run();
    if (item === 'deleteTable') chain.deleteTable().run();

    if (item === 'comment') {
      const note = window.prompt('Digite o comentario');
      if (note) {
        chain.setComment(note).run();
      }
    }

    setContextMenu(null);
  };

  const handleImagePicked = async (event) => {
    const file = event.target.files?.[0];
    if (!file || !editor) {
      return;
    }

    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    insertBlockInFlow({
      type: 'image',
      attrs: {
        src: dataUrl,
        alt: file.name,
      },
    });
    event.target.value = '';
  };

  const textAttributes = editor?.getAttributes('textStyle') || {};
  const highlightAttributes = editor?.getAttributes('highlight') || {};
  const blockType = getBlockType(editor);
  const currentFont = textAttributes.fontFamily || preferences.editorDefaults.fontFamily;
  const currentFontSize = textAttributes.fontSize || '16px';
  const currentColor = textAttributes.color || '#2a221c';
  const currentHighlightColor = highlightAttributes.color || preferredHighlightColor;
  const selectionHasText = Boolean(editor && !editor.state.selection.empty);
  const tableActive = Boolean(editor?.isActive('table'));
  const boldShortcutLabel = formatShortcutLabel(preferences.shortcuts.bold);
  const underlineShortcutLabel = formatShortcutLabel(preferences.shortcuts.underline);
  const highlightShortcutLabel = formatShortcutLabel(preferences.shortcuts.highlight);

  const openHighlightMenu = (button) => {
    if (!button) {
      return;
    }

    const bounds = button.getBoundingClientRect();
    setHighlightMenu((current) => ({
      ...current,
      open: !current.open,
      x: bounds.left,
      y: bounds.bottom + 10,
      anchorX: bounds.left,
      anchorY: bounds.bottom + 10,
    }));
  };

  const applyHighlightColor = (color, options = {}) => {
    const { closeAfter = true } = options;
    setPreferredHighlightColor(color);

    if (editor) {
      editor.chain().focus().setHighlight({ color }).run();
    }

    if (closeAfter) {
      setHighlightMenu((current) => ({ ...current, open: false }));
    }
  };

  const toggleHighlightMark = () => {
    if (!editor) {
      return;
    }

    editor.chain().focus().toggleHighlight({ color: currentHighlightColor }).run();
  };

  const runTableCommand = (commandName) => {
    if (!editor) {
      return;
    }

    const commandMap = {
      addRowAfter: () => editor.chain().focus().addRowAfter().run(),
      addColumnAfter: () => editor.chain().focus().addColumnAfter().run(),
      deleteRow: () => editor.chain().focus().deleteRow().run(),
      deleteColumn: () => editor.chain().focus().deleteColumn().run(),
      deleteTable: () => editor.chain().focus().deleteTable().run(),
    };

    commandMap[commandName]?.();
  };

  if (!pageId) {
    return (
      <div className="main-empty">
        <p className="main-empty-title">Nenhuma pagina aberta</p>
        <p className="main-empty-hint">Abra uma pagina na lateral ou crie uma nova materia para comecar a escrever.</p>
      </div>
    );
  }

  if (loading || !editor) {
    return (
      <div className="main-empty">
        <p className="main-empty-title">Carregando pagina</p>
        <p className="main-empty-hint">Preparando o documento, o autosave e as ferramentas do editor.</p>
      </div>
    );
  }

  return (
    <div className="editor-view">
      <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={handleImagePicked} />

      <div className="workspace-topbar editor-header">
        <div className="workspace-topbar-title">
          <button type="button" className="icon-button mobile-only" onClick={onToggleSidebar}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 12h18M3 6h18M3 18h18" />
            </svg>
          </button>

          <button type="button" className="breadcrumb-link" onClick={onOpenHome}>
            Cadernos
          </button>
          <span className="breadcrumb-separator">/</span>
          <button type="button" className="breadcrumb-link ghost" onClick={() => onOpenNotebook?.(page?.notebook_id)}>
            {page?.notebook_name}
          </button>
          <span className="breadcrumb-separator">/</span>
          <button type="button" className="breadcrumb-link ghost" onClick={() => onOpenSubject?.(page?.subject_id)}>
            {page?.subject_name}
          </button>
        </div>

        <div className="editor-meta">
          <span>{wordCount} palavras</span>
          <span>{commentCount} comentarios</span>
          <span className={`save-indicator ${saveStatus !== 'Salvo' ? 'active' : ''}`}>{saveStatus}</span>
        </div>
      </div>

      <div className="editor-toolbar-shell">
        <div className="editor-toolbar">
          <div className="toolbar-group toolbar-group-dense">
            <select className="toolbar-select" value={blockType} onChange={(event) => handleBlockTypeChange(event.target.value)}>
              <option value="paragraph">Normal</option>
              <option value="heading-1">Heading 1</option>
              <option value="heading-2">Heading 2</option>
              <option value="heading-3">Heading 3</option>
              <option value="bulletList">Bullets</option>
              <option value="orderedList">Numerada</option>
              <option value="taskList">Checklist</option>
              <option value="codeBlock">Codigo</option>
            </select>

            <select
              className="toolbar-select"
              value={currentFont}
              onChange={(event) => editor.chain().focus().setFontFamily(event.target.value).run()}
            >
              {EDITOR_FONT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>

            <select
              className="toolbar-select"
              value={currentFontSize}
              onChange={(event) => editor.chain().focus().setFontSize(event.target.value).run()}
            >
              {FONT_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>{size.replace('px', '')}</option>
              ))}
            </select>

            <label className="toolbar-color-field">
              <TextColorIcon />
              <span className="toolbar-field-label">Texto</span>
              <span className="toolbar-color-swatch" style={{ background: currentColor }} />
              <input
                type="color"
                value={currentColor}
                onChange={(event) => editor.chain().focus().setColor(event.target.value).run()}
              />
            </label>
          </div>

          <div className="toolbar-group toolbar-group-formatting">
            <ToolbarButton
              active={editor.isActive('bold')}
              onClick={() => editor.chain().focus().toggleBold().run()}
              title={boldShortcutLabel ? `Negrito (${boldShortcutLabel})` : 'Negrito'}
            >
              <BoldIcon />
            </ToolbarButton>
            <ToolbarButton active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} title="Italico">
              <ItalicIcon />
            </ToolbarButton>
            <ToolbarButton
              active={editor.isActive('underline')}
              onClick={() => editor.chain().focus().toggleUnderline().run()}
              title={underlineShortcutLabel ? `Sublinhado (${underlineShortcutLabel})` : 'Sublinhado'}
            >
              <UnderlineIcon />
            </ToolbarButton>
            <ToolbarButton active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()} title="Tachado">
              <StrikeIcon />
            </ToolbarButton>

            <div className="toolbar-highlight-combo">
              <ToolbarButton
                active={editor.isActive('highlight')}
                onClick={toggleHighlightMark}
                title={highlightShortcutLabel ? `Marca-texto (${highlightShortcutLabel})` : 'Marca-texto'}
              >
                <HighlighterIcon />
              </ToolbarButton>
              <button
                ref={highlightPaletteButtonRef}
                type="button"
                className={`toolbar-highlight-picker ${highlightMenu.open ? 'active' : ''}`}
                onClick={(event) => {
                  event.stopPropagation();
                  openHighlightMenu(highlightPaletteButtonRef.current);
                }}
                title="Escolher cor do marca-texto"
              >
                <span className="toolbar-highlight-swatch" style={{ background: currentHighlightColor }} />
                <ChevronDownIcon />
              </button>
            </div>
          </div>

          <div className="toolbar-group toolbar-group-actions">
            <button
              ref={toolbarInsertButtonRef}
              type="button"
              className="insert-button"
              onClick={(event) => {
                event.stopPropagation();
                openMenuFromButton(toolbarInsertButtonRef.current);
              }}
            >
              <PlusSquareIcon />
              <span>Inserir</span>
            </button>

            <button type="button" className="toolbar-chip" onClick={() => editor.chain().focus().undo().run()}>
              <UndoIcon />
              <span>Desfazer</span>
            </button>
            <button type="button" className="toolbar-chip" onClick={() => editor.chain().focus().redo().run()}>
              <RedoIcon />
              <span>Refazer</span>
            </button>
          </div>
        </div>
      </div>

      {tableActive && (
        <div className="editor-toolbar-shell editor-toolbar-shell-compact">
          <div className="editor-toolbar editor-toolbar-secondary">
            <div className="table-toolbar-label">
              <TableIcon />
              <span>Tabela ativa</span>
            </div>

            <div className="toolbar-group toolbar-group-actions">
              <button type="button" className="toolbar-chip" onClick={() => runTableCommand('addRowAfter')}>+ Linha</button>
              <button type="button" className="toolbar-chip" onClick={() => runTableCommand('addColumnAfter')}>+ Coluna</button>
              <button type="button" className="toolbar-chip" onClick={() => runTableCommand('deleteRow')}>Remover linha</button>
              <button type="button" className="toolbar-chip" onClick={() => runTableCommand('deleteColumn')}>Remover coluna</button>
              <button type="button" className="toolbar-chip danger" onClick={() => runTableCommand('deleteTable')}>Excluir tabela</button>
            </div>
          </div>
        </div>
      )}

      <div
        ref={documentScrollAreaRef}
        className="document-scroll-area"
        onPointerMove={(event) => syncHoveredBlock(event.target)}
        onPointerLeave={() => setHoveredBlock(null)}
        onScroll={() => setHoveredBlock(null)}
        onContextMenu={(event) => {
          event.preventDefault();

          const block = resolveBlockDescriptorFromElement(event.target);
          const coords = editor.view.posAtCoords({ left: event.clientX, top: event.clientY });

          if (block?.type === 'image' || block?.type === 'drawing' || block?.type === 'horizontalRule') {
            editor.chain().focus().setNodeSelection(block.pos).run();
          } else if (coords?.pos) {
            editor.chain().focus().setTextSelection(coords.pos).run();
          }

          setContextMenu({
            open: true,
            anchorX: event.clientX + 8,
            anchorY: event.clientY + 8,
            x: event.clientX + 8,
            y: event.clientY + 8,
            block,
          });
        }}
      >
        <div
          className="document-stage"
          style={{
            '--document-max-width': pageWidthValue,
            '--document-side-padding': writingPaddingValue,
            '--document-font-family': preferences.editorDefaults.fontFamily,
          }}
        >
          {preferences.editorLayout.showFloatingInsert && (
            <button
              ref={floatingInsertButtonRef}
              type="button"
              className="floating-insert-button"
              onClick={(event) => {
                event.stopPropagation();
                const bounds = floatingInsertButtonRef.current.getBoundingClientRect();
                openInsertMenu({ x: bounds.right + 12, y: bounds.top + 10 }, 'floating');
              }}
            >
              +
            </button>
          )}

          <article
            ref={documentSheetRef}
            className={`document-sheet sheet-${pageSettings.sheetStyle} ${pageSettings.showMargin ? 'sheet-margin' : ''} ${drawingPlacement.active ? 'drawing-placement-active' : ''}`}
            onPointerDown={(event) => {
              if (!drawingPlacement.active || !documentSheetRef.current) {
                return;
              }

              drawingPlacementPointerRef.current = event.pointerId;
              event.currentTarget.setPointerCapture?.(event.pointerId);
              const rect = documentSheetRef.current.getBoundingClientRect();
              const startX = event.clientX - rect.left;
              const startY = event.clientY - rect.top;
              setDrawingPlacement((current) => ({
                ...current,
                draft: {
                  startX,
                  startY,
                  currentX: startX,
                  currentY: startY,
                },
              }));
            }}
            onPointerMove={(event) => {
              if (
                !drawingPlacement.active
                || !drawingPlacement.draft
                || !documentSheetRef.current
                || drawingPlacementPointerRef.current !== event.pointerId
              ) {
                return;
              }

              const rect = documentSheetRef.current.getBoundingClientRect();
              const currentX = event.clientX - rect.left;
              const currentY = event.clientY - rect.top;
              setDrawingPlacement((current) => ({
                ...current,
                draft: current.draft ? { ...current.draft, currentX, currentY } : current.draft,
              }));
            }}
            onPointerUp={(event) => {
              if (!drawingPlacement.active || drawingPlacementPointerRef.current !== event.pointerId) {
                return;
              }

              event.currentTarget.releasePointerCapture?.(event.pointerId);
              drawingPlacementPointerRef.current = null;
              const draft = drawingPlacement.draft;
              const dragWidth = Math.abs((draft?.currentX || 0) - (draft?.startX || 0));
              const dragHeight = Math.abs((draft?.currentY || 0) - (draft?.startY || 0));

              if (dragWidth < 24 || dragHeight < 24) {
                setDrawingPlacement({ active: false, range: null, draft: null });
                return;
              }

              const widthValue = Math.max(280, Math.round(dragWidth));
              const heightValue = Math.max(200, Math.round(dragHeight));
              insertBlockInFlow({
                type: 'drawing',
                attrs: {
                  strokes: '[]',
                  width: widthValue,
                  height: heightValue,
                  isEditing: true,
                },
              }, { range: drawingPlacement.range });
              setDrawingPlacement({ active: false, range: null, draft: null });
            }}
            onPointerCancel={() => {
              drawingPlacementPointerRef.current = null;
              setDrawingPlacement((current) => (
                current.active ? { active: false, range: null, draft: null } : current
              ));
            }}
          >
            <header className="document-sheet-header">
              <input
                ref={titleInputRef}
                className="document-title"
                value={title}
                onChange={handleTitleChange}
                placeholder="Titulo da pagina"
              />

              <div className="document-options">
                <div className="sheet-style-switch">
                  {SHEET_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={`sheet-style-button ${pageSettings.sheetStyle === option.value ? 'active' : ''}`}
                      onClick={() => applyPageSettings({ ...pageSettings, sheetStyle: option.value })}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  className={`margin-toggle ${pageSettings.showMargin ? 'active' : ''}`}
                  onClick={() => applyPageSettings({ ...pageSettings, showMargin: !pageSettings.showMargin })}
                >
                  Margem vermelha
                </button>
              </div>
            </header>

            {drawingPlacement.active && (
              <div className="drawing-placement-overlay">
                <div className="drawing-placement-hint">Arraste na folha para definir a area do desenho</div>
                {drawingPlacement.draft && (
                  <div
                    className="drawing-placement-selection"
                    style={{
                      left: Math.min(drawingPlacement.draft.startX, drawingPlacement.draft.currentX),
                      top: Math.min(drawingPlacement.draft.startY, drawingPlacement.draft.currentY),
                      width: Math.max(20, Math.abs(drawingPlacement.draft.currentX - drawingPlacement.draft.startX)),
                      height: Math.max(20, Math.abs(drawingPlacement.draft.currentY - drawingPlacement.draft.startY)),
                    }}
                  />
                )}
              </div>
            )}

            <EditorContent editor={editor} />
          </article>
        </div>

        {hoveredBlock && (
          <div className="block-hover-actions" style={{ top: hoveredBlock.top, left: hoveredBlock.left }}>
            <button
              type="button"
              className="block-hover-action"
              onClick={() => deleteBlockDescriptor(hoveredBlock)}
              title={`Excluir ${hoveredBlock.label.toLowerCase()}`}
            >
              <TrashIcon />
              <span>Excluir</span>
            </button>
          </div>
        )}

        {insertMenu.open && (
          <div
            ref={insertMenuPanelRef}
            className="insert-menu"
            style={{ top: insertMenu.y, left: insertMenu.x }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="insert-menu-header">
              <strong>Inserir bloco</strong>
              <span>/ {insertMenu.query || 'comandos'}</span>
            </div>

            <div className="insert-menu-list">
              {filteredInsertActions.map((action, index) => (
                <button
                  key={action.id}
                  type="button"
                  className={`insert-menu-item ${index === activeInsertIndex ? 'active' : ''}`}
                  onMouseEnter={() => setActiveInsertIndex(index)}
                  onClick={() => {
                    action.run();
                    setInsertMenu((current) => ({ ...current, open: false }));
                  }}
                >
                  <div>
                    <strong>{action.label}</strong>
                    <span>{action.description}</span>
                  </div>
                </button>
              ))}

              {!filteredInsertActions.length && (
                <div className="insert-empty">Nenhum bloco encontrado para esse comando.</div>
              )}
            </div>
          </div>
        )}

        {highlightMenu.open && (
          <div
            ref={highlightMenuPanelRef}
            className="highlight-menu"
            style={{ top: highlightMenu.y, left: highlightMenu.x }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="insert-menu-header">
              <strong>Marca-texto</strong>
              <span>{selectionHasText ? 'Aplicar na selecao' : 'Aplicar ao proximo texto'}</span>
            </div>

            <div className="highlight-menu-body">
              <div className="highlight-swatch-grid">
                {HIGHLIGHT_SWATCHES.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={`highlight-swatch ${currentHighlightColor === color ? 'active' : ''}`}
                    style={{ background: color }}
                    onClick={() => applyHighlightColor(color)}
                    title={`Aplicar marca-texto ${color}`}
                  />
                ))}
              </div>

              <div className="highlight-menu-actions">
                <button
                  type="button"
                  className="toolbar-chip"
                  onClick={() => applyHighlightColor(currentHighlightColor, { closeAfter: true })}
                >
                  Aplicar cor atual
                </button>
                <button
                  type="button"
                  className="toolbar-chip"
                  onClick={() => {
                    editor.chain().focus().unsetHighlight().run();
                    setHighlightMenu((current) => ({ ...current, open: false }));
                  }}
                >
                  Remover marca-texto
                </button>
              </div>
            </div>
          </div>
        )}

        {contextMenu?.open && (
          <div
            ref={contextMenuPanelRef}
            className="context-menu"
            style={{ top: contextMenu.y, left: contextMenu.x }}
            onClick={(event) => event.stopPropagation()}
          >
            <button type="button" className="context-menu-button" onClick={() => handleContextMenu('copy')}>Copiar</button>
            <button type="button" className="context-menu-button" onClick={() => handleContextMenu('paste')}>Colar</button>
            <button type="button" className="context-menu-button" onClick={() => handleContextMenu('bold')}>Negrito</button>
            <button type="button" className="context-menu-button" onClick={() => handleContextMenu('underline')}>Sublinhado</button>
            <button type="button" className="context-menu-button" onClick={() => handleContextMenu('highlight')}>Destacar</button>
            <button type="button" className="context-menu-button" onClick={() => handleContextMenu('heading')}>Transformar em titulo</button>
            <button type="button" className="context-menu-button" onClick={() => handleContextMenu('comment')}>Adicionar comentario</button>
            <button type="button" className="context-menu-button" onClick={() => handleContextMenu('task')}>Criar tarefa</button>

            {selectionHasText && (
              <>
                <div className="context-menu-divider" />
                <div className="context-menu-control">
                  <span>Fonte</span>
                  <select
                    className="context-menu-select"
                    value={currentFont}
                    onChange={(event) => editor.chain().focus().setFontFamily(event.target.value).run()}
                  >
                    {EDITOR_FONT_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>
                <div className="context-menu-control">
                  <span>Cor</span>
                  <div className="context-color-row">
                    {TEXT_COLOR_SWATCHES.map((color) => (
                      <button
                        key={color}
                        type="button"
                        className={`context-color-swatch ${currentColor === color ? 'active' : ''}`}
                        style={{ background: color }}
                        onClick={() => editor.chain().focus().setColor(color).run()}
                      />
                    ))}
                    <label className="context-color-input">
                      <span style={{ background: currentColor }} />
                      <input
                        type="color"
                        value={currentColor}
                        onChange={(event) => editor.chain().focus().setColor(event.target.value).run()}
                      />
                    </label>
                  </div>
                </div>
                <div className="context-menu-control">
                  <span>Marca-texto</span>
                  <div className="context-color-row">
                    {HIGHLIGHT_SWATCHES.map((color) => (
                      <button
                        key={color}
                        type="button"
                        className={`context-color-swatch ${currentHighlightColor === color ? 'active' : ''}`}
                        style={{ background: color }}
                        onClick={() => applyHighlightColor(color, { closeAfter: false })}
                      />
                    ))}
                    <button
                      type="button"
                      className="context-inline-action"
                      onClick={() => handleContextMenu('clearHighlight')}
                    >
                      Limpar
                    </button>
                  </div>
                </div>
              </>
            )}

            {tableActive && (
              <>
                <div className="context-menu-divider" />
                <button type="button" className="context-menu-button" onClick={() => handleContextMenu('deleteRow')}>
                  Remover linha
                </button>
                <button type="button" className="context-menu-button" onClick={() => handleContextMenu('deleteColumn')}>
                  Remover coluna
                </button>
                <button type="button" className="context-menu-button danger" onClick={() => handleContextMenu('deleteTable')}>
                  Excluir tabela
                </button>
              </>
            )}

            {contextMenu?.block && contextMenu.block.type !== 'table' && (
              <>
                <div className="context-menu-divider" />
                <button type="button" className="context-menu-button danger" onClick={() => handleContextMenu('deleteBlock')}>
                  Excluir {contextMenu.block.label.toLowerCase()}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
