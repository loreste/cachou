# Plugin System

Cachou's plugin system lets you wrap your app in a structured bootstrap layer — install plugins, register global components, provide values, and set up error handling before anything renders. If you've used a plugin system before, this will feel familiar.

---

## Table of contents

1. [Creating an app](#creating-an-app)
2. [Installing plugins](#installing-plugins)
3. [Providing values](#providing-values)
4. [Global components and directives](#global-components-and-directives)
5. [App configuration](#app-configuration)
6. [Accessing the app with `getApp`](#accessing-the-app-with-getapp)
7. [Writing a plugin: auth example](#writing-a-plugin-auth-example)
8. [Writing a plugin: analytics example](#writing-a-plugin-analytics-example)
9. [Unmounting](#unmounting)

---

## Creating an app

`launch` takes a root component and optional props. It returns an app instance that you configure before mounting.

```javascript
import { launch } from "cachoujs";

function App(props) {
  return html`<h1>${props.title}</h1>`;
}

const app = launch(App, { title: "My SaaS" });
app.mount("#app"); // CSS selector or DOM element
```

`app.mount` calls Cachou's `mount()` under the hood, wrapping the root component in a provider chain for all the values you've registered. Calling it twice without unmounting first logs a warning and does nothing.

---

## Installing plugins

A plugin is either a function or an object with an `install` method. Each plugin is installed at most once.

```javascript
// Function form
app.plug((app, options) => {
  // set up the plugin
}, { someOption: true });

// Object form
const myPlugin = {
  install(app, options) {
    // set up the plugin
  }
};

app.plug(myPlugin, { someOption: true });
```

`app.plug()` returns the app instance, so you can chain:

```javascript
launch(App)
  .plug(authPlugin)
  .plug(analyticsPlugin, { trackingId: "UA-123" })
  .plug(i18nPlugin, { locale: "en" })
  .mount("#app");
```

---

## Providing values

`app.provide` registers a value that any component in the tree can access via `useContext`. This is dependency injection — pass services, configs, or shared state down without prop drilling.

```javascript
import { createContext, useContext } from "cachoujs";

const ApiClient = createContext(null);

const app = launch(App);
app.provide(ApiClient, new ApiService("https://api.example.com"));
app.mount("#app");

// Inside any component:
function UserList() {
  const api = useContext(ApiClient);
  // use api...
}
```

You can also use string keys, but context objects are better because they're type-safe and don't collide.

---

## Global components and directives

Register components and directives by name so they're available everywhere. This is mostly useful for plugins that provide UI primitives.

```javascript
app.component("Icon", IconComponent);
app.directive("tooltip", tooltipDirective);

// Look up a registered component
const Icon = app.component("Icon"); // returns the function
```

---

## App configuration

`app.config` gives you hooks for error and warning handling.

```javascript
app.config.errorHandler = (err, instance, info) => {
  // Send to your error tracking service
  Sentry.captureException(err, { extra: { info } });
};

app.config.warnHandler = (msg, instance, trace) => {
  console.warn(`[App Warning] ${msg}`);
};
```

There's also `app.config.globalProperties` for values merged onto every component's props. Use it sparingly — `provide`/`useContext` is almost always the better choice.

---

## Accessing the app with `getApp`

Inside any component rendered within a `launch` tree, `getApp()` returns the app instance.

```javascript
import { getApp } from "cachoujs";

function Settings() {
  const app = getApp();
  // Access registered components, directives, config, etc.
  const Icon = app.component("Icon");
  // ...
}
```

This is mainly useful for library code that needs to interact with the app's registry. In application code, `useContext` with specific contexts is more explicit.

---

## Writing a plugin: auth example

A real-world auth plugin that manages login state and protects routes.

```javascript
import { createContext, useContext, signal, createResource } from "cachoujs";

const AuthContext = createContext(null);

export function useAuth() {
  return useContext(AuthContext);
}

export const authPlugin = {
  install(app, options = {}) {
    const [user, setUser] = signal(null);
    const [token, setToken] = signal(localStorage.getItem("token"));

    const [profile, { loading, refetch }] = createResource(
      token,
      async (t, { signal }) => {
        if (!t) return null;
        const res = await fetch(`${options.apiUrl}/me`, {
          headers: { Authorization: `Bearer ${t}` },
          signal
        });
        if (!res.ok) throw new Error("Unauthorized");
        return res.json();
      }
    );

    const auth = {
      user: profile,
      loading,
      async login(email, password) {
        const res = await fetch(`${options.apiUrl}/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password })
        });
        if (!res.ok) throw new Error("Login failed");
        const { token: newToken } = await res.json();
        localStorage.setItem("token", newToken);
        setToken(newToken);
      },
      logout() {
        localStorage.removeItem("token");
        setToken(null);
      }
    };

    app.provide(AuthContext, auth);
  }
};

// Usage:
// launch(App).plug(authPlugin, { apiUrl: "https://api.myapp.com" }).mount("#app");
//
// In a component:
// const { user, login, logout, loading } = useAuth();
```

---

## Writing a plugin: analytics example

A plugin that tracks page views and custom events.

```javascript
import { createContext, useContext, beforeNavigate, getPath } from "cachoujs";

const AnalyticsContext = createContext(null);

export function useAnalytics() {
  return useContext(AnalyticsContext);
}

export const analyticsPlugin = {
  install(app, options = {}) {
    const { trackingId, debug = false } = options;

    function track(event, data = {}) {
      if (debug) {
        console.log(`[Analytics] ${event}`, data);
        return;
      }
      // Send to your analytics provider
      navigator.sendBeacon("/analytics", JSON.stringify({
        trackingId,
        event,
        path: getPath(),
        timestamp: Date.now(),
        ...data
      }));
    }

    // Auto-track page views on navigation
    beforeNavigate(({ to, from }) => {
      track("pageview", { path: to, referrer: from });
    });

    const analytics = { track };
    app.provide(AnalyticsContext, analytics);
  }
};

// Usage:
// launch(App).plug(analyticsPlugin, { trackingId: "UA-123" }).mount("#app");
//
// In a component:
// const { track } = useAnalytics();
// track("button_click", { button: "signup" });
```

---

## Unmounting

`app.unmount()` tears down the component tree and runs all cleanup.

```javascript
const app = launch(App);
app.mount("#app");

// Later, when you need to destroy the app
app.unmount();

app.isMounted; // false
```

This is useful for micro-frontend setups where apps mount and unmount as the user navigates between sections.

---

## Next steps

- [Guide](./GUIDE.md) — full framework walkthrough
- [API reference](./API.md) — `launch` and `getApp` signatures
