---------------- MODULE TodoAcyclicProof ----------------
EXTENDS TodoSystemProof, NaturalsInduction
RankedState == Ranked(deps)

THEOREM RankedInit == ASSUME MaxSeq \in Nat PROVE Init => RankedState
  <1>1. Init => RankCertificate(deps,[i \in Items |-> 0])
    BY SMT DEF Init, RankCertificate
  <1>2. QED BY <1>1, SMT DEF RankedState, Ranked, RankCertificate

THEOREM RankedStep ==
  ASSUME MaxSeq \in Nat
  PROVE RankedState /\ [Next]_vars => RankedState'
  <1>1. \A i \in Items, D \in SUBSET Items: Add(i,D) \/ Rewire(i,D) => Ranked(deps')
    BY SMT DEF Add, Rewire, GuardAdd, GuardRewire
  <1>2. \A i \in Items: Ranked(deps) /\ Remove(i) => Ranked(deps')
    BY SMT DEF Ranked, RankCertificate, Remove
  <1>3. QED BY <1>1, <1>2, SMT DEF RankedState, Ranked, RankCertificate, Next, vars, Reprioritize, Mark, Reopen

THEOREM RankDescendsAlongEveryFinitePath ==
  ASSUME MaxSeq \in Nat, NEW r \in [Items -> 0..MaxSeq], RankCertificate(deps,r),
         NEW n \in Nat, n >= 2, NEW p \in [1..n -> Items],
         \A k \in 1..n-1: p[k+1] \in deps[p[k]]
  PROVE r[p[n]] < r[p[1]]
  <1>1. DEFINE P(k) == k \in 1..n => r[p[k]] + k <= r[p[1]] + 1
  <1>2. P(0) BY SMT DEF P
  <1>3. \A k \in Nat: P(k) => P(k+1)
    <2>1. SUFFICES ASSUME NEW k \in Nat, P(k) PROVE P(k+1)
      OBVIOUS
    <2>2. CASE k = 0
      BY <2>1, <2>2, SMT DEF P
    <2>3. CASE k+1 \notin 1..n
      BY <2>1, <2>3, SMT DEF P
    <2>4. CASE k > 0 /\ k+1 \in 1..n
      <3>1. k \in 1..n-1 /\ p[k] \in Items /\ p[k+1] \in Items /\ p[1] \in Items
        BY <2>1, <2>4, SMT
      <3>2. r[p[k+1]] < r[p[k]]
        BY <3>1, SMT DEF RankCertificate
      <3>3. r[p[k+1]] \in Int /\ r[p[k]] \in Int /\ r[p[1]] \in Int
        BY <3>1, SMT
      <3>4. QED BY <2>1, <2>4, <3>1, <3>2, <3>3, SMT DEF P
    <2>5. QED BY <2>1, <2>2, <2>3, <2>4, SMT
  <1>4. \A k \in Nat: P(k) BY ONLY <1>2, <1>3, IsaM("(intro natInduct, auto)")
  <1>5. QED BY <1>4, SMT DEF P

THEOREM RankedHasNoCycles == ASSUME MaxSeq \in Nat, IsFiniteSet(Items) PROVE RankedState => Acyclic
  <1>1. SUFFICES ASSUME RankedState PROVE Acyclic OBVIOUS
  <1>2. PICK r \in [Items -> 0..MaxSeq]: RankCertificate(deps,r)
    BY <1>1 DEF RankedState, Ranked
  <1>3. Cardinality(Items) \in Nat BY FS_CardinalityType
  <1>4. \A i \in Items: ~Reach(i,i)
    <2>1. SUFFICES ASSUME NEW i \in Items, Reach(i,i) PROVE FALSE OBVIOUS
    <2>2. PICK n, p:
      n \in 2..(Cardinality(Items)+1) /\ p \in [1..n -> Items] /\
      p[1] = i /\ p[n] = i /\ \A k \in 1..n-1: p[k+1] \in deps[p[k]]
      BY <2>1 DEF Reach
    <2>3. n \in Nat /\ n >= 2 BY <1>3, <2>2, SMT
    <2>4. r[p[n]] < r[p[1]] BY <1>2, <2>2, <2>3, RankDescendsAlongEveryFinitePath
    <2>5. QED BY <2>2, <2>4, SMT
  <1>5. QED BY <1>4 DEF Acyclic

THEOREM SafetyAcyclic ==
  ASSUME MaxPriority \in Nat, MaxSeq \in Nat, IsFiniteSet(Items)
  PROVE SafetySpec => [](CoreInv /\ RankedState /\ Acyclic)
  <1>1. SafetySpec => []RankedState BY RankedInit, RankedStep, PTL DEF SafetySpec
  <1>2. QED BY SafetyCore, <1>1, RankedHasNoCycles, PTL
=============================================================================
