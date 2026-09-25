------------------------- MODULE TraceValidation --------------------------
\* Replay implementation traces against the verified todo machine.
\* `spec/generated/TracesData.tla` defines `Traces`; each trace step names an
\* action and the state the model should be in afterwards. A disabled action
\* sets `error`, rejected by `TraceInv` with a counterexample naming the step.
\* -------------------------------------------------------------------------

EXTENDS TodoSystem, TracesData, Naturals, Sequences, FiniteSets

VARIABLES traceNo, traceIndex, error

Trace == Traces[traceNo]

state ==
    [ status |-> status, deps |-> deps, priority |-> priority,
      seq |-> seq, next |-> next ]

machineVars == <<status, deps, priority, seq, next>>

ActionOf(ev) ==
    \/ (ev.type = "add"          /\ Add(ev.item, ev.deps))
    \/ (ev.type = "remove"       /\ Remove(ev.item))
    \/ (ev.type = "reprioritize" /\ Reprioritize(ev.item, ev.priority))
    \/ (ev.type = "rewire"       /\ Rewire(ev.item, ev.deps))
    \/ (ev.type = "mark"         /\ Mark(ev.item, ev.status))
    \/ (ev.type = "reopen"       /\ Reopen(ev.item))

GuardOf(ev) ==
    \/ (ev.type = "add"          /\ GuardAdd(ev.item, ev.deps))
    \/ (ev.type = "remove"       /\ GuardRemove(ev.item))
    \/ (ev.type = "reprioritize" /\ GuardReprioritize(ev.item, ev.priority))
    \/ (ev.type = "rewire"       /\ GuardRewire(ev.item, ev.deps))
    \/ (ev.type = "mark"         /\ GuardMark(ev.item, ev.status))
    \/ (ev.type = "reopen"       /\ GuardReopen(ev.item))

AssignState(s) ==
    /\ status = s.status
    /\ deps = s.deps
    /\ priority = s.priority
    /\ seq = s.seq
    /\ next = s.next

TraceInit ==
    /\ traceNo \in 1..Len(Traces)
    /\ traceIndex = 1
    /\ error = FALSE
    /\ AssignState(Trace[1].state)

TraceStep ==
    LET ev == Trace[traceIndex + 1].event IN
      \/ (GuardOf(ev) /\ ActionOf(ev) /\ UNCHANGED error)
      \/ (~GuardOf(ev) /\ UNCHANGED machineVars /\ error' = TRUE)

TraceNext ==
    \/ /\ traceIndex < Len(Trace)
       /\ TraceStep
       /\ traceIndex' = traceIndex + 1
       /\ UNCHANGED traceNo
    \/ /\ traceIndex = Len(Trace)
       /\ UNCHANGED <<machineVars, traceNo, traceIndex, error>>

TraceSpec ==
    TraceInit /\ [][TraceNext]_<<machineVars, traceNo, traceIndex, error>>

TraceInv ==
    /\ error = FALSE
    /\ (traceIndex > 0 => state = Trace[traceIndex].state)

=============================================================================
