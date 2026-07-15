import { 
  signal, 
  effect, 
  memo, 
  html, 
  Router, 
  Route, 
  Link, 
  getPath, 
  onCleanup,
  batch,
  mapArray,
  createResource,
  webSocketSignal,
  dbSignal,
  useHead,
  render,
  hydrate
} from "../src/index.js";
import { runTestsAndRender } from "../tests/tests.js";
import StatCard from "./components/StatCard.js";

// --- STATE DEFINITIONS ---

// Dashboard wave generator points
const [wavePoints, setWavePoints] = signal([
  40, 50, 45, 60, 55, 70, 65, 80, 75, 90, 85, 100, 95, 80, 85, 70, 75, 60, 50, 40
]);



// Benchmark state
const [benchmarkRows, setBenchmarkRows] = signal([]);
const [selectedRowId, setSelectedRowId] = signal(null);
const [lastOperation, setLastOperation] = signal("None");
const [lastDuration, setLastDuration] = signal(0);

// Metric counts
const [frameCount, setFrameCount] = signal(0);
const fpsSignal = signal(60);

// --- COMPONENT HELPERS ---

// Simulated FPS Ticker
if (typeof window !== "undefined") {
  let lastTime = performance.now();
  let frames = 0;
  function tickFPS() {
    const now = performance.now();
    frames++;
    if (now > lastTime + 1000) {
      fpsSignal[1](Math.round((frames * 1000) / (now - lastTime)));
      frames = 0;
      lastTime = now;
    }
    setFrameCount(c => c + 1);
    requestAnimationFrame(tickFPS);
  }
  requestAnimationFrame(tickFPS);
}

const slideTransition = (duration = 250) => ({
  enter(node) {
    node.style.opacity = "0";
    node.style.transform = "translateX(-20px)";
    node.style.transition = `all ${duration}ms cubic-bezier(0.4, 0, 0.2, 1)`;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        node.style.opacity = "1";
        node.style.transform = "translateX(0)";
      });
    });
  },
  leave(node, remove) {
    node.style.transition = `all ${duration}ms cubic-bezier(0.4, 0, 0.2, 1)`;
    node.style.opacity = "0";
    node.style.transform = "translateX(20px)";
    setTimeout(remove, duration);
  }
});

// --- MAIN COMPONENTS ---

function Sidebar() {
  const activeClass = (path) => () => getPath() === path ? "nav-link active" : "nav-link";

  return html`
    <aside class="sidebar">
      <div class="logo">
        <div class="logo-icon">⚡</div>
        <span>CachouJS</span>
      </div>
      <nav class="nav-links">
        ${Link({ href: "/", class: activeClass("/"), children: html`<span><i class="fa-solid fa-chart-line"></i> Dashboard</span>` })}
        ${Link({ href: "/benchmark", class: activeClass("/benchmark"), children: html`<span><i class="fa-solid fa-gauge-high"></i> Benchmark</span>` })}
        ${Link({ href: "/tests", class: activeClass("/tests"), children: html`<span><i class="fa-solid fa-vial"></i> Unit Tests</span>` })}
      </nav>
    </aside>
  `;
}

