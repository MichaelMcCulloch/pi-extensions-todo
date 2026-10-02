---------------- MODULE TodoHeapProof ----------------
EXTENDS TodoAcyclicProof
THEOREM LinkedEquivalence ==
  /\ \A x \in Active: Linked(x,x)
  /\ \A x,y \in Active: Linked(x,y) => Linked(y,x)
  /\ \A x,y,z \in Active: Linked(x,y) /\ Linked(y,z) => Linked(x,z)
  BY SMT DEF Linked
THEOREM EdgesStayWithinHeap == LiveEdgeWithinHeap
  BY SMT DEF LiveEdgeWithinHeap, HeapOf, Linked, Closed, LiveEdge
THEOREM HeapPartition == HeapsAreClasses
  <1>1. \A i,j \in Active: Linked(i,j) => HeapOf(i) = HeapOf(j)
    BY LinkedEquivalence, SetExtensionality, SMT DEF HeapOf
  <1>2. \A i,j \in Active: HeapOf(i) = HeapOf(j) => Linked(i,j)
    BY LinkedEquivalence, SMT DEF HeapOf
  <1>3. QED BY <1>1, <1>2 DEF HeapsAreClasses
THEOREM SafetyFull ==
  ASSUME MaxPriority \in Nat, MaxSeq \in Nat, IsFiniteSet(Items)
  PROVE SafetySpec => []Inv
  BY SafetyAcyclic, EdgesStayWithinHeap, HeapPartition, PTL DEF Inv, CoreInv
=============================================================================
