# Use the logger and tracing

Cachou’s observability surface is **opt-in and silent by default**. It never
throws into application code. Prefer your own logger/APM in production; use
these bridges when you want framework-stage events correlated with your app.

Related: [Enable debug diagnostics](./enable-debug-diagnostics.md) · [API](../API.md) · [SSR](./ssr-and-hydration.md)

---

## Logger

```js
import { configureLogger, createLogger } from "cachoujs";

configureLogger({
  level: process.env.NODE_ENV === "production" ? "warn" : "debug",
  // optional: replace console pipeline
  // sink: entry => myLogger.write(entry)
});

const log = createLogger("checkout");
log.info("started", { orderId });
log.error("failed", { orderId, code: "card_declined" });
```

| Level | Typical use |
|-------|-------------|
| `silent` | Default — nothing emitted |
| `error` / `warn` | Production |
| `info` / `debug` / `trace` | Local development |

Framework stages (SSR, resources, navigation, hydration) share the same pipeline
when the level allows them.

---

## Tracing (W3C `traceparent`)

Disabled by default. Cachou does **not** ship an OpenTelemetry exporter — bridge
to your SDK:

```js
import { configureTracing, startSpan, runWithSpan, createTracer } from "cachoujs";

configureTracing({
  enabled: true,
  sampleRate: 0.1,
  exporter: span => {
    // span: name, traceId, spanId, durationMs, attributes, events, status, …
    otelExport(span);
  }
});

const tracer = createTracer("checkout");
tracer.withSpan("submit", () => submitOrder(), {
  attributes: { "order.id": orderId }
});
```

### Manual spans

```js
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

### SSR and concurrent requests

Pass the incoming `traceparent` (and prefer an explicit SSR context) so concurrent
requests keep separate traces:

```js
import {
  createSSRContext,
  renderToStringAsync,
  dehydrate,
  getSSRHead
} from "cachoujs";

const context = createSSRContext();
const html = await renderToStringAsync(App, {
  path: req.url,
  request: req,
  context,
  signal: req.signal,
  traceparent: req.headers.get?.("traceparent") || req.headers.traceparent
});
const state = dehydrate(context);
const head = getSSRHead(context);
```

Sensitive attribute keys (tokens, cookies, passwords, authorization, …) are redacted.

---

## Framework events (lightweight)

When you only need a firehose of framework signals without full tracing:

```js
import { onFrameworkEvent } from "cachoujs";

const stop = onFrameworkEvent(event => {
  // resource-error, resource-abort, security-block, slow-effect, …
  metrics.increment(`cachou.${event.type}`);
});
// later: stop();
```

---

## Practical defaults

| Environment | Logger | Tracing |
|-------------|--------|---------|
| Unit tests | `silent` or `error` | off |
| Local dev | `debug` | optional sample |
| Production | `warn`/`error` + sink | on only with real exporter + sampling |

Do not put PII or access tokens into span attributes; use stable IDs.
