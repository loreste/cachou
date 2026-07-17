# Enable Debug Diagnostics

Debug mode is **opt-in**. Use it locally (and in tests) to inspect the reactive graph, catch ownership mistakes, and listen to framework events.

Related: [Prevent leaks](./prevent-leaks-and-races.md), [API: Diagnostics](../API.md#diagnostics).

---

## Enable / disable

```javascript
import { enableDebug, disableDebug } from "cachoujs";

enableDebug({
  slowEffectThresholdMs: 8,
  strict: true
});

// …
disableDebug();
```

| Option | Meaning |
|--------|---------|
| `slowEffectThresholdMs` | Warn when an effect run exceeds this duration |
| `strict` | Warn/throw on patterns like cleanup outside an owner |

Debug mode records bookkeeping; keep it off in production builds unless diagnosing a specific issue.

---

## Snapshots

```javascript
import { getDebugSnapshot } from "cachoujs";

console.table(getDebugSnapshot());
```

Typical fields:

| Field | Meaning |
|-------|---------|
| `enabled` / `strict` | Flags |
| `signals` | Tracked signal count |
| `computations` / `liveComputations` | Effects/memos |
| `roots` / `liveRoots` | Ownership roots |
| `disposedComputations` / `disposedRoots` | Already disposed |
| `orphanComputations` | Live computations without an owner |

---

## Assert no leaks (tests)

```javascript
import { mount, assertNoReactiveLeaks, resetDebugState, enableDebug } from "cachoujs";

enableDebug({ strict: true });
resetDebugState();

const dispose = mount(App, root);
dispose();

assertNoReactiveLeaks("after unmount");
```

Fails if live roots or orphan computations remain. Call `resetDebugState()` between cases when needed.

---

## Framework events

```javascript
import { onFrameworkEvent, emitFrameworkEvent } from "cachoujs";

const stop = onFrameworkEvent(event => {
  console.log(event.type, event);
  // security-block, resource-error, resource-stale-response,
  // slow-effect, reactive-leak, debug-warning, error, …
});

emitFrameworkEvent({ type: "app-custom", detail: { route: "/x" } });

stop();
```

Use this for observability bridges (analytics, logging sinks) without hard-wiring the framework to your vendor SDK.

---

## Structured logger (0.4.5)

Logging is **silent by default** and never throws into application code.

```javascript
import { configureLogger, createLogger } from "cachoujs";

configureLogger({
  level: "debug", // silent | error | warn | info | debug | trace
  // sink: entry => myLogger.write(entry) // optional custom sink
});

const log = createLogger("checkout");
log.info("payment started", { orderId: "o-1" });
log.error("payment failed", { orderId: "o-1", code: "card_declined" });
```

Framework stages (SSR, resources, navigation, hydration) emit through the same
pipeline when the log level allows them.

---

## Tracing (0.4.5)

W3C `traceparent` spans are **disabled by default**. Bridge to your OpenTelemetry
SDK or APM; Cachou does not bundle an exporter.

```javascript
import { configureTracing, startSpan, runWithSpan } from "cachoujs";

configureTracing({
  enabled: true,
  sampleRate: 0.2,
  exporter: span => {
    // span: { name, traceId, spanId, durationMs, attributes, events, status, … }
    otelExport(span);
  }
});

const span = startSpan("checkout.submit", { attributes: { "order.id": orderId } });
try {
  runWithSpan(span, () => submitOrder());
  span.setStatus({ code: "OK" });
} catch (err) {
  span.recordException(err);
  span.setStatus({ code: "ERROR", message: err.message });
  throw err;
} finally {
  span.end();
}
```

For SSR, pass the incoming header so concurrent requests keep separate traces:

```javascript
await renderToStringAsync(App, {
  path: req.url,
  request: req,
  traceparent: req.headers.get?.("traceparent") || req.headers.traceparent
});
```

Sensitive attribute keys (tokens, cookies, passwords, authorization, …) are redacted.

---

## Practical workflow

1. Enable debug + strict in local main.  
2. Optionally `configureLogger({ level: "debug" })` while reproducing.  
3. `getDebugSnapshot()` before/after navigation.  
4. `assertNoReactiveLeaks` around mount/unmount in a unit or browser test.  
5. Watch for `slow-effect` and `security-block` events.  
6. In staging, enable tracing with a low `sampleRate` and your APM exporter.  

## Next

- [Prevent leaks and races](./prevent-leaks-and-races.md)
- [SSR and hydration](./ssr-and-hydration.md) (logger + tracing on the server)
- [Run quality checks](./run-quality-checks.md)
