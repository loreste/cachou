/**
 * Runnable CachouJS examples — open /examples/ while `npm run dev` is running.
 */
import {
  signal,
  html,
  mount,
  createResource,
  createForm,
  Router,
  Route,
  Layout,
  Outlet,
  Link,
  navigate,
  getPath,
  NotFound,
  onFrameworkEvent,
  configureSecurityPolicy,
  Show,
  Switch,
  Match,
  mountDevtools,
  installDevtoolsHotkey
} from "cachoujs";

configureSecurityPolicy({ allowInlineStyles: true });

function CounterExample() {
  const [count, setCount] = signal(0);
  return html`
    <section class="card">
      <h2>1. Counter</h2>
      <p>Signals update the DOM binding directly — no VDOM rerender.</p>
      <div class="row">
        <button onclick=${() => setCount(c => c - 1)}>-</button>
        <strong>${() => count()}</strong>
        <button onclick=${() => setCount(c => c + 1)}>+</button>
      </div>
    </section>
  `;
}

function ResourceExample() {
  const [query, setQuery] = signal("cachou");
  const [result, { loading, error, refetch }] = createResource(
    query,
    async (q, { signal: abortSignal }) => {
      await new Promise(r => setTimeout(r, 200));
      if (abortSignal?.aborted) throw new DOMException("Aborted", "AbortError");
      return { q, at: new Date().toISOString(), note: `Fetched for "${q}"` };
    },
    { cancelPrevious: true }
  );

  return html`
    <section class="card">
      <h2>2. Resource list</h2>
      <p>Source-driven <code>createResource</code> with abort of stale requests.</p>
      <div class="row">
        <input
          value=${() => query()}
          oninput=${e => setQuery(e.target.value)}
          placeholder="Search term"
        />
        <button onclick=${() => refetch()}>Refetch</button>
      </div>
      <p>
        ${() => (loading() ? "Loading…" : "")}
        ${() => (error() ? html`<span class="error">${String(error().message || error())}</span>` : "")}
        ${() => {
          const data = result();
          return data ? html`<pre>${JSON.stringify(data, null, 2)}</pre>` : "";
        }}
      </p>
    </section>
  `;
}

function FormsExample() {
  const form = createForm(
    { email: "", name: "" },
    {
      fields: {
        email: {
          validate: v => (!v.includes("@") ? "Enter a valid email" : null)
        },
        name: {
          validate: v => (!String(v).trim() ? "Name is required" : null)
        }
      },
      onSubmit: async values => {
        await new Promise(r => setTimeout(r, 150));
        alert(`Submitted: ${values.name} <${values.email}>`);
      }
    }
  );

  return html`
    <section class="card">
      <h2>3. Forms</h2>
      <form
        onsubmit=${form.handleSubmit()}
        class="row"
        style="flex-direction:column;align-items:stretch"
      >
        <label>
          Name
          <input
            value=${() => form.fields.name.value()}
            oninput=${e => form.fields.name.setValue(e.target.value)}
            onblur=${() => form.fields.name.setTouched(true)}
          />
          ${() =>
            form.fields.name.touched() && form.fields.name.error()
              ? html`<div class="error">${form.fields.name.error()}</div>`
              : ""}
        </label>
        <label>
          Email
          <input
            value=${() => form.fields.email.value()}
            oninput=${e => form.fields.email.setValue(e.target.value)}
            onblur=${() => form.fields.email.setTouched(true)}
          />
          ${() =>
            form.fields.email.touched() && form.fields.email.error()
              ? html`<div class="error">${form.fields.email.error()}</div>`
              : ""}
        </label>
        <button type="submit" disabled=${() => form.submitting()}>
          ${() => (form.submitting() ? "Saving…" : "Submit")}
        </button>
      </form>
    </section>
  `;
}

function NestedShell(props) {
  return html`
    <section class="card">
      <h2>4. Nested routes / layout</h2>
      <p>Path: <code>${() => getPath()}</code></p>
      <div class="row">
        ${Link({ href: "/examples/router", children: "Overview" })}
        ${Link({ href: "/examples/router/settings", children: "Settings" })}
        ${Link({ href: "/examples/router/team/ada", children: "Team: ada" })}
      </div>
      <div style="margin-top:1rem;padding-top:1rem;border-top:1px solid var(--border)">
        ${Outlet()}
      </div>
    </section>
  `;
}

function RouterOverview() {
  return html`<p>Layout shell is stable. Child routes render in <code>Outlet</code>.</p>`;
}

function RouterSettings() {
  return html`<p>Settings child route.</p>`;
}

function RouterTeam(params) {
  return html`<p>Team member: <strong>${params.id || "unknown"}</strong></p>`;
}

