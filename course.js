import { createEditor, applyMonacoTheme } from "./js/editor.js";
import { Runner } from "./js/runner.js";
import { Terminal } from "./js/terminal.js";
import { DebuggerView } from "./js/debugger.js";

async function loadLessons() {
  try {
    const res = await fetch("./course.json", { cache: "no-cache" });
    if (!res.ok) throw new Error(res.status);
    return await res.json();
  } catch (err) {
    console.error("Could not load course:", err);
    return null;
  }
}

const $ = (id) => document.getElementById(id);
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  remove(k) { try { localStorage.removeItem(k); } catch {} },
};

const params = new URLSearchParams(location.search);
const THEMES = [
  { id: "dark", label: "Dark+", monaco: "vs-dark" },
  { id: "light", label: "Light+", monaco: "vs" },
  { id: "monokai", label: "Monokai", monaco: "vs-dark" },
  { id: "dracula", label: "Dracula", monaco: "vs-dark" },
  { id: "nord", label: "Nord", monaco: "vs-dark" },
  { id: "solarized-dark", label: "Solarized Dark", monaco: "vs-dark" },
  { id: "solarized-light", label: "Solarized Light", monaco: "vs" },
  { id: "github-dark", label: "GitHub Dark", monaco: "vs-dark" },
  { id: "hacker", label: "80s Hacker (Green)", monaco: "term-hacker" },
  { id: "c64", label: "Commodore 64", monaco: "term-c64" },
  { id: "amiga", label: "Amiga Workbench 1.0", monaco: "term-amiga" },
  { id: "neon", label: "Neon High Contrast", monaco: "hc-black" },
];
function themeMeta(id) { return THEMES.find(t => t.id === id) || THEMES[0]; }
let theme = params.get("theme") || store.get("theme") || "dark";
if (!THEMES.some(t => t.id === theme)) theme = "dark";
let fontSize = Number(store.get("fontSize")) || 16;
document.documentElement.dataset.theme = theme;

const term = new Terminal($("terminal"));
let current = null;
let busy = false;
let pythonReady = false;

const runner = new Runner({
  onOutput: (text, stream) => term.write(text, stream),
  onReady: () => { pythonReady = true; updateUi(); },
});

const editor = await createEditor($("editor"), {
  code: "print('Hello')",
  theme,
  fontSize,
});
const dbg = new DebuggerView(editor);
const errorMarks = editor.createDecorationsCollection();

const HINT_FAILURES_PER_STEP = 3;
const hintProgress = new Map();

function getHintProgress(lessonId) {
  if (!lessonId) return { attempts: 0, revealed: [], activeTask: null };
  if (!hintProgress.has(lessonId)) hintProgress.set(lessonId, { attempts: 0, revealed: [], activeTask: null });
  return hintProgress.get(lessonId);
}

function hintLines(hint) {
  return String(hint ?? "")
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+$/, ""))
    .filter((line) => line.trim());
}

function revealHintLine(hintEl) {
  if (!hintEl) return false;
  const line = hintEl.querySelector(".hint-line.hidden");
  if (!line) return false;
  const progress = getHintProgress(current?.id);
  const taskIndex = Number(hintEl.dataset.taskIndex);
  progress.revealed[taskIndex] = (progress.revealed[taskIndex] || 0) + 1;
  progress.activeTask = taskIndex;
  line.classList.remove("hidden");
  hintEl.classList.remove("hidden");
  const toggle = hintEl.parentElement?.querySelector(".hint-toggle");
  if (toggle) toggle.classList.add("hidden");
  return true;
}

function revealNextHintLine() {
  const progress = getHintProgress(current?.id);
  let hintEl = null;
  if (progress.activeTask != null) {
    const active = document.querySelector(`#lesson-tasks .hint[data-task-index="${progress.activeTask}"]`);
    if (active && active.querySelector(".hint-line.hidden")) hintEl = active;
  }
  if (!hintEl) {
    const line = document.querySelector("#lesson-tasks .hint-line.hidden");
    hintEl = line ? line.closest(".hint") : null;
  }
  return hintEl ? revealHintLine(hintEl) : false;
}

function recordWrongAttempt() {
  if (!current) return;
  const progress = getHintProgress(current.id);
  progress.attempts += 1;
  if (progress.attempts < HINT_FAILURES_PER_STEP) return;
  progress.attempts = 0;
  revealNextHintLine();
}

function recordCorrectAttempt() {
  if (current) getHintProgress(current.id).attempts = 0;
}

