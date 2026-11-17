/* Loads Monaco from the CDN and creates the editor. */
const MONACO_BASE = "https://cdn.jsdelivr.net/npm/monaco-editor@0.52.0/min";
const MONACO_FONT_DEFAULT = 'Consolas, "Courier New", monospace';
const MONACO_FONT_AMIGA = '"IBM Plex Mono", Consolas, "Courier New", monospace';
let activeEditor = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error("Could not load " + src));
    document.head.appendChild(s);
  });
}

export async function createEditor(container, { code, theme, fontSize }) {
  await loadScript(`${MONACO_BASE}/vs/loader.js`);

  // Monaco's workers live on another origin, so bootstrap them through a data: URL.
  window.MonacoEnvironment = {
    getWorkerUrl: () =>
      "data:text/javascript;charset=utf-8," +
      encodeURIComponent(
        `self.MonacoEnvironment={baseUrl:'${MONACO_BASE}/'};importScripts('${MONACO_BASE}/vs/base/worker/workerMain.js');`
      ),
  };

  window.require.config({ paths: { vs: `${MONACO_BASE}/vs` } });
  await new Promise((resolve) => window.require(["vs/editor/editor.main"], resolve));

  defineThemes(window.monaco);

  const editor = window.monaco.editor.create(container, {
    value: code,
    language: "python",
    theme: monacoTheme(theme),
    fontSize,
    fontFamily: theme === "amiga" ? MONACO_FONT_AMIGA : MONACO_FONT_DEFAULT,
    fontLigatures: false,
    automaticLayout: true,
    minimap: { enabled: false },
    glyphMargin: true,
    scrollBeyondLastLine: false,
    tabSize: 4,
    insertSpaces: true,
    wordWrap: "on",
  });
  activeEditor = editor;
  if (theme === "amiga" && document.fonts?.ready) {
    document.fonts.ready.then(() => editor.updateOptions({ fontFamily: MONACO_FONT_AMIGA }));
  }
  return editor;
}