function SecurityExample() {
  const [events, setEvents] = signal([]);
  onFrameworkEvent(ev => {
    if (ev.type === "security-block") {
      setEvents(list => [...list.slice(-4), ev.message || "blocked"]);
    }
  });

  // Intentionally blocked protocol for demo
  const badHref = "javascript:alert(1)";

  return html`
    <section class="card">
      <h2>5. Security policy</h2>
      <p>URL attributes are sanitized. Blocked attempts emit framework events.</p>
      <p>
        <a href=${badHref}>This javascript: link is neutralized</a>
      </p>
      <ul class="list">
        ${() => events().map(msg => html`<li><code>${msg}</code></li>`)}
      </ul>
    </section>
  `;
}

function FlowExample() {
  const [on, setOn] = signal(true);
  const [tab, setTab] = signal("one");
  return html`
    <section class="card">
      <h2>6. Show / Switch / Match</h2>
      <div class="row">
        <button type="button" onclick=${() => setOn(v => !v)}>Toggle Show</button>
        <button type="button" onclick=${() => setTab("one")}>Tab one</button>
        <button type="button" onclick=${() => setTab("two")}>Tab two</button>
      </div>
      ${Show({
        when: on,
        fallback: () => html`<p>Hidden</p>`,
        children: () => html`<p>Visible via <code>Show</code></p>`
      })}
      ${Switch({
        fallback: () => html`<p>No tab</p>`,
        children: [
          Match({ when: () => tab() === "one", children: () => html`<p>Branch one</p>` }),
          Match({ when: () => tab() === "two", children: () => html`<p>Branch two</p>` })
        ]
      })}
      <p><button type="button" onclick=${() => mountDevtools()}>Open DevTools panel</button> (or Ctrl+Shift+D)</p>
    </section>
  `;
}

function LoadedUser(params, state) {
  return html`
    <div>
      <p>Param id: <strong>${params.id}</strong></p>
      ${Show({
        when: () => state.loading(),
        children: () => html`<p>Loading user…</p>`
      })}
      ${Show({
        when: () => state.error(),
        children: err => html`<p class="error">${String(err.message || err)}</p>`
      })}
      ${Show({
        when: () => state.data(),
        children: data => html`<pre>${JSON.stringify(data, null, 2)}</pre>`
      })}
    </div>
  `;
}

function Home() {
  return html`
    <div class="shell">
      <h1>CachouJS examples</h1>
      <p>Copy patterns from these pages into your app. Source: <code>examples/</code></p>
      <nav>
        ${Link({ href: "/examples/", children: "Home" })}
        ${Link({ href: "/examples/counter", children: "Counter" })}
        ${Link({ href: "/examples/resource", children: "Resource" })}
        ${Link({ href: "/examples/forms", children: "Forms" })}
        ${Link({ href: "/examples/router", children: "Router" })}
        ${Link({ href: "/examples/security", children: "Security" })}
        ${Link({ href: "/examples/flow", children: "Flow" })}
      </nav>
      ${() => {
        return html`
          <div style="display:grid;gap:1rem">
            ${CounterExample()}
            ${ResourceExample()}
            ${FormsExample()}
            ${SecurityExample()}
            ${FlowExample()}
          </div>
        `;
      }}
    </div>
  `;
}

function ExamplePage(body) {
  return html`
    <div class="shell">
      <nav>
        ${Link({ href: "/examples/", children: "← All examples" })}
      </nav>
      ${body}
    </div>
  `;
}

function App() {
  return html`
    <div>
      ${Router({
        children: [
          Route({ path: "/examples", component: Home }),
          Route({ path: "/examples/", component: Home }),
          Route({ path: "/examples/counter", component: () => ExamplePage(CounterExample()) }),
          Route({ path: "/examples/resource", component: () => ExamplePage(ResourceExample()) }),
          Route({ path: "/examples/forms", component: () => ExamplePage(FormsExample()) }),
          Route({ path: "/examples/security", component: () => ExamplePage(SecurityExample()) }),
          Route({ path: "/examples/flow", component: () => ExamplePage(FlowExample()) }),
          Layout({
            path: "/examples/router",
            component: props => ExamplePage(NestedShell(props)),
            children: [
              Route({ path: "/examples/router", component: RouterOverview }),
              Route({ path: "/examples/router/settings", component: RouterSettings }),
              Route({
                path: "/examples/router/team/:id",
                component: LoadedUser,
                load: async ({ params, signal }) => {
                  await new Promise(r => setTimeout(r, 150));
                  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
                  return { id: params.id, name: `User ${params.id}`, loadedAt: new Date().toISOString() };
                },
                fallback: () => html`<p>Loading team member…</p>`
              })
            ]
          }),
          NotFound({
            component: () =>
              ExamplePage(html`
                <section class="card">
                  <h2>Not found</h2>
                  <button onclick=${() => navigate("/examples/")}>Back home</button>
                </section>
              `)
          })
        ]
      })}
    </div>
  `;
}

installDevtoolsHotkey();
const root = document.getElementById("app");
mount(App, root);
