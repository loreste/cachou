/**
 * Reactive state machine for Cachou.
 *
 * @module cachoujs/machine
 */
declare module "cachoujs/machine" {
  /** A signal getter that returns the current value of type T. */
  type SignalGetter<T> = () => T;

  export interface TransitionTarget<C = any> {
    /** Destination state. */
    target: string;
    /** Guard function; transition is blocked if it returns false. */
    guard?: (ctx: C) => boolean;
    /** Side-effect called during transition. */
    action?: (ctx: C, event: string) => void;
  }

  export interface StateConfig<C = any> {
    /** Event-to-transition map. Values can be a target state name or a TransitionTarget. */
    on?: Record<string, string | TransitionTarget<C>>;
    /** Hook called when entering this state. May be async. */
    enter?: (ctx: C) => void | Promise<void>;
    /** Hook called when leaving this state. May be async. */
    exit?: (ctx: C) => void | Promise<void>;
    /** If true, no transitions are allowed out of this state. */
    final?: boolean;
  }

  export interface MachineConfig<C = Record<string, any>> {
    /** Initial state name. */
    initial: string;
    /** State definitions. */
    states: Record<string, StateConfig<C>>;
    /** Initial context object. */
    context?: C;
  }

  export interface MachineInstance<C = Record<string, any>> {
    /** Signal getter for the current state name. */
    state: SignalGetter<string>;
    /** Send an event to trigger a transition. Payload is merged into context. */
    send(event: string, payload?: Partial<C>): void;
    /** Whether the event is valid from the current state (does not evaluate guards). */
    can(event: string): boolean;
    /** Whether the machine is currently in the given state. */
    matches(name: string): boolean;
    /** Signal getter for the context object. */
    context: SignalGetter<C>;
    /** Merge partial data into context. */
    setContext(partial: Partial<C>): void;
    /** Reset to initial state and context. */
    reset(): void;
    /** Subscribe to state transitions. Returns an unsubscribe function. */
    onTransition(
      callback: (from: string, to: string, event: string) => void
    ): () => void;
  }

  /**
   * Create a reactive state machine.
   */
  export function machine<C = Record<string, any>>(
    config: MachineConfig<C>
  ): MachineInstance<C>;
}