function renderTaskHint(taskEl, hint, taskIndex, lessonId) {
  const lines = hintLines(hint);
  if (!lines.length) return;
  const progress = getHintProgress(lessonId);
  const revealed = progress.revealed[taskIndex] || 0;
  const hintEl = document.createElement("div");
  hintEl.className = "hint";
  hintEl.dataset.taskIndex = String(taskIndex);
  lines.forEach((line, i) => {
    const lineEl = document.createElement("div");
    lineEl.className = "hint-line" + (i < revealed ? "" : " hidden");
    lineEl.textContent = (i === 0 ? "Hint: " : "") + line;
    hintEl.appendChild(lineEl);
  });
  if (!revealed) hintEl.classList.add("hidden");
  taskEl.appendChild(hintEl);
  if (!revealed) {
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "hint-toggle";
    toggle.textContent = "hint";
    toggle.onclick = () => revealHintLine(hintEl);
    taskEl.appendChild(toggle);
  }
}

function updateUi() {
  const hasTests = Boolean(current && Array.isArray(current.tests) && current.tests.length);
  $("btn-run").disabled = $("btn-debug").disabled = busy || !pythonReady;
  $("btn-check").disabled = busy || !pythonReady || !hasTests;
  $("btn-stop").disabled = !busy;
  $("status").textContent = busy ? "Running…" : pythonReady ? "Ready" : "Loading Python…";
}

function showTab(name) {
  for (const t of ["output", "debugger"]) {
    $("tab-" + t).classList.toggle("active", t === name);
    $("panel-" + t).classList.toggle("hidden", t !== name);
  }
  dbg.setActive(name === "debugger");
}

async function execute(debug) {
  if (busy || !pythonReady) return;
  busy = true;
  updateUi();
  dbg.clear();
  errorMarks.clear();
  showTab("output");
  const code = editor.getValue();
  const inputs = [];

  try {
    for (;;) {
      term.clear();
      const result = await runner.run(code, inputs, debug);
      if (result.needInput) {
        const answer = await term.readLine();
        if (answer === null) throw new Error("stopped");
        inputs.push(answer);
        continue;
      }
      if (result.errorLine) {
        errorMarks.set([{
          range: new window.monaco.Range(result.errorLine, 1, result.errorLine, 1),
          options: { isWholeLine: true, className: "error-line" },
        }]);
      }
      if (debug) {
        dbg.load(code, result);
        showTab("debugger");
      }

      const tests = Array.isArray(current?.tests) ? current.tests : [];
      if (tests.length) {
        if (result.error) {
          recordWrongAttempt();
          term.write("\nTask check: fix the error above, then complete the task(s).\n", "info");
        } else {
          try {
            const chk = await runner.check(code, tests);
            if (chk.error) {
              recordWrongAttempt();
              term.write("\nTask check: fix the error above, then complete the task(s).\n", "info");
            } else {
              const cresults = chk.results || [];
              const passed = cresults.filter((r) => r.passed).length;
              if (passed === cresults.length) {
                recordCorrectAttempt();
                term.write(`\nTask check: ${passed}/${cresults.length} completed. Great work!\n`, "ok");
              } else {
                recordWrongAttempt();
                term.write(`\nTask check: ${passed}/${cresults.length} completed. Task not completed yet.\n`, "bad");
                cresults.forEach((r, i) => {
                  if (r.passed) return;
                  const t = tests[i] || {};
                  term.write(`- ${t.label || `Test ${i + 1}`}: ${r.reason || "Not completed yet."}\n`, "info");
                });
                if (debug) showTab("output");
              }
            }
          } catch (_) {
            term.write("\nTask check: could not verify tasks right now.\n", "info");
          }
        }
      }
      break;
    }
  } catch (err) {
    if (err.message === "stopped") term.write("\n[Program stopped]\n", "info");
    else term.write("\n" + err.message + "\n", "stderr");
  } finally {
    busy = false;
    updateUi();
  }
}

