# Agentic Ready — GH-600 Practice

An unofficial, offline-first practice tool for the GitHub Certified: Agentic
AI Developer (GH-600) credential. This glossary fixes the words used across
the app, the spec, and the issue tracker. It defines concepts only — how each
one is encoded per layer belongs in [`specs/coreex-better-auth.md`](specs/coreex-better-auth.md).

> **These terms are authoritative for new work, and some of them do not yet
> appear in the code.** `src/` still calls latest answers `progress`, an
> attempt `ActiveAttempt`, and practice state `PersistedState`. Those renames
> land when the backend is implemented; until then, prefer the words below in
> prose, issues, and new code, and read the older identifiers as the same
> concepts. The spec records the mapping.

## Language

### People

**Candidate**:
A person preparing for the GH-600 exam. May or may not be signed in — both are
fully supported ways to use the app.
_Avoid_: user (when you mean any person), visitor, student, learner

**Guest**:
A candidate practising without signing in. A permanent, first-class mode, not a
trial or an unconverted state.
_Avoid_: anonymous user, guest user, unregistered user

**User**:
A signed-in identity. Has an authentication record and a subject, and owns
stored practice state. A guest is never a user.
_Avoid_: using this for a candidate who has not signed in

**Subject**:
The stable identifier for a user, carried as the `sub` claim. The only key
ownership is ever derived from.
_Avoid_: user id (ambiguous), account id, GitHub id

**Provider account**:
The record linking a user to their GitHub identity. Internal to authentication;
never shown to a candidate.
_Avoid_: bare "account" — that is the candidate-facing term below

**Account**:
A candidate's signed-in identity together with the practice state stored under
it. What the `Account` view manages.
_Avoid_: profile, login, subscription

### Practice content

**Question bank**:
The fixed set of questions shipped with the app. Local, versioned with the
build, and identical for every candidate.
_Avoid_: question pool, item bank, dataset

**Question**:
One scored item from the bank, belonging to exactly one domain and answered by
selecting one or more options.
_Avoid_: item, problem, card

**Option**:
One selectable choice on a question.
_Avoid_: answer (an answer is what a candidate chose), choice, distractor

**Domain**:
One of the six published GH-600 subject areas. A closed set — questions,
weighting, and reporting all key off it.
_Avoid_: category, topic, section, area

**Objective**:
The specific published skill a question tests, within its domain.
_Avoid_: learning objective, competency, outcome

### Practising

**Exam**:
The real GH-600 credential exam, sat with GitHub. This product is not one and
never administers one.
_Avoid_: using this for anything happening inside this app

**Practice exam**:
This product. Unofficial, unaffiliated, and offline-first.
_Avoid_: mock exam, simulator, test prep

**Attempt**:
One sitting at a selected set of questions. Exactly one attempt may be in
progress at a time.
_Avoid_: session, run, quiz, test, exam

**Active attempt**:
The attempt currently in progress, if any. A state an attempt is in, not a
separate kind of thing.
_Avoid_: current exam, open attempt, draft

**Finished attempt**:
An attempt that has ended and been scored. It is finished regardless of how it
ended — see outcome.
_Avoid_: completed attempt (that names only one outcome), past exam, result

**Outcome**:
How a finished attempt ended: **submitted** by the candidate, **expired** when
its timer ran out, or **abandoned** when a merge resolved it in favour of
another device's attempt. Three distinct endings; only the first is the
candidate choosing to finish.
_Avoid_: status, state, completed/incomplete

**Mode**:
Which shape of attempt was started — full, quick, or focused on chosen domains.
_Avoid_: type, kind, difficulty, level

**Bookmark**:
A candidate's mark on a single question, for returning to it later. Independent
of whether the question has been answered.
_Avoid_: favourite, flag (a flag is a within-attempt mark), saved question

**Latest answers**:
The answer of record for each question — the most recent one the candidate gave,
across every attempt. Survives the attempt it came from.
_Avoid_: progress, answer history, responses

**Progress**:
The statistics derived from latest answers — how many questions are answered,
readiness, and per-domain scores. A computed view, never stored as a fact.
_Avoid_: using this for latest answers, or for a candidate's stored data as a whole

**Readiness**:
The share of the whole question bank a candidate has answered correctly, as a
percentage. Unanswered questions count against it.
_Avoid_: score (a score belongs to an attempt), accuracy, mastery

### State and syncing

**Practice state**:
Everything the app remembers about a candidate's practising: their active
attempt, finished attempts, bookmarks, and latest answers. One concept, whether
it lives in a browser or a database.
_Avoid_: persisted state, snapshot, progress, save data, profile

**Practice state envelope**:
Practice state together with the schema version and receipts needed to exchange
it. What a sync actually carries.
_Avoid_: snapshot, payload, document, blob

**Snapshot**:
A backup of a database taken for recovery. Never practice state, and never
something this app sends or stores.
_Avoid_: using this for anything on the wire

**Sync**:
One exchange of practice state between a candidate's browser and the server.
The first sync after signing in carries a guest's existing practice state; it
is otherwise unremarkable and has no dedicated operation.
_Avoid_: import, upload, push, backup, save

**Receipt**:
The server-assigned time at which an item of practice state arrived. Used only
to order competing versions of that item.
_Avoid_: updated at, modified at, timestamp, version, etag

**Merge**:
Combining an incoming practice state with the stored one to produce the
canonical result. Only ever adds information; removing anything requires its
own operation.
_Avoid_: sync (that is the exchange), save, update, reconcile

## Notes on time

**No stored value records when a candidate acted on a question.** Receipts
record when the server received something. Only an attempt's start and finish
times describe candidate activity, and only at attempt granularity. Never label
a receipt as "last answered" or "last updated" in anything a candidate reads.
