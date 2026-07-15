import {
  batch,
  createResource,
  effect,
  html,
  memo,
  mount,
  onCleanup,
  scheduleTask,
  signal,
  startTransition
} from "../../src/index.js";
import { chatSocketUrl, fetchAuditExport, fetchBenchmarkHistory, fetchBenchmarkReport, fetchDiagnostics, fetchOpsMetrics, fetchSecurity, fetchWorkspace, getAuthSession, hasPermission, health, login, logout, onUnauthorized, refreshSession, removeRecord, resetDemoData, revokeUserSessions, saveRecord, saveUser, validateStoredSession } from "./api.js";
import ActivityPanel from "./components/ActivityPanel.js";
import BenchmarkClaims from "./components/BenchmarkClaims.js";
import CollaborationLab from "./components/CollaborationLab.js";
import CompaniesPanel from "./components/CompaniesPanel.js";
import CompanyEditor from "./components/CompanyEditor.js";
import ContactEditor from "./components/ContactEditor.js";
import ContactsPanel from "./components/ContactsPanel.js";
import DealEditor from "./components/DealEditor.js";
import HeroTile from "./components/HeroTile.js";
import LiveRoomPanel from "./components/LiveRoomPanel.js";
import LoginPanel from "./components/LoginPanel.js";
import MetricCard from "./components/MetricCard.js";
import OverviewPanel from "./components/OverviewPanel.js";
import PerformanceLab from "./components/PerformanceLab.js";
import PipelineBoard from "./components/PipelineBoard.js";
import PriorityCard from "./components/PriorityCard.js";
import SecurityPanel from "./components/SecurityPanel.js";
import StageTile from "./components/StageTile.js";
import "./styles.css";

const CURRENCY = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const STAGES = ["Lead", "Qualified", "Proposal", "Won", "Lost"];
const STATUS = ["Active", "Nurture", "At risk", "Closed"];
const DEMO_AUTOSIGNIN = import.meta.env.VITE_CRM_DEMO_AUTOSIGNIN || "";

let workspace;
let controls;
let systemHealth;
let securityState;
let securityControls;
let diagnosticsState;
let diagnosticsControls;
let opsMetricsState;
let opsMetricsControls;
let benchmarkState;
let benchmarkHistory;
let activeView;
let setActiveView;
let query;
let setQuery;
let selectedId;
let setSelectedId;
let selectedCompanyId;
let setSelectedCompanyId;
let draft;
let setDraft;
let toast;
let setToast;
let busy;
let setBusy;
let data;
let contacts;
let companies;
let deals;
let activities;
let messages;
let chatMessages;
let setChatMessages;
let chatDraft;
let setChatDraft;
let chatStatus;
let setChatStatus;
let chatSocket;
let role;
let setRole;
let session;
let setSession;
let loginDraft;
let setLoginDraft;
let loginBusy;
let setLoginBusy;
let loginError;
let setLoginError;
let selectedContact;
let selectedCompany;
let companyContacts;
let companyDeals;
let companyActivities;
let visibleContacts;
let pipeline;
let totals;
let ownerLoad;
let hotContacts;
let lastLoadMs;
let setLastLoadMs;
let userDraft;
let setUserDraft;
let auditFilter;
let setAuditFilter;
let filteredAudit;
let collabLog;
let setCollabLog;
let collabRunning;
let setCollabRunning;
let collabState;
let setCollabState;