async function check() {
  if (busy || !pythonReady || !current) return;
  const tests = Array.isArray(current.tests) ? current.tests : [];
  if (!tests.length) {
    term.clear();
    term.write("This lesson does not have any checks yet.\n", "info");
    return;
  }

  busy = true;
  updateUi();
  dbg.clear();
  errorMarks.clear();
  showTab("output");
  term.clear();

  try {
    const result = await runner.check(editor.getValue(), tests);
    if (result.errorLine) {
      errorMarks.set([{
        range: new window.monaco.Range(result.errorLine, 1, result.errorLine, 1),
        options: { isWholeLine: true, className: "error-line" },
      }]);
    }
    if (result.error) {
      recordWrongAttempt();
      term.write(result.error + "\n", "stderr");
      return;
    }

    const results = result.results || [];
    const passed = results.filter((r) => r.passed).length;
    const allPassed = results.length > 0 && passed === results.length;
    if (allPassed) recordCorrectAttempt();
    else recordWrongAttempt();
    term.write(`Checks: ${passed}/${results.length} passed\n`, allPassed ? "ok" : "bad");

    results.forEach((r, i) => {
      const test = tests[i] || {};
      const label = test.label ? ` (${test.label})` : "";
      term.write(`Test ${i + 1}${label}: ${r.passed ? "PASS" : "FAIL"}\n`, r.passed ? "ok" : "bad");
      if (r.passed) return;
      const expected = [].concat(test.expect ?? []).join(" / ");
      if (expected) term.write(`  Expected output to contain: ${expected}\n`, "info");
      if (r.reason) term.write(`  ${r.reason}\n`, "info");
      if (r.output) term.write(`  Your output:\n${r.output.replace(/^/gm, "    ")}\n`, "stdout");
    });
  } catch (err) {
    if (err.message === "stopped") term.write("\n[Check stopped]\n", "info");
    else term.write("\n" + err.message + "\n", "stderr");
  } finally {
    busy = false;
    updateUi();
  }
}

function stop() {
  if (!busy) return;
  pythonReady = false;
  term.cancelInput();
  runner.stop();
}

$("btn-run").onclick = () => execute(false);
$("btn-check").onclick = check;
$("btn-debug").onclick = () => execute(true);
$("btn-stop").onclick = stop;
$("btn-clear").onclick = () => term.clear();
$("tab-output").onclick = () => showTab("output");
$("tab-debugger").onclick = () => showTab("debugger");

editor.addCommand(window.monaco.KeyMod.CtrlCmd | window.monaco.KeyCode.Enter, () => execute(false));

const codeKey = (id) => "year9CourseCode:v1:" + id;
editor.onDidChangeModelContent(() => {
  const code = editor.getValue();
  if (current && code === current.starter) store.remove(codeKey(current.id));
  else if (current) store.set(codeKey(current.id), code);
  errorMarks.clear();
});

const data = await loadLessons();
const select = $("lessonSelect");

