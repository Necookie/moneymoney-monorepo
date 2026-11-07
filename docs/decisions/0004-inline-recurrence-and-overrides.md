# ADR 0004 — Recurrence stored inline; per-occurrence overrides

**Status:** accepted · 2026-11-07

**Decision.** A scheduled event's recurrence rule (frequency, interval, anchor days, month-end
rule, end date, count, installments) is stored on the event row (1:1, no join). Individual
occurrences are never materialised; they are expanded deterministically by the engine.
Exceptions live in `occurrence_overrides` keyed by `(event_id, original date)`: skip, reschedule,
amount, paid (+ transaction id).

**Consequences.** Editing a series re-projects everything instantly; history of realised
occurrences is preserved via transactions + `paid` overrides; a partial unique index on
transactions prevents double realisation.