function setupCRMState() {
  const storedSession = DEMO_AUTOSIGNIN ? null : getAuthSession();
  if (DEMO_AUTOSIGNIN) logout();
  [session, setSession] = signal(null);
  [loginDraft, setLoginDraft] = signal({ username: "manager", password: "manager" });
  [loginBusy, setLoginBusy] = signal(false);
  [loginError, setLoginError] = signal("");
  [role, setRole] = signal("Guest");
  const handleUnauthorized = (err = {}) => {
    batch(() => {
      setSession(null);
      setRole("Guest");
      setDraft(null);
      setChatMessages([]);
      setChatStatus("offline");
      controls?.mutate(null);
      securityControls?.mutate({ users: [], audit: [] });
      diagnosticsControls?.mutate(null);
      opsMetricsControls?.mutate(null);
      showToast(`Session expired${err.requestId ? ` (${err.requestId})` : ""}`);
    });
    if (chatSocket) {
      chatSocket.close();
      chatSocket = null;
    }
  };
  onUnauthorized(handleUnauthorized);

  [workspace, controls] = createResource(context => session() ? fetchWorkspace(context) : Promise.resolve(null), {
    key: "crm-workspace",
    timeoutMs: 8000,
    revalidateOnFocus: false
  });
  [systemHealth] = createResource(health, {
    key: "crm-health",
    timeoutMs: 4000,
    revalidateOnFocus: false
  });
  [securityState, securityControls] = createResource(context => session() ? fetchSecurity(context) : Promise.resolve({ users: [], audit: [] }), {
    key: "crm-security",
    timeoutMs: 5000,
    revalidateOnFocus: false
  });
  [diagnosticsState, diagnosticsControls] = createResource(context => session() ? fetchDiagnostics(context) : Promise.resolve(null), {
    key: "crm-diagnostics",
    timeoutMs: 5000,
    revalidateOnFocus: false
  });
  [opsMetricsState, opsMetricsControls] = createResource(context => session() ? fetchOpsMetrics(context) : Promise.resolve(null), {
    key: "crm-ops-metrics",
    timeoutMs: 5000,
    revalidateOnFocus: false
  });
  [benchmarkState] = createResource(fetchBenchmarkReport, {
    key: "crm-benchmark-report",
    timeoutMs: 3000,
    revalidateOnFocus: false
  });
  [benchmarkHistory] = createResource(fetchBenchmarkHistory, {
    key: "crm-benchmark-history",
    timeoutMs: 3000,
    revalidateOnFocus: false
  });

  [activeView, setActiveView] = signal(viewFromHash());
  [query, setQuery] = signal("");
  [selectedId, setSelectedId] = signal(null);
  [selectedCompanyId, setSelectedCompanyId] = signal(null);
  [draft, setDraft] = signal(null);
  [toast, setToast] = signal("");
  [busy, setBusy] = signal(false);
  [lastLoadMs, setLastLoadMs] = signal("not run");
  [userDraft, setUserDraft] = signal({ username: "", name: "", role: "Sales", password: "" });
  [auditFilter, setAuditFilter] = signal({ actor: "", action: "", role: "" });
  [collabLog, setCollabLog] = signal([]);
  [collabRunning, setCollabRunning] = signal(false);
  [collabState, setCollabState] = signal({ editorA: "idle", editorB: "idle", server: "idle" });
  const [deferredQuery, setDeferredQuery] = signal("");

  effect(() => {
    const value = query();
    const task = scheduleTask(() => setDeferredQuery(value.trim().toLowerCase()), { priority: "background" });
    onCleanup(() => task.cancel());
  });

  effect(() => {
    if (typeof window === "undefined") return;
    const onHashChange = () => setActiveView(viewFromHash());
    window.addEventListener("hashchange", onHashChange);
    onCleanup(() => window.removeEventListener("hashchange", onHashChange));
  });

  effect(() => {
    if (!storedSession) return;
    validateStoredSession().then(next => {
      if (!next) return;
      batch(() => {
        setSession(next);
        setRole(next.user.role);
        controls.refetch();
        securityControls.refetch();
        diagnosticsControls.refetch();
        opsMetricsControls.refetch();
      });
    }).catch(() => {
      batch(() => {
        setSession(null);
        setRole("Guest");
      });
    });
  });

  effect(() => {
    const current = session();
    if (!current?.expiresAt) return;
    const delay = Date.parse(current.expiresAt) - Date.now();
    if (delay <= 0) {
      handleUnauthorized({ requestId: "" });
      return;
    }
    const timer = setTimeout(() => handleUnauthorized({ requestId: "" }), Math.min(delay, 2_147_483_647));
    onCleanup(() => clearTimeout(timer));
  });

  effect(() => {
    const current = session();
    if (!current?.expiresAt) return;
    const msUntilExpiry = Date.parse(current.expiresAt) - Date.now();
    if (msUntilExpiry <= 2_000) return;
    const refreshIn = Math.max(1_000, Math.min(msUntilExpiry - 1_000, msUntilExpiry - 60_000, Math.floor(msUntilExpiry * 0.75)));
    if (refreshIn >= msUntilExpiry) return;
    const timer = setTimeout(() => {
      refreshSession().then(next => {
        if (!next) return;
        batch(() => {
          setSession(next);
          setRole(next.user.role);
        });
      }).catch(err => {
        if (err.status === 401) return;
        showToast(`Session refresh failed${err.requestId ? ` (${err.requestId})` : ""}`);
      });
    }, refreshIn);
    onCleanup(() => clearTimeout(timer));
  });

  effect(() => {
    if (!DEMO_AUTOSIGNIN || session()) return;
    login(DEMO_AUTOSIGNIN, DEMO_AUTOSIGNIN).then(next => {
      batch(() => {
        setSession(next);
        setRole(next.user.role);
        controls.refetch();
        securityControls.refetch();
        diagnosticsControls.refetch();
        opsMetricsControls.refetch();
      });
    }).catch(err => setLoginError(err.message));
  });

  data = memo(() => workspace() || { contacts: [], companies: [], deals: [], activities: [] });
  contacts = memo(() => data().contacts || []);
  companies = memo(() => data().companies || []);
  deals = memo(() => data().deals || []);
  activities = memo(() => data().activities || []);
  messages = memo(() => data().messages || []);
  [chatMessages, setChatMessages] = signal([]);
  [chatDraft, setChatDraft] = signal("");
  [chatStatus, setChatStatus] = signal("connecting");
  selectedContact = memo(() => contacts().find(contact => contact.id === selectedId()) || contacts()[0] || null);
  selectedCompany = memo(() => companies().find(company => company.id === selectedCompanyId()) || companies()[0] || null);
  companyContacts = memo(() => contacts().filter(contact => contact.companyId === selectedCompany()?.id || (!contact.companyId && contact.company === selectedCompany()?.name)));
  companyDeals = memo(() => deals().filter(deal => deal.companyId === selectedCompany()?.id || (!deal.companyId && deal.company === selectedCompany()?.name)));
  companyActivities = memo(() => activities().filter(activity => activity.companyId === selectedCompany()?.id || companyContacts().some(contact => contact.id === activity.contactId)));
  visibleContacts = memo(() => {
    const q = deferredQuery();
    if (!q) return contacts();
    return contacts().filter(contact => [
      contact.name,
      contact.email,
      contact.company,
      contact.owner,
      contact.status
    ].some(value => String(value || "").toLowerCase().includes(q)));
  });

  pipeline = memo(() => STAGES.map(stage => ({
    stage,
    deals: deals().filter(deal => deal.stage === stage)
  })));

  totals = memo(() => {
    const activeDeals = deals().filter(deal => deal.stage !== "Lost");
    const pipelineValue = activeDeals.reduce((sum, deal) => sum + Number(deal.value || 0), 0);
    return {
      contacts: contacts().length,
      companies: companies().length,
      openDeals: activeDeals.length,
      pipelineValue
    };
  });

  ownerLoad = memo(() => {
    const counts = new Map();
    for (const contact of contacts()) {
      const owner = contact.owner || "Unassigned";
      counts.set(owner, (counts.get(owner) || 0) + 1);
    }
    return Array.from(counts, ([owner, count]) => ({ owner, count }))
      .sort((a, b) => b.count - a.count || a.owner.localeCompare(b.owner));
  });

  hotContacts = memo(() => contacts().filter(contact => contact.status === "At risk" || contact.status === "Active").slice(0, 4));
  filteredAudit = memo(() => {
    const security = securityState() || { audit: [] };
    const filter = auditFilter();
    return (security.audit || []).filter(item => {
      const actor = filter.actor.trim().toLowerCase();
      const action = filter.action.trim().toLowerCase();
      return (!actor || String(item.actor || "").toLowerCase().includes(actor))
        && (!action || String(item.action || "").toLowerCase().includes(action))
        && (!filter.role || item.role === filter.role);
    });
  });

  effect(() => {
    if (workspace()) {
      setChatMessages(messages());
    }
  });

  effect(() => {
    if (!session()) return;
    const socket = new WebSocket(chatSocketUrl());
    chatSocket = socket;
    setChatStatus("connecting");
    socket.addEventListener("open", () => setChatStatus("live"));
    socket.addEventListener("close", () => {
      if (chatSocket === socket) setChatStatus("offline");
    });
    socket.addEventListener("error", () => setChatStatus("error"));
    socket.addEventListener("message", event => {
      const payload = JSON.parse(event.data);
      if (payload.type === "snapshot") {
        setChatMessages(payload.messages || []);
      } else if (payload.type === "message" && payload.message) {
        setChatMessages(items => upsert(items, payload.message));
      } else if (payload.type === "deal-updated" && payload.deal) {
        controls.mutate({ ...data(), deals: upsert(deals(), payload.deal) });
      } else if (payload.type === "error") {
        showToast(payload.error || "Realtime error");
      }
    });
    onCleanup(() => {
      if (chatSocket === socket) chatSocket = null;
      socket.close();
    });
  });

  effect(() => {
    if (workspace() && typeof document !== "undefined") {
      document.title = `CACHOU_CRM_READY:${activeView().replace(/\s+/g, "-")}:${contacts().length}:${expectedPanelCount(activeView())}`;
    }
  });

  effect(() => {
    if (!draft() || typeof document === "undefined") return;
    const previousFocus = document.activeElement;
    const focusableSelector = "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])";
    const task = scheduleTask(() => {
      const modal = document.querySelector(".modal");
      const first = modal?.querySelector(focusableSelector);
      if (first) first.focus();
    }, { priority: "user-blocking" });
    const onKeyDown = event => {
      const modal = document.querySelector(".modal");
      if (!modal) return;
      if (event.key === "Escape") {
        event.preventDefault();
        closeDraft();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(modal.querySelectorAll(focusableSelector)).filter(item => !item.disabled && item.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    onCleanup(() => {
      task.cancel();
      document.removeEventListener("keydown", onKeyDown);
      if (previousFocus?.focus) previousFocus.focus();
    });
  });
}

function expectedPanelCount(view) {
  if (view === "overview") return 4;
  if (view === "pipeline") return 3;
  if (view === "live room") return 3;
  if (view === "contacts") return 3;
  if (view === "companies") return 3;
  if (view === "security") return 2;
  if (view === "performance lab") return 2;
  if (view === "benchmarks") return 2;
  if (view === "collaboration lab") return 2;
  return 2;
}

async function signIn(event) {
  event.preventDefault();
  setLoginBusy(true);
  setLoginError("");
  try {
    const next = await login(loginDraft().username, loginDraft().password);
    batch(() => {
      setSession(next);
      setRole(next.user.role);
      controls.refetch();
      securityControls.refetch();
      diagnosticsControls.refetch();
      opsMetricsControls.refetch();
      showToast(`Signed in as ${next.user.name}`);
    });
  } catch (err) {
    setLoginError(err.message);
  } finally {
    setLoginBusy(false);
  }
}

async function signOut() {
  await logout();
  batch(() => {
    setSession(null);
    setRole("Guest");
    setChatMessages([]);
  });
}

function databaseMode() {
  const mode = systemHealth()?.mode || "connecting";
  if (mode.startsWith("faydb:")) {
    return "FayDB live";
  }
  if (mode.startsWith("memory")) {
    return "Demo memory";
  }
  return mode;
}

function nextId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function loadStressContacts() {
  const started = performance.now();
  const owners = ["Sales", "Manager", "Admin", "Platform"];
  const statuses = ["Active", "Nurture", "At risk"];
  const generated = Array.from({ length: 5000 }, (_, index) => {
    const company = companies()[index % Math.max(1, companies().length)] || null;
    return {
    id: `stress_${index}`,
    name: `Demo Contact ${index + 1}`,
    email: `demo${index + 1}@load.test`,
    phone: `555-${String(index).padStart(4, "0")}`,
    companyId: company?.id || "",
    company: company?.name || "Demo Co",
    status: statuses[index % statuses.length],
    owner: owners[index % owners.length],
    notes: "Generated for Cachou scheduler and list rendering demo.",
    updatedAt: new Date().toISOString()
  }; });
  startTransition(() => {
    controls.mutate({ ...data(), contacts: generated });
    setLastLoadMs(`${Math.round(performance.now() - started)}ms`);
    showToast("Loaded 5,000 demo contacts locally");
  });
}

function measureRouteChurn() {
  const started = performance.now();
  const views = ["overview", "contacts", "companies", "pipeline", "activities", "security", "performance lab", "benchmarks", "collaboration lab"];
  for (let index = 0; index < 40; index++) {
    setActiveView(views[index % views.length]);
  }
  setLastLoadMs(`${Math.round(performance.now() - started)}ms`);
  showToast("Route churn measured");
}

function showToast(message) {
  setToast(message);
  setTimeout(() => {
    if (toast() === message) setToast("");
  }, 2600);
}

function closeDraft() {
  setDraft(null);
}

function beginContact(contact = null) {
  if (!canWriteContacts()) {
    showToast("Your role cannot edit contacts");
    return;
  }
  setDraft(contact ? { ...contact } : {
    id: nextId("contact"),
    name: "",
    email: "",
    phone: "",
    companyId: companies()[0]?.id || "",
    company: companies()[0]?.name || "",
    status: "Active",
    owner: "Sales",
    notes: ""
  });
}

function beginContactForCompany(company) {
  if (!canWriteContacts()) {
    showToast("Your role cannot edit contacts");
    return;
  }
  setDraft({
    id: nextId("contact"),
    name: "",
    email: "",
    phone: "",
    companyId: company.id,
    company: company.name,
    status: "Active",
    owner: company.owner || "Sales",
    notes: `New contact for ${company.name}`
  });
}

function beginCompany(company = null) {
  if (!can("companies:write")) {
    showToast("Your role cannot edit companies");
    return;
  }
  setDraft(company ? { ...company, kind: "companies" } : {
    kind: "companies",
    id: nextId("company"),
    name: "",
    segment: "Growth",
    owner: role() || "Sales"
  });
}

async function persistDraft(event) {
  event.preventDefault();
  const company = companies().find(item => item.id === draft().companyId || item.name === draft().company);
  const next = {
    ...draft(),
    companyId: company?.id || draft().companyId || "",
    company: company?.name || draft().company || "",
    updatedAt: new Date().toISOString()
  };
  if (!next.name.trim()) {
    showToast("Name is required");
    return;
  }
  setBusy(true);
  const previous = data();
  controls.mutate({
    ...previous,
    contacts: upsert(previous.contacts, next)
  });
  try {
    await saveRecord("contacts", next);
    batch(() => {
      setSelectedId(next.id);
      setDraft(null);
      showToast("Contact saved");
    });
  } catch (err) {
    controls.mutate(previous);
    showToast(err.message);
  } finally {
    setBusy(false);
  }
}

async function deleteSelected() {
  if (!canDeleteContacts()) {
    showToast("Admin permission required to delete contacts");
    return;
  }
  const contact = selectedContact();
  if (!contact) return;
  const previous = data();
  controls.mutate({
    ...previous,
    contacts: previous.contacts.filter(item => item.id !== contact.id)
  });
  try {
    await removeRecord("contacts", contact.id);
    setSelectedId(null);
    showToast("Contact deleted");
  } catch (err) {
    controls.mutate(previous);
    showToast(err.message);
  }
}

async function moveDeal(dealId, stage) {
  if (!canMoveDeals()) {
    showToast("Switch to Manager or Admin to move deals");
    return;
  }
  const deal = deals().find(item => item.id === dealId);
  if (!deal || deal.stage === stage) return;
  const previous = data();
  const next = { ...deal, stage, updatedAt: new Date().toISOString() };
  controls.mutate({
    ...previous,
    deals: upsert(previous.deals, next)
  });
  try {
    const saved = await saveRecord("deals", next);
    controls.mutate({ ...data(), deals: upsert(deals(), saved) });
    showToast(`Moved to ${stage}`);
  } catch (err) {
    if (err.status === 409 && err.current) {
      controls.mutate({ ...previous, deals: upsert(previous.deals, err.current) });
      showToast("Conflict resolved from server version");
    } else {
      controls.mutate(previous);
      showToast(err.message);
    }
  }
}

function canMoveDeals() {
  return can("deals:write");
}

function canWriteContacts() {
  return can("contacts:write");
}

function canDeleteContacts() {
  return can("contacts:delete");
}

function can(permission) {
  return hasPermission(permission);
}

function allowDrop(event) {
  event.preventDefault();
  event.currentTarget.classList.add("drop-ready");
}

function clearDrop(event) {
  event.currentTarget.classList.remove("drop-ready");
}

function dragDeal(event, dealId) {
  if (!canMoveDeals()) {
    event.preventDefault();
    showToast("Switch to Manager or Admin to drag deals");
    return;
  }
  event.dataTransfer.setData("text/plain", dealId);
  event.dataTransfer.effectAllowed = "move";
}

function dropDeal(event, stage) {
  event.preventDefault();
  clearDrop(event);
  const dealId = event.dataTransfer.getData("text/plain");
  moveDeal(dealId, stage);
}

function nextStage(stage) {
  const index = STAGES.indexOf(stage);
  return STAGES[Math.min(STAGES.length - 1, index + 1)];
}

function upsert(items, next) {
  const index = items.findIndex(item => item.id === next.id);
  if (index === -1) return [next, ...items];
  return items.map(item => item.id === next.id ? next : item);
}

function switchView(view) {
  startTransition(() => {
    setActiveView(view);
    setDraft(null);
    if (view === "security") {
      securityControls.refetch();
      diagnosticsControls.refetch();
    }
    if (typeof history !== "undefined") {
      history.replaceState(null, "", `#${view.replace(/\s+/g, "-")}`);
    }
  });
}

function viewFromHash() {
  if (typeof location === "undefined") return "overview";
  const view = location.hash.slice(1).replace(/-/g, " ");
  return ["overview", "contacts", "companies", "pipeline", "activities", "live room", "security", "performance lab", "benchmarks", "collaboration lab"].includes(view) ? view : "overview";
}

function sendChat(event) {
  event.preventDefault();
  const text = chatDraft().trim();
  if (!text) return;
  if (!chatSocket || chatSocket.readyState !== WebSocket.OPEN) {
    showToast("Realtime room is not connected");
    return;
  }
  chatSocket.send(JSON.stringify({ author: "Demo user", text }));
  setChatDraft("");
}

function App() {
  setupCRMState();
  if (!session()) return LoginView();
  return html`<main class="shell">
    <aside class="sidebar">
      <div class="brand">
        <span class="mark">C</span>
        <div>
          <strong>Cachou CRM</strong>
          <small>${() => databaseMode()}</small>
        </div>
      </div>
      <nav>
        ${["overview", "contacts", "companies", "pipeline", "activities", "live room", "security", "performance lab", "benchmarks", "collaboration lab"].map(view => html`<button
          class=${() => activeView() === view ? "active" : ""}
          onclick=${() => switchView(view)}
        >${view}</button>`)}
      </nav>
      <button class="ghost" onclick=${() => controls.refetch()}>Refresh</button>
    </aside>

    <section class="workspace">
      <header class="topbar">
        <div>
          <h1>${() => pageTitle()}</h1>
          <p>${() => workspace() ? "Live CRM workspace backed by the API adapter." : "Loading workspace."}</p>
        </div>
        <div class="actions">
          <span class="session-pill">${() => session()?.user?.name || role()}</span>
          <input
            aria-label="Search contacts"
            placeholder="Search contacts"
            value=${query}
            oninput=${event => setQuery(event.target.value)}
          />
          <button onclick=${() => beginContact()}>New contact</button>
          <button class="ghost" onclick=${() => beginDeal()}>New deal</button>
          <button class="ghost" onclick=${loadStressContacts}>Load 5,000</button>
          <button class="ghost" onclick=${signOut}>Sign out</button>
        </div>
      </header>

      <section class="hero-strip">
        ${() => HeroTile({ label: "Database", value: databaseMode() })}
        ${() => HeroTile({ label: "Session", value: `${role()} view` })}
        ${() => HeroTile({ label: "Realtime", value: `${chatStatus()} - ${chatMessages().length} messages` })}
      </section>
      ${() => !canMoveDeals() && activeView() === "pipeline" ? html`<section class="permission-note">Read-only pipeline for ${role()} role.</section>` : null}

      <section class="metrics">
        ${() => MetricCard({ label: "Contacts", value: totals().contacts })}
        ${() => MetricCard({ label: "Companies", value: totals().companies })}
        ${() => MetricCard({ label: "Open deals", value: totals().openDeals })}
        ${() => MetricCard({ label: "Pipeline", value: CURRENCY.format(totals().pipelineValue) })}
      </section>

      ${() => !workspace() ? html`<section class="empty">Loading CRM data...</section>` : viewPanel()}
      ${() => controls.error() ? html`<section class="error">${controls.error().message}</section>` : null}
      ${() => draft() ? editor() : null}
      ${() => toast() ? html`<div class="toast">${toast}</div>` : null}
    </section>
  </main>`;
}

function LoginView() {
  const current = loginDraft();
  return html`<main class="login-shell">
    ${() => LoginPanel({
      current,
      signIn,
      loginDraft,
      setLoginDraft,
      loginBusy,
      loginError,
      systemMode: () => databaseMode(),
      systemOnline: () => Boolean(systemHealth()?.ok),
      accounts: ["sales", "manager", "admin"]
    })}
  </main>`;
}

function pageTitle() {
  if (activeView() === "overview") return "Revenue Command Center";
  if (activeView() === "contacts") return "Contacts";
  if (activeView() === "companies") return "Companies";
  if (activeView() === "pipeline") return "Pipeline";
  if (activeView() === "live room") return "Live Room";
  if (activeView() === "security") return "Security Center";
  if (activeView() === "performance lab") return "Performance Lab";
  if (activeView() === "benchmarks") return "Benchmark Claims";
  if (activeView() === "collaboration lab") return "Collaboration Lab";
  return "Activities";
}

function viewPanel() {
  if (activeView() === "overview") return Overview();
  if (activeView() === "pipeline") return Pipeline();
  if (activeView() === "companies") return Companies();
  if (activeView() === "activities") return Activities();
  if (activeView() === "live room") return LiveRoom();
  if (activeView() === "security") return Security();
  if (activeView() === "performance lab") return PerfLab();
  if (activeView() === "benchmarks") return Benchmarks();
  if (activeView() === "collaboration lab") return Collab();
  return Contacts();
}

function Overview() {
  return OverviewPanel({
    hotContacts,
    ownerLoad,
    pipeline,
    PriorityCard,
    StageTile,
    ownerBarStyle: item => `width:${Math.max(12, item.count * 28)}%`,
    openContacts: () => switchView("contacts"),
    openPipeline: () => switchView("pipeline"),
    selectContact: contact => {
      setSelectedId(contact.id);
      switchView("contacts");
    }
  });
}

function Contacts() {
  return ContactsPanel({
    visibleContacts,
    selectedContact,
    setSelectedId,
    renderDetail: contactDetail
  });
}

function Companies() {
  return CompaniesPanel({
    companies,
    selectedCompany,
    setSelectedCompanyId,
    renderDetail: companyDetail
  });
}

function companyDetail(company) {
  return html`<div>
    <div class="detail-head">
      <div>
        <h2>${company.name}</h2>
        <p>${company.segment} owned by ${company.owner}</p>
      </div>
      <span>${companyContacts().length} contacts</span>
    </div>
    <div class="button-row">
      <button disabled=${() => !can("companies:write")} onclick=${() => beginCompany(company)}>Edit company</button>
      <button class="ghost" disabled=${() => !canWriteContacts()} onclick=${() => beginContactForCompany(company)}>New contact</button>
      <button class="ghost" disabled=${() => !canMoveDeals()} onclick=${() => beginDealForCompany(company)}>New deal</button>
    </div>
    <div class="relationship-grid">
      <article>
        <strong>Contacts</strong>
        <ul>${companyContacts().map(item => html`<li>${item.name}<p>${item.status}</p></li>`)}</ul>
      </article>
      <article>
        <strong>Deals</strong>
        <ul>${companyDeals().map(item => html`<li>${item.name}<p>${CURRENCY.format(Number(item.value || 0))} - ${item.stage}</p></li>`)}</ul>
      </article>
      <article>
        <strong>Activities</strong>
        <ul>${companyActivities().map(item => html`<li>${item.title}<p>${item.due}</p></li>`)}</ul>
      </article>
    </div>
  </div>`;
}

function contactDetail(contact) {
  return html`<div>
    <div class="detail-head">
      <div>
        <h2>${contact.name}</h2>
        <p>${contact.company}</p>
      </div>
      <span>${contact.status}</span>
    </div>
    <dl>
      <div><dt>Email</dt><dd>${contact.email || "Not set"}</dd></div>
      <div><dt>Phone</dt><dd>${contact.phone || "Not set"}</dd></div>
      <div><dt>Owner</dt><dd>${contact.owner || "Unassigned"}</dd></div>
      <div><dt>Notes</dt><dd>${contact.notes || "No notes yet"}</dd></div>
    </dl>
    <div class="button-row">
      <button disabled=${() => !canWriteContacts()} onclick=${() => beginContact(contact)}>Edit</button>
      <button class="danger" disabled=${() => !canDeleteContacts()} onclick=${deleteSelected}>Delete</button>
    </div>
  </div>`;
}

function Pipeline() {
  return PipelineBoard({
    pipeline,
    allowDrop,
    clearDrop,
    dropDeal,
    dragDeal,
    formatCurrency: value => CURRENCY.format(value),
    canMoveDeals,
    moveDeal,
    nextStage,
    keyboardDeal,
    editDeal: beginDeal
  });
}

function Activities() {
  return ActivityPanel({
    activities,
    completeActivity
  });
}

function LiveRoom() {
  return LiveRoomPanel({
    chatStatus,
    chatMessages,
    chatDraft,
    setChatDraft,
    sendChat
  });
}

function Security() {
  const security = securityState() || { users: [], audit: [] };
  return SecurityPanel({
    users: security.users || [],
    audit: filteredAudit,
    auditFilter,
    setAuditFilter,
    exportAudit,
    auditTitle,
    auditDescription,
    diagnostics: diagnosticsState(),
    opsMetrics: opsMetricsState(),
    userDraft,
    setUserDraft,
    saveUser: createUser,
    resetDemo: resetWorkspace,
    editUser: user => setUserDraft({ id: user.id, username: user.username, name: user.name, role: user.role, disabled: user.disabled, password: "" }),
    toggleUser,
    revokeSessions,
    canAdmin: () => can("users:write"),
    formatRows: diagnostics => JSON.stringify(diagnostics?.rowCounts || {}),
    formatTyped: diagnostics => JSON.stringify(diagnostics?.typedCounts || {}),
    formatOpsRoutes: metrics => JSON.stringify(metrics?.byRoute || {})
  });
}

function auditTitle(item) {
  const labels = {
    "auth.login": "Signed in",
    "auth.logout": "Signed out",
    "auth.refresh": "Session refreshed",
    "rbac.denied": "Permission blocked",
    "admin.reset": "Demo data reset",
    "users.write": "User updated",
    "users.delete": "User deleted",
    "users.sessions.revoke": "Sessions revoked",
    "messages.websocket": "Chat message sent"
  };
  return labels[item.action] || item.action.replace(/\./g, " ");
}

function auditDescription(item) {
  const details = item.details || {};
  if (item.action === "rbac.denied") return `${item.actor} tried ${details.permission || "a restricted action"} on ${details.kind || "CRM data"}.`;
  if (item.action === "users.write") return `Role ${details.role || "unknown"}${details.disabled ? ", disabled" : ""}.`;
  if (item.action === "users.sessions.revoke") return `${details.revoked || 0} sessions revoked.`;
  if (details.id) return `Record ${details.id}.`;
  if (details.username) return `Account ${details.username}.`;
  return "No additional details.";
}

async function exportAudit() {
  let payload;
  try {
    payload = await fetchAuditExport();
  } catch (err) {
    payload = {
      exportedAt: new Date().toISOString(),
      actor: session()?.user?.username || "local",
      warning: err.message,
      audit: filteredAudit()
    };
  }
  const content = JSON.stringify(payload, null, 2);
  const blob = new Blob([content], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `cachou-crm-audit-${Date.now()}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function Collab() {
  const state = collabState();
  return CollaborationLab({
    editorA: state.editorA,
    editorB: state.editorB,
    serverState: state.server,
    log: collabLog,
    running: collabRunning,
    runLab: runCollaborationLab
  });
}

function PerfLab() {
  return PerformanceLab({
    contactsCount: totals().contacts,
    stageCount: pipeline().length,
    messageCount: chatMessages().length,
    lastLoadMs,
    loadStressContacts,
    measureRouteChurn
  });
}

function Benchmarks() {
  const report = benchmarkState() || { summary: [] };
  const history = benchmarkHistory() || [];
  const byScenario = new Map();
  for (const item of report.summary || []) {
    if (!byScenario.has(item.scenario)) byScenario.set(item.scenario, []);
    byScenario.get(item.scenario).push(item);
  }
  const liveClaims = Array.from(byScenario, ([scenario, items]) => {
    const ranked = items.filter(item => Number.isFinite(item.duration)).sort((a, b) => a.duration - b.duration);
    const cachou = ranked.find(item => item.adapter === "CachouJS");
    return {
      category: scenario,
      rank: cachou ? `#${ranked.indexOf(cachou) + 1}/${ranked.length}` : "pending",
      title: cachou ? `${cachou.duration.toFixed(2)}ms median` : "Run npm run crm:bench:report",
      note: cachou?.stats ? `p95 ${cachou.stats.p95.toFixed(2)}ms across ${cachou.stats.samples} samples.` : "No benchmark artifact has been generated yet."
    };
  });
  return BenchmarkClaims({
    historySummary: history.length ? `${history.length} saved benchmark runs` : "No saved history yet",
    historyNote: benchmarkHistoryNote(history),
    trends: benchmarkTrendCards(history),
    claims: liveClaims.length ? liveClaims : [
      { category: "DOM fanout", rank: "#1 target", title: "Fine-grained updates", note: "The benchmark suite tracks text fanout, keyed reverse, and attribute fanout against React, Vue, Solid, Svelte, and Preact." },
      { category: "Developer path", rank: "npm-first", title: "No Go commands required", note: "The compiler and demo checks run behind npm scripts so JavaScript developers stay in familiar tooling." },
      { category: "Runtime safety", rank: "guarded", title: "Leaks and races watched", note: "Stress checks cover repeated fetches, cleanup behavior, WebSocket auth, optimistic conflict recovery, and route churn." }
    ]
  });
}

function benchmarkTrendCards(history) {
  if (history.length < 1) return [];
  const latest = history[history.length - 1];
  const previous = history.length > 1 ? history[history.length - 2] : null;
  return (latest.scenarios || []).map(item => {
    const prior = previous?.scenarios?.find(candidate => candidate.scenario === item.scenario);
    const rankDelta = prior ? prior.rank - item.rank : 0;
    const p95Delta = prior && Number.isFinite(item.p95) && Number.isFinite(prior.p95) ? item.p95 - prior.p95 : null;
    return {
      scenario: item.scenario,
      rank: `#${item.rank}/${item.total}`,
      movement: prior ? (rankDelta > 0 ? `up ${rankDelta}` : rankDelta < 0 ? `down ${Math.abs(rankDelta)}` : "held") : "first run",
      p95: Number.isFinite(item.p95) ? `${item.p95.toFixed(2)}ms p95` : "p95 pending",
      p95Delta: p95Delta === null ? "no prior p95" : `${p95Delta >= 0 ? "+" : ""}${p95Delta.toFixed(2)}ms vs previous`
    };
  });
}

function benchmarkHistoryNote(history) {
  if (history.length < 2) return "Run npm run crm:bench:report more than once to show rank movement.";
  const previous = history[history.length - 2];
  const latest = history[history.length - 1];
  const latestText = latest.scenarios?.map(item => `${item.scenario}: #${item.rank}/${item.total}`).join(" | ") || "No scenarios";
  const priorText = previous.generatedAt ? `Previous run ${new Date(previous.generatedAt).toLocaleString()}.` : "";
  return `${priorText} Latest ranks: ${latestText}`;
}

function beginDeal(deal = null) {
  if (!canMoveDeals()) {
    showToast("Switch to Manager or Admin to edit deals");
    return;
  }
  setDraft(deal ? { ...deal, kind: "deals" } : {
    kind: "deals",
    id: nextId("deal"),
    name: "",
    companyId: companies()[0]?.id || "",
    company: companies()[0]?.name || "",
    contactIds: selectedContact()?.id ? [selectedContact().id] : [],
    value: 0,
    stage: "Lead"
  });
}

function beginDealForCompany(company) {
  if (!canMoveDeals()) {
    showToast("Switch to Manager or Admin to edit deals");
    return;
  }
  const firstContact = contacts().find(contact => contact.companyId === company.id || contact.company === company.name);
  setDraft({
    kind: "deals",
    id: nextId("deal"),
    name: "",
    companyId: company.id,
    company: company.name,
    contactIds: firstContact ? [firstContact.id] : [],
    value: 0,
    stage: "Lead"
  });
}

function keyboardDeal(event, deal) {
  if (!["ArrowRight", "ArrowLeft", "Enter", " "].includes(event.key)) return;
  if (!canMoveDeals()) return;
  event.preventDefault();
  const index = STAGES.indexOf(deal.stage);
  if (event.key === "ArrowLeft" && index > 0) {
    moveDeal(deal.id, STAGES[index - 1]);
  } else if ((event.key === "ArrowRight" || event.key === "Enter" || event.key === " ") && index < STAGES.length - 1) {
    moveDeal(deal.id, STAGES[index + 1]);
  }
}

async function completeActivity(activity) {
  if (!can("activities:write")) {
    showToast("Admin permission required to complete activities");
    return;
  }
  const next = { ...activity, due: "Done" };
  const previous = data();
  controls.mutate({ ...previous, activities: upsert(previous.activities, next) });
  try {
    await saveRecord("activities", next);
    showToast("Activity completed");
  } catch (err) {
    controls.mutate(previous);
    showToast(err.message);
  }
}

async function createUser(event) {
  event.preventDefault();
  try {
    await saveUser(userDraft());
    setUserDraft({ username: "", name: "", role: "Sales", password: "" });
    securityControls.refetch();
    showToast("User saved");
  } catch (err) {
    showToast(err.message);
  }
}

async function toggleUser(user) {
  try {
    await saveUser({ ...user, disabled: !user.disabled, password: undefined });
    securityControls.refetch();
    showToast(user.disabled ? "User enabled" : "User disabled");
  } catch (err) {
    showToast(err.message);
  }
}

async function revokeSessions(user) {
  try {
    const result = await revokeUserSessions(user.id);
    securityControls.refetch();
    showToast(`Revoked ${result.revoked} sessions`);
  } catch (err) {
    showToast(err.message);
  }
}

async function resetWorkspace() {
  try {
    await resetDemoData();
    await controls.refetch();
    await securityControls.refetch();
    await diagnosticsControls.refetch();
    await opsMetricsControls.refetch();
    showToast("Demo data reset");
  } catch (err) {
    showToast(err.message);
  }
}

async function runCollaborationLab() {
  if (!canMoveDeals()) {
    showToast("Switch to Manager or Admin to run the collaboration lab");
    return;
  }
  setCollabRunning(true);
  setCollabLog([]);
  const push = (title, detail) => setCollabLog(items => [...items, { title, detail }]);
  try {
    const base = await saveRecord("deals", {
      id: nextId("collab_deal"),
      name: "Concurrent pricing review",
      companyId: "company_izitech",
      company: "Izitechnologies",
      contactIds: ["contact_rina"],
      value: 42000,
      stage: "Qualified"
    });
    setCollabState({ editorA: `loaded v${base.version}`, editorB: `loaded v${base.version}`, server: `v${base.version} ${base.stage}` });
    push("Both editors load the same deal", `A and B both hold server version ${base.version}.`);

    const savedA = await saveRecord("deals", { ...base, stage: "Proposal" });
    setCollabState({ editorA: `saved v${savedA.version}`, editorB: `still v${base.version}`, server: `v${savedA.version} ${savedA.stage}` });
    push("Editor A saves first", `Server accepts Proposal and increments to version ${savedA.version}.`);

    try {
      await saveRecord("deals", { ...base, stage: "Won" });
    } catch (err) {
      setCollabState({ editorA: `saved v${savedA.version}`, editorB: `conflict ${err.status}`, server: `v${err.current?.version || savedA.version} ${err.current?.stage || savedA.stage}` });
      push("Editor B is rejected", `Stale version ${base.version} returned ${err.status}; server sent ${err.current?.stage || "current state"}.`);
    }
    await controls.refetch();
    push("UI recovers from server truth", "The CRM refreshes from the API and keeps the accepted server version.");
  } catch (err) {
    push("Lab failed", err.message);
  } finally {
    setCollabRunning(false);
  }
}

function editor() {
  const current = draft();
  if (current.kind === "companies") {
    return CompanyEditor({
      current,
      draft,
      setDraft,
      persistCompany,
      busy,
      close: closeDraft
    });
  }
  if (current.kind === "deals") {
    return DealEditor({
      current,
      draft,
      setDraft,
      persistDeal,
      busy,
      stages: STAGES,
      close: closeDraft
    });
  }
  return ContactEditor({
    current,
    draft,
    setDraft,
    persistDraft,
    busy,
    statuses: STATUS,
    close: closeDraft
  });
}

async function persistCompany(event) {
  event.preventDefault();
  const next = { ...draft() };
  delete next.kind;
  if (!next.name.trim()) {
    showToast("Company name is required");
    return;
  }
  setBusy(true);
  const previous = data();
  controls.mutate({ ...previous, companies: upsert(previous.companies, next) });
  try {
    const saved = await saveRecord("companies", next);
    batch(() => {
      controls.mutate({ ...data(), companies: upsert(companies(), saved) });
      setSelectedCompanyId(saved.id);
      closeDraft();
      showToast("Company saved");
    });
  } catch (err) {
    controls.mutate(previous);
    showToast(err.message);
  } finally {
    setBusy(false);
  }
}

async function persistDeal(event) {
  event.preventDefault();
  const company = companies().find(item => item.id === draft().companyId || item.name === draft().company);
  const next = {
    ...draft(),
    companyId: company?.id || draft().companyId || "",
    company: company?.name || draft().company || ""
  };
  delete next.kind;
  if (!next.name.trim()) {
    showToast("Deal name is required");
    return;
  }
  setBusy(true);
  const previous = data();
  controls.mutate({ ...previous, deals: upsert(previous.deals, next) });
  try {
    const saved = await saveRecord("deals", next);
    batch(() => {
      controls.mutate({ ...data(), deals: upsert(deals(), saved) });
      setDraft(null);
      showToast("Deal saved");
    });
  } catch (err) {
    controls.mutate(previous);
    showToast(err.message);
  } finally {
    setBusy(false);
  }
}

mount(App, document.getElementById("app"));
