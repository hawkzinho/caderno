export const DEFAULT_SHORTCUTS = {
  bold: 'ctrl+b',
  underline: 'ctrl+u',
  highlight: 'ctrl+shift+h',
  new_page: 'ctrl+alt+n',
};

export const EDITOR_FONT_OPTIONS = [
  { value: 'var(--font-editor-sans)', label: 'Jakarta Sans' },
  { value: 'var(--font-editor-readable)', label: 'Lexend' },
  { value: 'var(--font-editor-serif)', label: 'Source Serif' },
  { value: 'var(--font-editor-classic)', label: 'Spectral' },
  { value: 'var(--font-editor-modern)', label: 'Manrope' },
  { value: 'var(--font-editor-literary)', label: 'Literata' },
  { value: 'var(--font-editor-mono)', label: 'IBM Plex Mono' },
];

export const DEFAULT_EDITOR_DEFAULTS = {
  sheetStyle: 'lined',
  showMargin: true,
  fontFamily: 'var(--font-editor-sans)',
};

export const DEFAULT_EDITOR_LAYOUT = {
  pageWidth: 'standard',
  writingWidth: 'comfortable',
  showFloatingInsert: true,
};

export function normalizeSheetStyle(value) {
  return ['lined', 'grid', 'plain'].includes(value) ? value : 'lined';
}

export function normalizeFontFamily(value) {
  const validFontValues = EDITOR_FONT_OPTIONS.map((option) => option.value);
  return validFontValues.includes(value) ? value : DEFAULT_EDITOR_DEFAULTS.fontFamily;
}

export function normalizePagePreferenceDefaults(value) {
  return {
    sheetStyle: normalizeSheetStyle(value?.sheetStyle),
    showMargin: typeof value?.showMargin === 'boolean'
      ? value.showMargin
      : DEFAULT_EDITOR_DEFAULTS.showMargin,
    fontFamily: normalizeFontFamily(value?.fontFamily),
  };
}

export function normalizeEditorLayout(value) {
  const pageWidth = ['narrow', 'standard', 'wide'].includes(value?.pageWidth)
    ? value.pageWidth
    : DEFAULT_EDITOR_LAYOUT.pageWidth;
  const writingWidth = ['focused', 'comfortable', 'airy'].includes(value?.writingWidth)
    ? value.writingWidth
    : DEFAULT_EDITOR_LAYOUT.writingWidth;

  return {
    pageWidth,
    writingWidth,
    showFloatingInsert: typeof value?.showFloatingInsert === 'boolean'
      ? value.showFloatingInsert
      : DEFAULT_EDITOR_LAYOUT.showFloatingInsert,
  };
}

export function normalizePreferences(rawPreferences = {}) {
  return {
    ...rawPreferences,
    shortcuts: {
      ...DEFAULT_SHORTCUTS,
      ...(rawPreferences.shortcuts || {}),
    },
    editorDefaults: normalizePagePreferenceDefaults(rawPreferences.editorDefaults),
    editorLayout: normalizeEditorLayout(rawPreferences.editorLayout),
  };
}

export function buildPageSettingsFromPreferences(preferences = {}) {
  const normalized = normalizePreferences(preferences);

  return {
    sheetStyle: normalized.editorDefaults.sheetStyle,
    showMargin: normalized.editorDefaults.showMargin,
  };
}

export function getPageWidthValue(layout = DEFAULT_EDITOR_LAYOUT) {
  const widthMap = {
    narrow: '840px',
    standard: '980px',
    wide: '1120px',
  };

  return widthMap[layout.pageWidth] || widthMap.standard;
}

export function getWritingPaddingValue(layout = DEFAULT_EDITOR_LAYOUT) {
  const paddingMap = {
    focused: '124px',
    comfortable: '96px',
    airy: '72px',
  };

  return paddingMap[layout.writingWidth] || paddingMap.comfortable;
}
