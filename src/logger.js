const levelRanks = {
  silent: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
  trace: 5
};

const loggerConfig = {
  level: "silent",
  sink: null,
  includeStack: true
};

function normalizeLevel(level) {
  return Object.prototype.hasOwnProperty.call(levelRanks, level) ? level : "silent";
}

function defaultConsoleSink(entry) {
  if (typeof console === "undefined") return;
  const method = entry.level === "error"
    ? "error"
    : entry.level === "warn"
      ? "warn"
      : "log";
  const scope = entry.scope ? `[${entry.scope}]` : "[CachouJS]";
  const message = `${scope} ${entry.message || entry.eventType || "event"}`;
  const details = { ...entry };
  delete details.message;
  delete details.scope;
  delete details.level;
  delete details.eventType;
  delete details.time;
  if (Object.keys(details).length > 0) console[method](message, details);
  else console[method](message);
}

function normalizeError(error) {
  if (!error || typeof error !== "object") return error;
  const normalized = {
    name: error.name || "Error",
    message: error.message || String(error)
  };
  if (loggerConfig.includeStack && error.stack) normalized.stack = error.stack;
  if (error.cause) normalized.cause = normalizeError(error.cause);
  return normalized;
}

function inferLevel(event) {
  if (event.level && Object.prototype.hasOwnProperty.call(levelRanks, event.level)) {
    return event.level;
  }
  if (["error", "resource-error", "transition-error", "cleanup-error", "reactive-leak", "ssr-error", "navigation-error"].includes(event.type)) {
    return "error";
  }
  if (["security-block", "hydration-mismatch", "debug-warning", "resource-stale-response"].includes(event.type)) {
    return "warn";
  }
  if (event.type?.endsWith("-start") || event.type?.endsWith("-complete") || event.type?.endsWith("-load")) {
    return "debug";
  }
  return "info";
}

export function configureLogger(options = {}) {
  if (options.level !== undefined) {
    loggerConfig.level = normalizeLevel(options.level);
  }
  if (Object.prototype.hasOwnProperty.call(options, "includeStack")) {
    loggerConfig.includeStack = options.includeStack !== false;
  }
  if (Object.prototype.hasOwnProperty.call(options, "sink")) {
    loggerConfig.sink = options.sink;
  } else if (loggerConfig.level !== "silent" && !loggerConfig.sink) {
    loggerConfig.sink = defaultConsoleSink;
  }
  return getLoggerConfig();
}

export function getLoggerConfig() {
  return {
    level: loggerConfig.level,
    includeStack: loggerConfig.includeStack,
    hasSink: typeof loggerConfig.sink === "function"
  };
}

export function isLoggingEnabled() {
  return loggerConfig.level !== "silent" && typeof loggerConfig.sink === "function";
}

export function writeLog(entry) {
  const level = inferLevel(entry);
  if (levelRanks[level] > levelRanks[loggerConfig.level]) return;
  const sink = loggerConfig.sink;
  if (typeof sink !== "function") return;

  const normalized = {
    time: entry.time || Date.now(),
    level,
    eventType: entry.type || entry.eventType || "event",
    ...entry
  };
  if (normalized.error) normalized.error = normalizeError(normalized.error);
  try {
    sink(normalized);
  } catch {
    // Logging must never break application execution.
  }
}

export function createLogger(scope = "app") {
  const log = (level, message, details = {}) => writeLog({ level, scope, message, ...details });
  return {
    error: (message, details) => log("error", message, details),
    warn: (message, details) => log("warn", message, details),
    info: (message, details) => log("info", message, details),
    debug: (message, details) => log("debug", message, details),
    trace: (message, details) => log("trace", message, details)
  };
}