function defineThemes(monaco) {
  if (monaco.__themesDefined) return;
  monaco.__themesDefined = true;

  monaco.editor.defineTheme("term-hacker", {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "", foreground: "00ff41", background: "020b02" },
      { token: "comment", foreground: "00aa2a", fontStyle: "italic" },
      { token: "keyword", foreground: "33ff66", fontStyle: "bold" },
      { token: "string", foreground: "66ff99" },
      { token: "number", foreground: "00ffaa" },
      { token: "type", foreground: "00ffaa" },
      { token: "identifier", foreground: "b6ffb6" },
      { token: "delimiter", foreground: "00cc33" },
      { token: "operator", foreground: "39ff14" },
    ],
    colors: {
      "editor.background": "#020b02",
      "editor.foreground": "#b6ffb6",
      "editorLineNumber.foreground": "#007a1f",
      "editorLineNumber.activeForeground": "#00ff41",
      "editorCursor.foreground": "#00ff41",
      "editor.selectionBackground": "#00ff4140",
      "editor.lineHighlightBackground": "#031403",
      "editorIndentGuide.background1": "#00ff4120",
      "editorIndentGuide.activeBackground1": "#00ff4160",
    },
  });

  monaco.editor.defineTheme("term-c64", {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "", foreground: "e4e0ff", background: "4338b5" },
      { token: "comment", foreground: "c9c0ff", fontStyle: "italic" },
      { token: "keyword", foreground: "ffb15a", fontStyle: "bold" },
      { token: "string", foreground: "8ef07a" },
      { token: "function", foreground: "ffd966" },
      { token: "number", foreground: "ffd966" },
      { token: "type", foreground: "ffd966" },
      { token: "type.identifier", foreground: "ffd966" },
      { token: "identifier", foreground: "e4e0ff" },
      { token: "delimiter", foreground: "e4e0ff" },
      { token: "operator", foreground: "ffb15a" },
    ],
    colors: {
      "editor.background": "#4338b5",
      "editor.foreground": "#e4e0ff",
      "editorLineNumber.foreground": "#c9c0ff",
      "editorLineNumber.activeForeground": "#e4e0ff",
      "editorCursor.foreground": "#ffd966",
      "editor.selectionBackground": "#a394e840",
      "editor.lineHighlightBackground": "#4e42c7",
      "editorIndentGuide.background1": "#a394e830",
      "editorIndentGuide.activeBackground1": "#a394e880",
      "editorWidget.background": "#5c50d4",
      "editorWidget.border": "#a394e8",
      "editorSuggestWidget.background": "#5c50d4",
      "editorSuggestWidget.border": "#a394e8",
      "editorSuggestWidget.selectedBackground": "#4e42c7",
      "editorHoverWidget.background": "#5c50d4",
      "editorHoverWidget.border": "#a394e8",
    },
  });

  monaco.editor.defineTheme("term-amiga", {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "", foreground: "ffffff", background: "005cb8" },
      { token: "comment", foreground: "e0e0e0", fontStyle: "italic" },
      { token: "keyword", foreground: "ffd166", fontStyle: "bold" },
      { token: "string", foreground: "ffd1a3" },
      { token: "function", foreground: "a8e0ff" },
      { token: "number", foreground: "ffd166" },
      { token: "type", foreground: "a8e0ff" },
      { token: "type.identifier", foreground: "a8e0ff" },
      { token: "identifier", foreground: "ffffff" },
      { token: "delimiter", foreground: "ffffff" },
      { token: "operator", foreground: "ffd166" },
    ],
    colors: {
      "editor.background": "#005cb8",
      "editor.foreground": "#ffffff",
      "editorGutter.background": "#005cb8",
      "editorLineNumber.foreground": "#d9d9d9",
      "editorLineNumber.activeForeground": "#ffffff",
      "editorCursor.foreground": "#ffd166",
      "editor.selectionBackground": "#8cb7ff",
      "editor.selectionForeground": "#001b5e",
      "editor.inactiveSelectionBackground": "#8cb7ff",
      "editor.lineHighlightBackground": "#0052a5",
      "editor.lineHighlightBorder": "#00428c",
      "editorIndentGuide.background1": "#3a7bd5",
      "editorIndentGuide.activeBackground1": "#ffd166",
      "editorWidget.background": "#e8e8e8",
      "editorWidget.foreground": "#001b5e",
      "editorWidget.border": "#001b5e",
      "editorSuggestWidget.background": "#e8e8e8",
      "editorSuggestWidget.foreground": "#001b5e",
      "editorSuggestWidget.border": "#001b5e",
      "editorSuggestWidget.selectedBackground": "#8cb7ff",
      "editorHoverWidget.background": "#e8e8e8",
      "editorHoverWidget.foreground": "#001b5e",
      "editorHoverWidget.border": "#001b5e",
      "editorBracketMatch.background": "#8cb7ff",
      "editorBracketMatch.border": "#001b5e",
      "editorOverviewRuler.border": "#001b5e",
      "scrollbarSlider.background": "#d9d9d9",
      "scrollbarSlider.hoverBackground": "#f2f2f2",
      "scrollbarSlider.activeBackground": "#ffffff",
    },
  });
}

export function monacoTheme(id) {
  if (id === "light" || id === "solarized-light") return "vs";
  if (id === "hacker") return "term-hacker";
  if (id === "c64") return "term-c64";
  if (id === "amiga") return "term-amiga";
  if (id === "neon") return "hc-black";
  return "vs-dark";
}

export function applyMonacoTheme(monaco, id) {
  if (!monaco?.editor) return;
  defineThemes(monaco);
  monaco.editor.setTheme(monacoTheme(id));
  if (activeEditor) {
    activeEditor.updateOptions({
      fontFamily: id === "amiga" ? MONACO_FONT_AMIGA : MONACO_FONT_DEFAULT,
      fontLigatures: false,
    });
  }
}