function DashboardPage() {
  // Todo List state - connected to SQLite database dynamically via dbSignal!
  const [todos, setTodos] = dbSignal("todos");
  const [newTodoText, setNewTodoText] = signal("");

  // Dynamically update SEO Head Metadata
  useHead({
    title: () => `Dashboard (${(todos() || []).length} Tasks) | CachouJS`,
    meta: [
      { name: "description", content: "Super-fast reactive collaborative dashboard powered by CachouJS." }
    ]
  });

  // SVG wave path generator
  const svgPath = memo(() => {
    const pts = wavePoints();
    const width = 600;
    const height = 150;
    const step = width / (pts.length - 1);
    return pts.map((p, i) => `${i === 0 ? "M" : "L"} ${i * step} ${height - p}`).join(" ");
  });

  // SVG wave fill path generator (closed shape for gradient fill)
  const svgFillPath = memo(() => {
    const pts = wavePoints();
    const width = 600;
    const height = 150;
    const step = width / (pts.length - 1);
    const linePath = pts.map((p, i) => `L ${i * step} ${height - p}`).join(" ");
    return `M 0 150 ${linePath} L 600 150 Z`;
  });

  // Wave simulator
  const interval = setInterval(() => {
    setWavePoints(pts => {
      const nextPts = pts.slice(1);
      const lastPt = pts[pts.length - 1];
      const change = (Math.random() - 0.5) * 15;
      const nextPt = Math.max(10, Math.min(130, lastPt + change));
      return [...nextPts, nextPt];
    });
  }, 100);

  onCleanup(() => clearInterval(interval));

  // Connect to the real-time WebSocket API
  const wsUrl = typeof window !== "undefined" ? `ws://${window.location.host}/ws-api` : "";
  const [wsMessage, { send: wsSend, status: wsStatus }] = webSocketSignal(wsUrl, { 
    json: true,
    initialValue: typeof window === "undefined" ? { type: "metric", cpu: "2.4", mem: "32.8" } : null
  });

  const [chatInput, setChatInput] = signal("");
  const [chatMessages, setChatMessages] = signal([]);

  // CPU and Mem reactive derived stats
  const wsCpu = memo(() => {
    const msg = wsMessage();
    return msg?.type === "metric" ? msg.cpu + "%" : "Connecting...";
  });

  const wsMem = memo(() => {
    const msg = wsMessage();
    return msg?.type === "metric" ? msg.mem + "%" : "Connecting...";
  });

  // Track chat / log messages
  effect(() => {
    const msg = wsMessage();
    if (msg) {
      if (msg.type === "chat") {
        setChatMessages(list => [...list, msg]);
      } else if (msg.type === "info") {
        setChatMessages(list => [...list, { user: "System", text: msg.message, timestamp: msg.timestamp }]);
      }
    }
  });

  const sendChatMessage = (e) => {
    e.preventDefault();
    const text = chatInput().trim();
    if (!text) return;
    wsSend({ type: "chat", user: "Developer", text });
    setChatInput("");
  };

  // Todo events connected to SQLite database dynamically via dbSignal
  const handleAddTodo = (e) => {
    e.preventDefault();
    const text = newTodoText().trim();
    if (!text) return;

    // Add new row without ID (server-side syncTable generates the real SQLite ID automatically)
    const newItem = { text, completed: false };
    setTodos(list => [...(list || []), newItem]);
    setNewTodoText("");
  };

  const toggleTodo = (id) => {
    setTodos(list => (list || []).map(t => t.id === id ? { ...t, completed: !t.completed } : t));
  };

  const deleteTodo = (id) => {
    setTodos(list => (list || []).filter(t => t.id !== id));
  };

  return html`
    <div class="dashboard-page">
      <header>
        <h1>Performance Dashboard</h1>
        <div class="badge-v">Engine: Fine-grained Signals</div>
      </header>

      <div class="grid">
        ${StatCard({ title: "Framework Overhead", value: "0.00ms", description: "No Virtual DOM diffing. DOM updates map 1-to-1 with signal triggers." })}
        ${StatCard({ title: "System CPU (WS)", value: wsCpu, description: () => `WS Connection: ${wsStatus()}` })}
        ${StatCard({ title: "System Memory (WS)", value: wsMem, description: "Streamed in real-time from server" })}
      </div>

      <div class="grid" style="grid-template-columns: 2fr 1fr;">
        <!-- Wave Chart -->
        <div class="card">
          <div class="card-title">Real-time Performance Signal Visualizer</div>
          <div class="chart-container">
            <svg class="chart-svg" viewBox="0 0 600 150">
              <defs>
                <linearGradient id="wave-grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stop-color="var(--primary)" stop-opacity="0.3"/>
                  <stop offset="100%" stop-color="var(--primary)" stop-opacity="0.0"/>
                </linearGradient>
              </defs>
              <path d=${svgFillPath} fill="url(#wave-grad)" />
              <path d=${svgPath} fill="none" stroke="var(--primary)" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </div>
        </div>

        <!-- System Stats / WS Info -->
        <div class="card">
          <div class="card-title">Server Metrics</div>
          <p style="color: var(--text-muted); font-size: 14px; margin-bottom: 20px;">
            WebSocket connection state is reactive. The signals update when the server streams data frames.
          </p>
          <div class="ws-status" style="font-size: 14px; font-weight: bold; margin-bottom: 12px; display: flex; align-items: center; gap: 8px;">
            Status: <span class="badge-v" style="border: 0; background: ${() => wsStatus() === "OPEN" ? "var(--success-glow)" : "var(--danger-glow)"}; color: ${() => wsStatus() === "OPEN" ? "var(--success)" : "var(--danger)"};">${wsStatus}</span>
          </div>
        </div>
      </div>

      <div class="grid" style="grid-template-columns: 1fr 1fr;">
        <!-- Todo List widget -->
        <div class="card">
          <div class="card-title">Reactive Tasks (SQLite DB)</div>
          <form onsubmit=${handleAddTodo} class="todo-input-container">
            <input 
              type="text" 
              class="input-field" 
              placeholder="Add new task..." 
              bind:value=${[newTodoText, setNewTodoText]} 
            />
            <button class="btn" type="submit"><i class="fa-solid fa-plus"></i></button>
          </form>
          
          <ul class="todo-list">
            ${mapArray(todos, todo => {
              const itemClass = () => todo.completed ? "todo-item completed" : "todo-item";
              const checkboxClass = () => todo.completed ? "todo-checkbox checked" : "todo-checkbox";
              return html`
                <li class=${itemClass} transition=${slideTransition()}>
                  <div class="todo-left">
                    <div class=${checkboxClass} onclick=${() => toggleTodo(todo.id)}></div>
                    <span class="todo-text">${todo.text}</span>
                  </div>
                  <button class="todo-delete" onclick=${() => deleteTodo(todo.id)}>
                    <i class="fa-solid fa-trash-can"></i>
                  </button>
                </li>
              `;
            }, todo => todo.id ?? todo.text, { uniqueKeys: true })}
          </ul>
        </div>

        <!-- WebSocket Terminal / Chat -->
        <div class="card">
          <div class="card-title">Real-Time WS Terminal Chat</div>
          <div class="ws-console" style="background: hsla(222, 47%, 8%, 0.8); border: 1px solid var(--border-color); border-radius: 12px; height: 180px; overflow-y: auto; padding: 12px; font-family: var(--font-mono); font-size: 13px; display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px;">
            ${() => chatMessages().length === 0 ? html`<div style="color: var(--text-muted);">No messages. Send a message below to broadcast...</div>` : ""}
            ${mapArray(chatMessages, msg => html`
              <div class="ws-log-line">
                <span style="color: var(--primary); font-weight: bold;">[${msg.timestamp}]</span> 
                <span style="color: var(--success); font-weight: 600;">${msg.user}:</span> ${msg.text}
              </div>
            `, msg => `${msg.timestamp}:${msg.user}:${msg.text}`, { uniqueKeys: true })}
          </div>

          <form onsubmit=${sendChatMessage} class="todo-input-container">
            <input 
              type="text" 
              class="input-field" 
              placeholder="Send message to broadcast..." 
              bind:value=${[chatInput, setChatInput]} 
            />
            <button class="btn" type="submit"><i class="fa-solid fa-paper-plane"></i></button>
          </form>
        </div>
      </div>

      <!-- Why CachouJS -->
      <div class="card code-card" style="margin-top: 24px;">
        <div class="card-title">Simple Reactive DX (No Complex Rules)</div>
        <pre><code><span class="keyword">import</span> { signal, html } <span class="keyword">from</span> <span class="string">"cachoujs"</span>;

<span class="keyword">function</span> <span class="string">Counter</span>() {
  <span class="keyword">const</span> [count, setCount] = signal(<span class="string">0</span>);
  
  <span class="keyword">return</span> html<span class="string">\`
    &lt;button onclick=\${() => setCount(c => c + 1)}&gt;
      Count: \${count}
    &lt;/button&gt;
  \`</span>;
}</code></pre>
      </div>
    </div>
  `;
}

