# Bridge logger and tracing to OpenTelemetry

**Status:** candidate (logger/tracing) · sample only — Cachou does **not** ship an OTel SDK

Related: [Use logger and tracing](./use-logger-and-tracing.md) · [API](../API.md)

---

## Principles

1. Cachou tracing is **off by default** and uses W3C `traceparent`.
2. You own the OpenTelemetry SDK / exporter.
3. Never put secrets or PII into span attributes (Cachou redacts common secret keys).

---

## Sample bridge

```js
import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { trace, context as otelContext, SpanStatusCode } from "@opentelemetry/api";
import {
  configureTracing,
  configureLogger,
  startSpan,
  runWithSpan,
  getSpanTraceparent,
  parseTraceparent
} from "cachoujs";

// 1. Start your OTel SDK (once)
const sdk = new NodeSDK({
  instrumentations: [getNodeAutoInstrumentations()]
});
await sdk.start();

const otelTracer = trace.getTracer("my-app");

// 2. Bridge Cachou spans → OTel
configureTracing({
  enabled: true,
  sampleRate: 1,
  exporter: span => {
    const parentCtx = span.traceId
      ? parseTraceparent(
          `00-${span.traceId}-${span.parentSpanId || span.spanId}-${(span.traceFlags ?? 1).toString(16).padStart(2, "0")}`
        )
      : null;
    // Minimal export: create a sibling span with attributes
    const s = otelTracer.startSpan(span.name, {
      attributes: span.attributes || {},
      startTime: span.startTime
    });
    for (const event of span.events || []) {
      s.addEvent(event.name, event.attributes, event.time);
    }
    if (span.status?.code === "ERROR") {
      s.setStatus({ code: SpanStatusCode.ERROR, message: span.status.message || "" });
    }
    s.end(span.endTime);
  }
});

configureLogger({
  level: "info",
  sink: entry => {
    // Optional: forward to your log pipeline
    console.log(JSON.stringify(entry));
  }
});

// 3. SSR with inbound traceparent
export async function handle(req, res) {
  const { renderApplication, htmlDocument, createCSPNonce, buildSecurityHeaders, applySecurityHeaders } =
    await import("cachoujs");
  const nonce = createCSPNonce();
  const { html, head, state } = await renderApplication(App, {
    path: req.url,
    request: req,
    nonce,
    traceparent: req.headers.traceparent
  });
  applySecurityHeaders(res, buildSecurityHeaders({ nonce }));
  res.end(htmlDocument({ html, head, state }));
}
```

Install OTel packages yourself (`@opentelemetry/sdk-node`, exporters, etc.). Versions move quickly — pin them in your app.

## Manual app spans

```js
const span = startSpan("checkout.submit", { attributes: { "order.id": id } });
try {
  runWithSpan(span, () => doWork());
  span.setStatus({ code: "OK" });
} catch (e) {
  span.recordException(e);
  span.setStatus({ code: "ERROR", message: e.message });
  throw e;
} finally {
  span.end();
}
```
