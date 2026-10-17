# One active routine per person, shared by every training style and by their trainer

Each person has exactly one active routine. "Track my progress" shows it as a rotation. "Keep it simple" shows the
same routine as My week, weekday by weekday, with days that have no weekday listed as unscheduled. A trainer edits
that same routine.

We rejected giving simple mode its own weekly plan next to the routine. With two plans:

- switching training style would mean converting one into the other, and losing data in the process;
- a trainer would have to know which of the two plans the client is actually following.

With one object, switching style changes only how the routine is presented.

## Consequences

- A routine day may have no exercises: just a weekday and a workout type, such as "Tue · Yoga". Shipped mobile
  binaries that assume every day has exercises must be protected (hide such routines below a new API level).
- Coaching's attribution ("Changed by Ana") and its conflict handling ("Keep mine / Use the other version") work the
  same way in both training styles, because both styles edit one routine.
