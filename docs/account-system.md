# Guest and account practice

The practice exam supports two complete ways to practise. Signing in is optional
and is never required to unlock questions, attempts, review, bookmarks, export,
or reset.

## Guest practice

Guest practice is the default. It works without GitHub, the API, or a network
connection and stores practice state only in this browser under the versioned
guest key. Clearing this site's browser data removes it.

The Account page remains useful to a guest: it shows that state is saved on the
device, downloads an export, resets the visible guest practice state, and offers
GitHub sign-in without prompting anywhere else in the application.

## Account practice

GitHub sign-in adds cross-device sync and recovery after browser data is
cleared. The browser still saves edits locally first, so practice does not wait
for the network. The passive status reports syncing, the latest accepted sync,
o connectivity, or work still waiting to sync. It is deliberately absent from
a timed attempt.

The first sync after sign-in sends the existing guest practice state through the
ordinary sync path. The guest state remains intact until a canonical account
state has been accepted and stored locally, so an interruption cannot consume
it halfway through. Signing in does not remove older answers or attempts: the
server merges them with any state already stored for that account.

The Sync status panel shows the signed-in GitHub avatar and `@username`. The
application never stores or displays the GitHub access token.

## What is stored

Practice state consists of the active attempt, up to 30 finished attempts,
bookmarks, and latest answers. It is stored as follows:

- A guest has one browser-only cache.
- A user has a browser cache whose key is derived only from the authenticated
  subject. The app does not keep a "last account" pointer or search other
  account caches.
- PostgreSQL stores the canonical account practice state under that subject.
- D1 stores the Better Auth identity, session and signing keys: an opaque
  subject, GitHub display name, username, avatar URL, email, and GitHub account
  ID. Provider access, refresh, and ID tokens are cleared before the provider
  account is persisted.
- The short-lived token used to call the practice API stays in memory and is not
  written to browser storage.

The GitHub account ID is recovery metadata, never an authorization key. Every
practice-state operation derives ownership from the authenticated subject, and
no request can nominate another subject.

## Recovery and durability

If a session disappears unexpectedly, the account cache is hidden and
quarantined rather than shown to a guest or erased. Signing in again with the
same GitHub account restores it. A different account cannot read it.

Each device keeps a complete account cache. Those caches are the practical
backup for practice state: after server loss, a later sync from an intact device
can repopulate PostgreSQL. This is not a guarantee against every loss. Losing
the server state and every browser cache together loses the practice state, and
Neon Free provides only a six-hour recovery window and one manual snapshot.
Export important practice state before clearing all devices.

Safe sign-out first waits for pending practice state to be accepted. If syncing
is unavailable, sign-out remains blocked and offers no discard shortcut. A
successful sign-out erases only that subject's cache from the device and starts
a new, empty guest practice state.

## Export, reset, and deletion

All controls are on Account:

- **Download JSON** creates a client-side export of the practice state currently
  visible. It does not send the export to a new endpoint.
- **Reset practice state** deletes finished attempts, bookmarks, and latest
  answers. Guest reset affects only the guest cache. Account reset deletes the
  server state first, then that subject's browser cache, while keeping the
  identity signed in.
- **Delete account** deletes practice state before deleting the Better Auth
  identity. If identity deletion is interrupted, Account remains pinned to the
  unfinished identity step and retries only that step. It never recreates the
  deleted practice state. Deleting this app's account does not change the
  GitHub account itself.

## Preview URLs

Cloudflare version-preview URLs are suitable for UI review and guest practice,
but GitHub sign-in does not work there. A GitHub OAuth app accepts one callback
URL, and this project has separate apps for `localhost:5173` and the production
Worker origin. A preview origin matches neither callback. Use the local
full-stack origin or production when accepting sign-in behavior.