if (!data || !Array.isArray(data.lessons) || data.lessons.length === 0) {
  $("lesson-title").textContent = "Unable to load course";
  $("lesson-kicker").textContent = "";
  $("lesson-focus").textContent = "";
  $("status").textContent = "Error loading course.";
} else {
  const lessons = data.lessons;
  const groups = new Map();
  lessons.forEach((l) => {
    const sec = l.section || "Course";
    if (!groups.has(sec)) groups.set(sec, []);
    groups.get(sec).push(l);
  });
  select.innerHTML = "";
  for (const [sec, items] of groups.entries()) {
    const og = document.createElement("optgroup");
    og.label = sec;
    items.forEach((l) => og.appendChild(new Option(l.title || l.id, l.id)));
    select.appendChild(og);
  }

  function showLesson(id, updateUrl = true) {
    const lesson = lessons.find((l) => l.id === id) || lessons[0];
    if (!lesson) return;
    current = lesson;
    select.value = lesson.id;
    store.set("year9CourseLessonId:v2", lesson.id);

    $("lesson-section").textContent = lesson.section ? (lesson.section + (lesson.subsection ? " › " + lesson.subsection : "")) : "";
    $("lesson-kicker").textContent = lesson.subtitle || (lesson.kind === "section-test" ? "Section Test" : "");
    $("lesson-title").textContent = lesson.title || lesson.id;
    $("lesson-focus").textContent = lesson.focus ? "From transcript: " + lesson.focus : "";
    document.title = (lesson.title || "Lesson") + " | Year 9 Python Basics";

    const conceptEl = $("lesson-concept");
    conceptEl.innerHTML = "";
    if (lesson.concept) {
      const h = document.createElement("h4");
      h.textContent = "Concept";
      const p = document.createElement("div");
      p.textContent = lesson.concept;
      conceptEl.appendChild(h);
      conceptEl.appendChild(p);
    }

    const primmEl = $("lesson-primm");
    if (primmEl) {
      primmEl.innerHTML = "";
      if (lesson.primm && typeof lesson.primm === "object") {
        const h = document.createElement("h4");
        h.textContent = "PRIMM steps";
        const ol = document.createElement("ol");
        const steps = [
          ["predict", "Predict"],
          ["run", "Run"],
          ["investigate", "Investigate"],
          ["modify", "Modify"],
          ["make", "Make (challenge)"],
        ];
        steps.forEach(([key, label]) => {
          if (!lesson.primm[key]) return;
          const li = document.createElement("li");
          const span = document.createElement("span");
          span.className = "primm-label";
          span.textContent = label + ":";
          li.appendChild(span);
          li.appendChild(document.createTextNode(" " + lesson.primm[key]));
          ol.appendChild(li);
        });
        if (ol.children.length) {
          primmEl.appendChild(h);
          primmEl.appendChild(ol);
        }
      }
    }

    const learnEl = $("lesson-learning");
    learnEl.innerHTML = "";
    if (Array.isArray(lesson.learning) && lesson.learning.length) {
      const h = document.createElement("h4");
      h.textContent = "You will learn";
      const ul = document.createElement("ul");
      lesson.learning.forEach((t) => {
        const li = document.createElement("li");
        li.textContent = t;
        ul.appendChild(li);
      });
      learnEl.appendChild(h);
      learnEl.appendChild(ul);
    }

    const tasksEl = $("lesson-tasks");
    tasksEl.innerHTML = "";
    if (Array.isArray(lesson.tasks) && lesson.tasks.length) {
      const h = document.createElement("h4");
      h.textContent = lesson.kind === "section-test" ? "Section Test" : "Try this";
      tasksEl.appendChild(h);
      lesson.tasks.forEach((t, i) => {
        const div = document.createElement("div");
        div.className = "lesson-task";
        const prompt = document.createElement("div");
        const strong = document.createElement("strong");
        strong.textContent = `Task ${i + 1}:`;
        prompt.appendChild(strong);
        prompt.appendChild(document.createTextNode(" " + (t.prompt || "")));
        div.appendChild(prompt);
        if (t.hint) renderTaskHint(div, t.hint, i, lesson.id);
        tasksEl.appendChild(div);
      });
    }

    editor.setValue(store.get(codeKey(lesson.id)) ?? lesson.starter ?? "");
    dbg.clear();
    errorMarks.clear();
    document.querySelector(".instructions-pane").scrollTop = 0;
    updateUi();

    if (updateUrl) {
      const url = new URL(location.href);
      url.searchParams.set("lesson", lesson.id);
      history.replaceState(null, "", url);
    }
  }

  const initial =
    (params.get("lesson") && lessons.some((l) => l.id === params.get("lesson")) ? params.get("lesson") : null) ??
    (lessons.some((l) => l.id === store.get("year9CourseLessonId:v2")) ? store.get("year9CourseLessonId:v2") : null) ??
    (lessons.some((l) => l.id === store.get("year9CourseLessonId")) ? store.get("year9CourseLessonId") : null) ??
    lessons[0].id;

  select.onchange = () => showLesson(select.value);
  $("btn-reset").onclick = () => {
    if (!current) return;
    if (confirm("Reset to the starter code for this lesson?")) {
      editor.setValue(current.starter || "");
      store.remove(codeKey(current.id));
    }
  };

  showLesson(initial, false);
}

function applyTheme(id) {
  const meta = themeMeta(id);
  theme = meta.id;
  document.documentElement.dataset.theme = theme;
  applyMonacoTheme(window.monaco, theme);
  store.set("theme", theme);
  if ($("btn-theme")) $("btn-theme").textContent = `Theme: ${meta.label} \u25BE`;
  document.querySelectorAll("#theme-menu .theme-option").forEach((el) => {
    el.classList.toggle("active", el.dataset.theme === theme);
  });
}
function initThemeMenu() {
  const btn = $("btn-theme"), menu = $("theme-menu");
  if (!btn || !menu) return;
  menu.innerHTML = "";
  THEMES.forEach((t) => {
    const opt = document.createElement("button");
    opt.type = "button";
    opt.className = "theme-option";
    opt.dataset.theme = t.id;
    opt.textContent = t.label;
    opt.onclick = () => { applyTheme(t.id); menu.classList.add("hidden"); };
    menu.appendChild(opt);
  });
  btn.onclick = (e) => { e.stopPropagation(); menu.classList.toggle("hidden"); };
  document.addEventListener("click", (e) => {
    if (!menu.classList.contains("hidden") && !menu.contains(e.target) && e.target !== btn) menu.classList.add("hidden");
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") menu.classList.add("hidden"); });
}
function setFont(size) {
  fontSize = Math.max(10, Math.min(32, size));
  editor.updateOptions({ fontSize });
  store.set("fontSize", fontSize);
}
$("btn-font-up").onclick = () => setFont(fontSize + 2);
$("btn-font-down").onclick = () => setFont(fontSize - 2);
initThemeMenu();
applyTheme(theme);

updateUi();
