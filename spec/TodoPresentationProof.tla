---------------- MODULE TodoPresentationProof ----------------
EXTENDS Integers, FiniteSetTheorems, NaturalsInduction, TLAPS
CONSTANTS Vertices, Dependencies, Rank
VARIABLES remaining, position, count
vars == <<remaining,position,count>>
Assumptions == IsFiniteSet(Vertices) /\ Dependencies \in [Vertices -> SUBSET Vertices]
  /\ Rank \in [Vertices -> Nat] /\ \A v \in Vertices: \A d \in Dependencies[v]: Rank[d] < Rank[v]
Init == remaining = Vertices /\ position = [v \in Vertices |-> 0] /\ count = 0
Place(v) == /\ v \in remaining /\ Dependencies[v] \cap remaining = {}
            /\ remaining' = remaining \ {v} /\ position' = [position EXCEPT ![v] = count+1] /\ count' = count+1
Next == \E v \in Vertices: Place(v)
Spec == Init /\ [][Next]_vars
TypeOK == remaining \subseteq Vertices /\ position \in [Vertices -> Nat] /\ count \in Nat
Partition == \A v \in Vertices: (v \in remaining <=> position[v] = 0) /\ position[v] <= count
Unique == \A x,y \in Vertices: position[x] > 0 /\ position[x] = position[y] => x = y
Ordered == \A v \in Vertices: position[v] > 0 => \A d \in Dependencies[v]: position[d] > 0 /\ position[d] < position[v]
Inv == TypeOK /\ Partition /\ Unique /\ Ordered
THEOREM InitInv == ASSUME Assumptions PROVE Init => Inv
  BY SMT DEF Assumptions, Init, Inv, TypeOK, Partition, Unique, Ordered
THEOREM StepInv == ASSUME Assumptions PROVE Inv /\ [Next]_vars => Inv'
  BY SMT DEF Assumptions, Inv, TypeOK, Partition, Unique, Ordered, Next, Place, vars
THEOREM Safety == ASSUME Assumptions PROVE Spec => []Inv
  BY InitInv, StepInv, PTL DEF Spec
THEOREM CompletedPresentation == Inv /\ remaining = {} =>
  /\ \A v \in Vertices: position[v] > 0
  /\ Unique /\ Ordered
  BY SMT DEF Inv, TypeOK, Partition
THEOREM ReadyVertexExists == ASSUME Assumptions, TypeOK, remaining # {}
  PROVE \E v \in remaining: Dependencies[v] \cap remaining = {}
  <1>1. PICK v \in remaining: TRUE BY SMT
  <1>2. Rank[v] \in Nat BY <1>1, SMT DEF Assumptions, TypeOK
  <1>3. DEFINE HasRank(n) == \E w \in remaining: Rank[w] = n
  <1>4. HasRank(Rank[v]) BY <1>1 DEF HasRank
  <1>5. DEFINE Q(k) == (\E m \in 0..k: HasRank(m)) =>
    (\E m \in 0..k: HasRank(m) /\ \A j \in 0..m-1: ~HasRank(j))
  <1>6. Q(0) BY SMT DEF Q
  <1>7. \A k \in Nat: Q(k) => Q(k+1) BY SMT DEF Q
  <1>8. \A k \in Nat: Q(k) BY ONLY <1>6, <1>7, IsaM("(intro natInduct, auto)")
  <1>9. PICK n \in Nat: HasRank(n) /\ \A k \in 0..n-1: ~HasRank(k)
    BY <1>2, <1>4, <1>8, SMT DEF Q
  <1>10. PICK w \in remaining: Rank[w] = n BY <1>9 DEF HasRank
  <1>11. Dependencies[w] \cap remaining = {}
    BY <1>9, <1>10, SMT DEF HasRank, Assumptions, TypeOK
  <1>12. QED BY <1>10, <1>11
THEOREM EachPlacementRemovesOne ==
  ASSUME Assumptions, TypeOK, NEW v \in Vertices, Place(v)
  PROVE Cardinality(remaining') < Cardinality(remaining)
  BY FS_CardinalityType, FS_Subset, FS_Difference, SMT DEF Assumptions, TypeOK, Place
=============================================================================
