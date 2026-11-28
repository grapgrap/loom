----------------------------- MODULE BookingFlow -----------------------------
VARIABLES route, capacity, decision
vars == <<route, capacity, decision>>

Init ==
    /\ route = "unknown"
    /\ capacity = "unknown"
    /\ decision = "pending"

NetworkAssessesRoute ==
    /\ route = "unknown"
    /\ route' \in {"route-found", "no-route"}
    /\ UNCHANGED <<capacity, decision>>

BookingAssessesCapacity ==
    /\ capacity = "unknown"
    /\ capacity' \in {"within-limit", "over-limit"}
    /\ UNCHANGED <<route, decision>>

BookingDecides ==
    /\ decision = "pending"
    /\ route # "unknown" /\ capacity # "unknown"
    /\ decision' = IF route = "route-found" /\ capacity = "within-limit"
                   THEN "confirmed" ELSE "rejected"
    /\ UNCHANGED <<route, capacity>>

Next ==
    \/ NetworkAssessesRoute
    \/ BookingAssessesCapacity
    \/ BookingDecides
    \/ (decision # "pending" /\ UNCHANGED vars)

Spec ==
    /\ Init /\ [][Next]_vars
    /\ WF_vars(NetworkAssessesRoute)
    /\ WF_vars(BookingAssessesCapacity)
    /\ WF_vars(BookingDecides)

ConfirmationHasBothGrounds ==
    decision = "confirmed" => (route = "route-found" /\ capacity = "within-limit")

RejectionHasGrounds ==
    decision = "rejected" => (route = "no-route" \/ capacity = "over-limit")

EventuallyDecided == <>(decision # "pending")
=============================================================================
