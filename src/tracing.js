const tracingConfig = {
  enabled: false,
  sampleRate: 1,
  exporter: null
};

let AsyncLocalStorageCtor = null;
let traceStorage = null;
const traceStack = [];

const ZERO_TRACE_ID = "00000000000000000000000000000000";
const ZERO_SPAN_ID = "0000000000000000";
const sensitiveAttribute = /(authorization|cookie|password|passwd|secret|session|token|credential|set-cookie)/i;
const NOOP_SPAN = {
  isRecording: () => false,
  spanContext: () => null,
  setAttribute: () => NOOP_SPAN,
  setAttributes: () => NOOP_SPAN,
  addEvent: () => NOOP_SPAN,
  recordException: () => NOOP_SPAN,
  setStatus: () => NOOP_SPAN,
  end: () => NOOP_SPAN
};

function ensureTraceStorage() {
  if (traceStorage !== null || AsyncLocalStorageCtor === false) return traceStorage;
  if (typeof process === "undefined" || !process.versions?.node) {
    AsyncLocalStorageCtor = false;
    return null;
  }
  try {
    const mod = globalThis.__CACHOU_ASYNC_HOOKS__ || null;
    const builtin = typeof process.getBuiltinModule === "function"
      ? process.getBuiltinModule("node:async_hooks")
      : null;
    const asyncHooks = mod?.AsyncLocalStorage ? mod : builtin;
    if (asyncHooks?.AsyncLocalStorage) {
      AsyncLocalStorageCtor = asyncHooks.AsyncLocalStorage;
      traceStorage = new AsyncLocalStorageCtor();
      return traceStorage;
    }
  } catch {
    // Tracing must remain optional when async context support is unavailable.
  }
  AsyncLocalStorageCtor = false;
  return null;
}

