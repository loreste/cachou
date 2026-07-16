import { signal, batch } from "./reactivity.js";

/**
 * @typedef {string} StateName
 * @typedef {string} EventName
 */

/**
 * @typedef {Object} TransitionTarget
 * @property {StateName} target - Destination state
 * @property {(ctx: any) => boolean} [guard] - Guard function; transition is blocked if it returns false
 * @property {(ctx: any, event: EventName) => void} [action] - Side-effect called during transition
 */

/**
 * @typedef {Object} StateConfig
 * @property {Record<EventName, StateName | TransitionTarget>} [on] - Event-to-transition map
 * @property {(ctx: any) => void | Promise<void>} [enter] - Hook called when entering this state
 * @property {(ctx: any) => void | Promise<void>} [exit] - Hook called when leaving this state
 * @property {boolean} [final] - If true, no transitions are allowed out of this state
 */

/**
 * @typedef {Object} MachineConfig
 * @property {StateName} initial - Initial state name
 * @property {Record<StateName, StateConfig>} states - State definitions
 * @property {Object} [context] - Initial context object
 */

/**
 * @typedef {Object} MachineInstance
 * @property {() => StateName} state - Signal getter for the current state name
 * @property {(event: EventName, payload?: Object) => void} send - Send an event to trigger a transition
 * @property {(event: EventName) => boolean} can - Whether the event is valid from the current state
 * @property {(name: StateName) => boolean} matches - Whether the machine is in the given state
 * @property {() => Object} context - Signal getter for the context object
 * @property {(partial: Object) => void} setContext - Merge partial data into context
 * @property {() => void} reset - Reset to initial state and context
 * @property {(callback: (from: StateName, to: StateName, event: EventName) => void) => () => void} onTransition - Listen to transitions; returns unsubscribe function
 */

/**
 * Normalize a transition definition to a target object.
 * @param {StateName | TransitionTarget} def
 * @returns {TransitionTarget}
 */
function normalizeTransition(def) {
  if (typeof def === "string") {
    return { target: def };
  }
  return def;
}

/**
 * Create a reactive state machine.
 *
 * @param {MachineConfig} config
 * @returns {MachineInstance}
 *
 * @example
 * const checkout = machine({
 *   initial: "cart",
 *   states: {
 *     cart: { on: { CHECKOUT: "shipping" } },
 *     shipping: { on: { BACK: "cart", NEXT: "payment" } },
 *     payment: { on: { BACK: "shipping", PAY: "processing" } },
 *     processing: {
 *       on: { SUCCESS: "confirmation", FAIL: "payment" },
 *       enter: async (ctx) => { // start payment
 *       }
 *     },
 *     confirmation: { final: true }
 *   },
 *   context: { items: [], total: 0 }
 * });
 *
 * checkout.state()       // "cart"
 * checkout.send("CHECKOUT")
 * checkout.state()       // "shipping"
 */
export function machine(config) {
  const { initial, states, context: initialContext } = config;

  const [state, setState] = signal(initial);
  const [ctx, setCtx] = signal(
    initialContext ? { ...initialContext } : {}
  );

  /** @type {Set<(from: StateName, to: StateName, event: EventName) => void>} */
  const transitionListeners = new Set();

  /**
   * Get the transition definition for an event from the current state.
   * @param {StateName} currentState
   * @param {EventName} event
   * @returns {TransitionTarget | null}
   */
  function getTransition(currentState, event) {
    const stateConfig = states[currentState];
    if (!stateConfig || !stateConfig.on) return null;

    const def = stateConfig.on[event];
    if (def === undefined) return null;

    return normalizeTransition(def);
  }

  /**
   * Check whether an event is valid from the current state.
   * Does not evaluate guards.
   *
   * @param {EventName} event
   * @returns {boolean}
   */
  function can(event) {
    const currentState = state();
    const stateConfig = states[currentState];

    // Final states do not allow transitions
    if (stateConfig && stateConfig.final) return false;

    return getTransition(currentState, event) !== null;
  }

  /**
   * Send an event to trigger a state transition.
   *
   * If the event is not valid from the current state, this is a no-op.
   * If a guard is defined and returns false, the transition is blocked.
   * Payload (if provided) is merged into the context.
   *
   * @param {EventName} event
   * @param {Object} [payload] - Merged into context
   */
  function send(event, payload) {
    const currentState = state();
    const currentConfig = states[currentState];

    // Final states block all transitions
    if (currentConfig && currentConfig.final) return;

    const transition = getTransition(currentState, event);
    if (!transition) return;

    const currentCtx = ctx();

    // Merge payload into context if provided
    let nextCtx = currentCtx;
    if (payload && typeof payload === "object") {
      nextCtx = { ...currentCtx, ...payload };
    }

    // Evaluate guard
    if (transition.guard && !transition.guard(nextCtx)) return;

    const targetState = transition.target;

    // Run exit hook (fire-and-forget for async)
    if (currentConfig && currentConfig.exit) {
      const result = currentConfig.exit(nextCtx);
      if (result && typeof result.catch === "function") {
        result.catch(() => {});
      }
    }

    // Run transition action
    if (transition.action) {
      transition.action(nextCtx, event);
    }

    // Update state and context atomically
    batch(() => {
      if (nextCtx !== currentCtx) {
        setCtx(nextCtx);
      }
      setState(targetState);
    });

    // Notify listeners
    for (const listener of transitionListeners) {
      listener(currentState, targetState, event);
    }

    // Run enter hook on the target state (fire-and-forget for async)
    const targetConfig = states[targetState];
    if (targetConfig && targetConfig.enter) {
      const result = targetConfig.enter(ctx());
      if (result && typeof result.catch === "function") {
        result.catch(() => {});
      }
    }
  }

  /**
   * Check if the machine is currently in the given state.
   *
   * @param {StateName} name
   * @returns {boolean}
   */
  function matches(name) {
    return state() === name;
  }

  /**
   * Merge partial data into the context.
   *
   * @param {Object} partial
   */
  function setContext(partial) {
    setCtx((prev) => ({ ...prev, ...partial }));
  }

  /**
   * Reset the machine to its initial state and context.
   */
  function reset() {
    batch(() => {
      setState(initial);
      setCtx(initialContext ? { ...initialContext } : {});
    });
  }

  /**
   * Subscribe to state transitions.
   *
   * @param {(from: StateName, to: StateName, event: EventName) => void} callback
   * @returns {() => void} Unsubscribe function
   */
  function onTransition(callback) {
    transitionListeners.add(callback);
    return () => {
      transitionListeners.delete(callback);
    };
  }

  // Run enter hook for the initial state
  const initialConfig = states[initial];
  if (initialConfig && initialConfig.enter) {
    const result = initialConfig.enter(ctx());
    if (result && typeof result.catch === "function") {
      result.catch(() => {});
    }
  }

  return {
    state,
    send,
    can,
    matches,
    context: ctx,
    setContext,
    reset,
    onTransition,
  };
}
