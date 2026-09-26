/**
 * The durable todo store.
 *
 * One state, one reducer: every mutation is a command whose structural
 * transition is `referenceReduceTodoState` — the mirror of
 * `spec/TodoSystem.tla`. The store re-checks the invariant after every command
 * and refuses to persist a violating state.
 */

import {
  reduceTodoCommand,
  TodoCommandError,
  type TodoCommand,
  type TodoReduceResult,
} from "../engine/reducer.ts";
import { initTodoState, normalizeTodoState, type TodoState } from "../engine/state.ts";
import { verifyTodoState } from "../engine/verify.ts";
import { TodoStateError, type TodoViolation } from "../formal/model.ts";

/** Where snapshots go. `pi.appendEntry` in production, an array in tests. */
export interface TodoPersistence {
  append(snapshot: TodoState): void;
}

/** A store error carrying a stable code. */
export class TodoOperationError extends Error {
  public constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "TodoOperationError";
  }
}

/** The durable store. */
export class TodoStore {
  #state: TodoState;
  readonly #persistence: TodoPersistence;

  public constructor(persistence: TodoPersistence, initial: TodoState = initTodoState()) {
    this.#persistence = persistence;
    this.#state = normalizeTodoState(initial);
  }

  public get state(): TodoState {
    return this.#state;
  }

  public violations(): readonly TodoViolation[] {
    return verifyTodoState(this.#state);
  }

  /** Apply one command, persist the successor, and return both. */
  public apply(command: TodoCommand): TodoReduceResult {
    let result: TodoReduceResult;
    try {
      result = reduceTodoCommand(this.#state, command);
    } catch (error) {
      if (error instanceof TodoCommandError) throw new TodoOperationError(error.code, error.message);
      if (error instanceof TodoStateError) throw new TodoOperationError("todo-transition-refused", error.message);
      throw error;
    }
    if (!result.changed) return result;
    const violations = verifyTodoState(result.state);
    if (violations.length > 0) {
      throw new TodoOperationError(
        "todo-invariant-violation",
        violations.map((violation) => `${violation.invariant}: ${violation.detail}`).join("; "),
      );
    }
    this.#state = result.state;
    this.#persistence.append(this.#state);
    return result;
  }
}

/** An in-memory store for tests and trace generation. */
export function memoryTodo(initial: TodoState = initTodoState()): TodoStore {
  return new TodoStore({ append: () => {} }, initial);
}