function BenchmarkPage() {
  // Benchmark logic
  const adjectives = ["pretty", "large", "big", "small", "tall", "short", "long", "handsome", "plain", "quaint", "clean", "elegant", "easy", "angry", "crazy", "helpful", "mushy", "odd", "unsightly", "adorable", "important", "inexpensive", "cheap", "expensive", "fancy"];
  const colours = ["red", "yellow", "blue", "green", "pink", "brown", "purple", "brown", "white", "black", "orange"];
  const nouns = ["table", "chair", "house", "car", "bicycle", "airplane", "boat", "train", "computer", "phone", "book", "dog", "cat", "horse", "cow", "bird", "fish", "tree", "flower", "mountain"];
  
  let rowId = 1;
  function buildData(count) {
    const data = [];
    for (let i = 0; i < count; i++) {
      const label = `${adjectives[Math.floor(Math.random() * adjectives.length)]} ${colours[Math.floor(Math.random() * colours.length)]} ${nouns[Math.floor(Math.random() * nouns.length)]}`;
      data.push({ id: rowId++, label });
    }
    return data;
  }

  const runBenchmark = (opName, fn) => {
    const start = performance.now();
    fn();
    const end = performance.now();
    setLastOperation(opName);
    setLastDuration(end - start);
  };

  const create1k = () => {
    runBenchmark("Create 1,000 Rows", () => {
      setBenchmarkRows(buildData(1000));
    });
  };

  const append1k = () => {
    runBenchmark("Append 1,000 Rows", () => {
      setBenchmarkRows(list => [...list, ...buildData(1000)]);
    });
  };

  const update10th = () => {
    runBenchmark("Update Every 10th Row", () => {
      const list = [...benchmarkRows()];
      for (let i = 0; i < list.length; i += 10) {
        list[i] = { ...list[i], label: list[i].label + " !!!" };
      }
      setBenchmarkRows(list);
    });
  };

  const swapRows = () => {
    runBenchmark("Swap 2 Rows", () => {
      const list = [...benchmarkRows()];
      if (list.length > 998) {
        const tmp = list[1];
        list[1] = list[998];
        list[998] = tmp;
        setBenchmarkRows(list);
      }
    });
  };

  const clearAll = () => {
    runBenchmark("Clear Rows", () => {
      setBenchmarkRows([]);
    });
  };

  const selectRow = (id) => {
    // We don't measure selection in benchmark duration since it's instant (fine-grained CSS class change)
    setSelectedRowId(id);
  };

  const deleteRow = (id) => {
    runBenchmark("Delete Row", () => {
      setBenchmarkRows(list => list.filter(r => r.id !== id));
    });
  };

  return html`
    <div class="benchmark-page">
      <header>
        <h1>Reconciliation Benchmark</h1>
        <div class="badge-v">O(N) Double-Ended Diffing</div>
      </header>

      <div class="benchmark-layout">
        <div class="card">
          <div class="card-title">Performance Benchmark Actions</div>
          <div class="btn-group">
            <button class="btn" onclick=${create1k}><i class="fa-solid fa-plus-minus"></i> Create 1,000</button>
            <button class="btn" onclick=${append1k}><i class="fa-solid fa-circle-plus"></i> Append 1,000</button>
            <button class="btn" onclick=${update10th}><i class="fa-solid fa-pen"></i> Update Every 10th</button>
            <button class="btn" onclick=${swapRows}><i class="fa-solid fa-right-left"></i> Swap Rows</button>
            <button class="btn btn-secondary" onclick=${clearAll}><i class="fa-solid fa-circle-xmark"></i> Clear</button>
          </div>
        </div>

        <div class="benchmark-stats">
          <div class="stat-item">
            <span class="stat-label">Operation</span>
            <span class="stat-val" style="color: var(--primary);">${() => lastOperation()}</span>
          </div>
          <div class="stat-item" style="margin-left: auto;">
            <span class="stat-label">DOM Render Time</span>
            <span class="stat-val">${() => lastDuration().toFixed(2)} ms</span>
          </div>
          <div class="stat-item" style="margin-left: 48px;">
            <span class="stat-label">Active Rows</span>
            <span class="stat-val">${() => benchmarkRows().length}</span>
          </div>
        </div>

        <div class="benchmark-table-container">
          <table class="benchmark-table">
            <thead>
              <tr>
                <th class="benchmark-id">ID</th>
                <th>Label</th>
                <th class="benchmark-action-cell">Action</th>
              </tr>
            </thead>
            <tbody>
              ${mapArray(benchmarkRows, row => {
                const rowClass = () => selectedRowId() === row.id ? "selected" : "";
                return html`
                  <tr class=${rowClass}>
                    <td class="benchmark-id">${row.id}</td>
                    <td onclick=${() => selectRow(row.id)} style="cursor: pointer;">${row.label}</td>
                    <td class="benchmark-action-cell">
                      <button class="todo-delete" onclick=${() => deleteRow(row.id)}>
                        <i class="fa-solid fa-trash"></i>
                      </button>
                    </td>
                  </tr>
                `;
              }, row => row.id, { uniqueKeys: true })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

function TestsPage() {
  // Let the DOM mount, then run tests and draw
  setTimeout(() => {
    runTestsAndRender();
  }, 50);

  return html`
    <div class="tests-page">
      <header>
        <h1>Unit Test Suite</h1>
        <div class="badge-v">Full Code Validation</div>
      </header>
      
      <div id="test-results" class="card" style="display: flex; flex-direction: column; gap: 12px; max-height: 70vh; overflow-y: auto;">
        <!-- Test items will be appended here by runTestsAndRender -->
      </div>
    </div>
  `;
}

// --- APP LAYOUT ---

export default function App() {
  return html`
    <div class="app-container">
      ${Sidebar()}
      <main class="main-content">
        ${Router({
          children: [
            Route({ path: "/", component: DashboardPage }),
            Route({ path: "/benchmark", component: BenchmarkPage }),
            Route({ path: "/tests", component: TestsPage })
          ]
        })}
      </main>
    </div>
  `;
}

if (typeof document !== "undefined") {
  const rootElement = document.getElementById("app");
  if (rootElement) {
    if (rootElement.firstElementChild) {
      hydrate(App, rootElement);
    } else {
      render(App, rootElement);
    }
  }
}