function randomHex(bytes) {
  const values = new Uint8Array(bytes);
  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.getRandomValues) {
    cryptoApi.getRandomValues(values);
  } else {
    for (let i = 0; i < values.length; i++) values[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(values, value => value.toString(16).padStart(2, "0")).join("");
}

function createTraceId() {
  let id = randomHex(16);
  while (id === ZERO_TRACE_ID) id = randomHex(16);
  return id;
}

function createSpanId() {
  let id = randomHex(8);
  while (id === ZERO_SPAN_ID) id = randomHex(8);
  return id;
}

function now() {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

function normalizeAttribute(value) {
  if (value === null || value === undefined || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string") return value.slice(0, 256);
  if (Array.isArray(value)) {
    return value.slice(0, 16).map(normalizeAttribute).filter(item => item !== undefined);
  }
  return undefined;
}

function normalizeAttributes(attributes = {}) {
  const normalized = {};
  if (!attributes || typeof attributes !== "object") return normalized;
  for (const [key, value] of Object.entries(attributes).slice(0, 64)) {
    if (sensitiveAttribute.test(key)) continue;
    const safeValue = normalizeAttribute(value);
    if (safeValue !== undefined) normalized[key] = safeValue;
  }
  return normalized;
}

function normalizeError(error) {
  if (!error) return { name: "Error", message: "Unknown error" };
  return {
    name: error.name || "Error",
    message: String(error.message || error).slice(0, 512),
    ...(error.stack ? { stack: String(error.stack).slice(0, 4096) } : {})
  };
}

export function parseTraceparent(value) {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  const match = /^([0-9a-f]{2})-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})(?:-([0-9a-f]+))?$/i.exec(raw);
  if (!match || match[1].toLowerCase() === "ff" || match[2] === ZERO_TRACE_ID || match[3] === ZERO_SPAN_ID) return null;
  // Version 00 is fixed-width. Future versions may append fields, which we
  // preserve by accepting the common trace/span/flags prefix.
  if (match[1].toLowerCase() === "00" && match[5]) return null;
  return { traceId: match[2].toLowerCase(), spanId: match[3].toLowerCase(), traceFlags: parseInt(match[4], 16) };
}

export function formatTraceparent(context) {
  if (!context || context.traceId === ZERO_TRACE_ID || context.spanId === ZERO_SPAN_ID) return "";
  return `00-${context.traceId}-${context.spanId}-${(context.traceFlags ?? 0).toString(16).padStart(2, "0")}`;
}

export function extractTraceparent(request) {
  if (!request) return null;
  if (typeof request.traceparent === "string") return parseTraceparent(request.traceparent);
  const headers = request.headers;
  if (headers && typeof headers.get === "function") return parseTraceparent(headers.get("traceparent"));
  if (headers && typeof headers === "object") {
    return parseTraceparent(headers.traceparent || headers.Traceparent || headers["trace-parent"]);
  }
  return null;
}

export function configureTracing(options = {}) {
  if (options.enabled !== undefined) tracingConfig.enabled = options.enabled === true;
  if (options.sampleRate !== undefined) {
    const rate = Number(options.sampleRate);
    tracingConfig.sampleRate = Number.isFinite(rate) ? Math.min(1, Math.max(0, rate)) : 1;
  }
  if (Object.prototype.hasOwnProperty.call(options, "exporter")) {
    tracingConfig.exporter = options.exporter;
  }
  return getTracingConfig();
}

export function getTracingConfig() {
  return {
    enabled: tracingConfig.enabled,
    sampleRate: tracingConfig.sampleRate,
    hasExporter: typeof tracingConfig.exporter === "function" || typeof tracingConfig.exporter?.export === "function"
  };
}

export function isTracingEnabled() {
  return tracingConfig.enabled;
}

export function getActiveSpan() {
  if (!tracingConfig.enabled) return null;
  const storage = ensureTraceStorage();
  if (storage) return storage.getStore() || null;
  return traceStack.length > 0 ? traceStack[traceStack.length - 1] : null;
}

export function runWithSpan(span, fn) {
  if (!span || span === NOOP_SPAN) return fn();
  const storage = ensureTraceStorage();
  if (storage) return storage.run(span, fn);

  // Browser environments without an async context manager can support
  // synchronous nesting, but retaining a global span across an async
  // boundary would let concurrent operations observe one another's trace.
  traceStack.push(span);
  try {
    return fn();
  } finally {
    if (traceStack[traceStack.length - 1] === span) traceStack.pop();
  }
}

class CachouSpan {
  constructor(name, context, parentSpanId, recording, attributes) {
    this.name = name;
    this.traceId = context.traceId;
    this.spanId = context.spanId;
    this.parentSpanId = parentSpanId || undefined;
    this.traceFlags = context.traceFlags;
    this.recording = recording;
    this.startTime = Date.now();
    this.startedAt = now();
    this.attributes = normalizeAttributes(attributes);
    this.events = [];
    this.status = { code: "UNSET" };
    this.ended = false;
  }

  isRecording() {
    return this.recording && !this.ended;
  }

  spanContext() {
    return { traceId: this.traceId, spanId: this.spanId, traceFlags: this.traceFlags };
  }

  setAttribute(key, value) {
    if (this.isRecording() && !sensitiveAttribute.test(key)) {
      const safeValue = normalizeAttribute(value);
      if (safeValue !== undefined) this.attributes[key] = safeValue;
    }
    return this;
  }

  setAttributes(attributes) {
    if (this.isRecording()) Object.assign(this.attributes, normalizeAttributes(attributes));
    return this;
  }

  addEvent(name, attributes = {}) {
    if (this.isRecording()) {
      this.events.push({ name: String(name).slice(0, 128), time: Date.now(), attributes: normalizeAttributes(attributes) });
    }
    return this;
  }

  recordException(error) {
    return this.addEvent("exception", normalizeError(error));
  }

  setStatus(status = {}) {
    if (this.isRecording()) {
      const code = ["UNSET", "OK", "ERROR"].includes(status.code) ? status.code : "UNSET";
      this.status = { code, ...(status.message ? { message: String(status.message).slice(0, 512) } : {}) };
    }
    return this;
  }

  end(endTime = Date.now()) {
    if (this.ended) return this;
    this.ended = true;
    if (!this.recording) return this;
    const payload = {
      name: this.name,
      traceId: this.traceId,
      spanId: this.spanId,
      ...(this.parentSpanId ? { parentSpanId: this.parentSpanId } : {}),
      traceFlags: this.traceFlags,
      startTime: this.startTime,
      endTime,
      durationMs: Math.max(0, now() - this.startedAt),
      attributes: { ...this.attributes },
      events: this.events.slice(),
      status: { ...this.status }
    };
    const exporter = tracingConfig.exporter;
    try {
      if (typeof exporter === "function") exporter(payload);
      else if (typeof exporter?.export === "function") exporter.export(payload);
    } catch {
      // Exporters are application infrastructure and must not break rendering.
    }
    return this;
  }
}

export function startSpan(name, options = {}) {
  if (!tracingConfig.enabled) return NOOP_SPAN;
  const parent = options.parent || getActiveSpan();
  const parentContext = parent?.spanContext?.()
    || (typeof options.traceparent === "string" ? parseTraceparent(options.traceparent) : options.traceparent || null);
  const sampled = parentContext
    ? (parentContext.traceFlags & 1) === 1
    : Math.random() < tracingConfig.sampleRate;
  const context = {
    traceId: parentContext?.traceId || createTraceId(),
    spanId: createSpanId(),
    traceFlags: sampled ? 1 : 0
  };
  return new CachouSpan(
    String(name || "cachou.operation").slice(0, 128),
    context,
    parentContext?.spanId,
    sampled,
    options.attributes
  );
}

export function getSpanTraceparent(span = getActiveSpan()) {
  return formatTraceparent(span?.spanContext?.());
}

export function createTracer(scope = "cachou") {
  const prefix = String(scope).replace(/\.+$/, "");
  return {
    startSpan(name, options = {}) {
      return startSpan(`${prefix}.${name}`, options);
    },
    withSpan(name, fn, options = {}) {
      const span = startSpan(`${prefix}.${name}`, options);
      try {
        const result = runWithSpan(span, fn);
        if (result && typeof result.then === "function") {
          return Promise.resolve(result).then(
            value => {
              span.setStatus({ code: "OK" });
              return value;
            },
            error => {
              span.recordException(error).setStatus({ code: "ERROR", message: "span operation failed" });
              throw error;
            }
          ).finally(() => span.end());
        }
        span.setStatus({ code: "OK" });
        span.end();
        return result;
      } catch (error) {
        span.recordException(error).setStatus({ code: "ERROR", message: "span operation failed" }).end();
        throw error;
      }
    }
  };
}
