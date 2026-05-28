# Implementation Plan: Signup/login + end-to-end encrypted cloud map sync

> Canonical copy lives at `~/.claude/plans/i-d-like-for-the-humming-prism.md`.
> This file is the in-repo mirror for review and execution tracking.

## Overview

Today the app stores maps exclusively in `localStorage` (key `hexer:maps`)
via `useMaps()`. Maps are lost on browser-clear and don't follow the user
between devices. We're adding:

1. Email/password signup + login (Supabase Auth).
2. Per-user cloud storage for maps in a Postgres `maps` table with RLS.
3. **Client-side end-to-end encryption** of every map's name + JSON payload
   using a password-derived KEK that wraps a per-user random DEK. Supabase
   only ever sees ciphertext.
4. A merged-list UX where anonymous-created local maps remain local until
   the user clicks "Upload to cloud".

The maps pages stay anonymous-usable; auth gates only cloud sync. Header
gets a sign-in / user menu. Map editor gets a "Saved / Saving…" pill.

## Architecture decisions (locked via grilling)

- **Auth method**: email + password only. Email confirmation OFF.
- **Auth UI**: dedicated `/login`, `/signup`, `/signup/recovery-code`,
  `/account` pages.
- **Supabase SDK**: `@nuxtjs/supabase` module.
- **Storage**: Postgres `maps` table; data + name are opaque ciphertext.
- **Encryption**: KEK/DEK pattern. KEK = PBKDF2-SHA-256(password, salt,
  600k). DEK = random 256-bit, wrapped twice (password-KEK,
  recovery-code-KEK). Cipher = AES-256-GCM with per-record 12-byte IV. All
  via Web Crypto API.
- **Recovery**: 24-char Crockford base32 code shown once at signup.
- **Sync model**: merged list. "Upload to cloud" moves a local map to cloud
  (deletes the local copy on success).
- **Save cadence**: debounced autosave ~1 s + localStorage cache cleared on
  logout. Header pill shows live save status.
- **Conflict resolution**: last-write-wins via `updated_at`. No realtime.
- **Migrations**: `supabase/migrations/*.sql` files in repo, applied via the
  Supabase dashboard SQL editor.
- **Session key persistence**: unwrapped DEK bytes cached in
  `sessionStorage` so same-tab reloads don't re-prompt; new tabs/devices
  re-derive from password on login.
- **Account features in v1**: change password, delete account.
- **Default for new maps while logged in**: cloud. Anonymous users still
  create local maps and can promote individually via "Upload to cloud".
- **Password strength**: custom heuristic in `app/utils/passwordStrength.ts`
  (no extra deps). Hard min 10 chars; scores by length + character-class
  diversity; submit gated at "Fair" tier or above. Same validator used by
  `/signup` and `/account`. Strength meter rendered next to the password
  input.

## Data model (target schema)

```sql
create table public.user_keys (
  user_id                 uuid primary key references auth.users on delete cascade,
  salt                    bytea       not null,                -- 16 bytes
  kdf_iterations          int         not null default 600000,
  wrapped_dek_password    bytea       not null,
  wrapped_dek_password_iv bytea       not null,                -- 12 bytes
  wrapped_dek_recovery    bytea       not null,
  wrapped_dek_recovery_iv bytea       not null,
  created_at              timestamptz not null default now()
);

create table public.maps (
  id          uuid primary key,
  user_id     uuid        not null references auth.users on delete cascade,
  name_ct     bytea       not null,
  name_iv     bytea       not null,
  data_ct     bytea       not null,
  data_iv     bytea       not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index maps_user_updated_idx on public.maps (user_id, updated_at desc);

-- RLS owner-only on both tables. delete_self() SECURITY DEFINER fn lets a
-- signed-in user delete their own auth.users row (cascades to maps +
-- user_keys).
```

## Dependency graph

```
Phase 1 (Foundation, parallelizable)
├── 1A  Supabase client wired into Nuxt
├── 1B  SQL schema applied
└── 1C  Crypto utility module

Phase 2 (Auth slice)
├── 2A  Signup → user_keys row + recovery code shown   [needs 1A,1B,1C]
└── 2B  Login → DEK unlocked + auth header             [needs 2A]

Phase 3 (Cloud sync slice)
├── 3A  Merged useMaps + new cloud map create          [needs 2B]
├── 3B  Upload-to-cloud button                          [needs 3A]
└── 3C  Debounced autosave + SaveStatus pill           [needs 3A]

Phase 4 (Account management)
└── 4A  Change password + delete account               [needs 2B]

Phase 5 (Verification)
└── 5A  End-to-end manual run + smoke tests            [needs 3A–3C, 4A]
```

Each slice in Phases 2–4 is a complete, testable user-visible path.

---

## Phase 1 — Foundation

### Task 1A: Wire Supabase client into Nuxt

**Description:** Install `@nuxtjs/supabase`, register it in `nuxt.config.ts`,
add env vars, confirm `useSupabaseClient()` works in a SPA-mode
(`ssr: false`) Nuxt component. Bake the anon key + URL into
`runtimeConfig.public` defaults so GitHub Pages deploys work without
secrets (RLS protects data; anon key is safe to ship).

**Acceptance criteria:**
- [ ] `@nuxtjs/supabase` listed in `package.json` and installed.
- [ ] `useSupabaseClient()` callable from any client component.
- [ ] `redirectOptions` allow `/`, `/maps`, `/maps/**`, `/login`,
      `/signup`, `/signup/**` to render anonymously.
- [ ] `.env.example` documents `NUXT_PUBLIC_SUPABASE_URL` and
      `NUXT_PUBLIC_SUPABASE_KEY`.

**Verification:**
- [ ] `npm run dev` boots without errors.
- [ ] Manual: in DevTools console on `/maps`, a scratch component returns a
      Supabase client from `useSupabaseClient()`.
- [ ] `npm run generate` succeeds.

**Dependencies:** None.

**Files likely touched:**
- `package.json`
- `nuxt.config.ts`
- `.env.example`

**Estimated scope:** S (1–2 files).

---

### Task 1B: Apply SQL schema (tables, RLS, delete_self)

**Description:** Write `supabase/migrations/0001_auth_and_maps.sql` with
the schema above and the `delete_self()` `SECURITY DEFINER` function.
Paste into the Supabase SQL editor.

**Acceptance criteria:**
- [ ] Migration file checked into repo with the full schema.
- [ ] `user_keys`, `maps` tables exist with RLS enabled.
- [ ] Policies in place: owner-only SELECT/INSERT/UPDATE on both tables.
- [ ] `delete_self()` callable by `authenticated`, revoked from `public`.

**Verification:**
- [ ] Supabase dashboard → Table editor shows both tables with RLS on.
- [ ] Authentication → Policies lists the owner-only policies.
- [ ] `select pg_get_functiondef('public.delete_self()'::regprocedure)`
      returns the expected body.

**Dependencies:** None.

**Files likely touched:**
- `supabase/migrations/0001_auth_and_maps.sql` (new)

**Estimated scope:** S (1 file).

---

### Task 1C: Crypto utility module

**Description:** Pure-function Web Crypto helpers in `app/utils/crypto.ts`
(no Vue deps). KEK derivation (PBKDF2), DEK generation, wrap/unwrap,
encryptJson/decryptJson, encryptString/decryptString, recovery-code gen +
parse, random salt + IV. Base64 helpers for transport.

**Acceptance criteria:**
- [ ] All exported functions documented in the plan are present and typed.
- [ ] Round-trip encrypt→decrypt of a SavedMap JSON returns the original.
- [ ] Round-trip wrap→unwrap of a DEK with a KEK preserves equality (i.e.
      encrypting + decrypting a fixed plaintext on both sides matches).
- [ ] `generateRecoveryCode()` returns 24 chars in the Crockford base32
      alphabet (no I, L, O, U); `parseRecoveryCode(s)` normalizes case and
      strips dashes/whitespace.

**Verification:**
- [ ] Manual: in browser console, run all round-trips and assert.
- [ ] Encryption of a 30 KB map JSON completes in <10 ms on a modern
      laptop.

**Dependencies:** None.

**Files likely touched:**
- `app/utils/crypto.ts` (new)

**Estimated scope:** M (1 file, multiple primitives).

---

### Checkpoint: Foundation

- [ ] 1A, 1B, 1C complete.
- [ ] `npm run dev` and `npm run generate` succeed.
- [ ] Manual crypto round-trip works in browser console.
- [ ] Tables visible in Supabase dashboard with RLS on.
- [ ] **Human review before proceeding to Phase 2.**

---

## Phase 2 — Auth slice

### Task 2A: Signup flow with recovery code

**Description:** `/signup` page collects email + password (with confirm).
On submit: `supabase.auth.signUp`, then derive KEK from password +
generated salt, generate DEK, generate recovery code, derive recovery-KEK,
wrap DEK twice, insert `user_keys` row, store unwrapped DEK in
sessionStorage, navigate to `/signup/recovery-code` which shows the code
exactly once with a "I've saved it" confirmation button → `/maps`.

**Acceptance criteria:**
- [ ] `/signup` route renders form (email, password, confirm).
- [ ] Live strength meter next to the password input; submit disabled
      until tier ≥ Fair and length ≥ 10.
- [ ] Submit creates one row each in `auth.users` and `public.user_keys`.
- [ ] Recovery code displayed on `/signup/recovery-code` and never again.
- [ ] User is logged in (Supabase session present) at end of flow.
- [ ] Validation errors (mismatched passwords, weak password, duplicate
      email) shown inline.
- [ ] Form busy state while signup in progress.

**Verification:**
- [ ] Sign up with fresh email → both rows present.
- [ ] Refresh `/signup/recovery-code` → recovery code is gone.
- [ ] After 2B: sign out + back in → password unlocks DEK.

**Dependencies:** 1A, 1B, 1C.

**Files likely touched:**
- `app/pages/signup.vue` (new)
- `app/pages/signup/recovery-code.vue` (new)
- `app/composables/useEncryptionKey.ts` (new)
- `app/utils/passwordStrength.ts` (new — shared with 4A)
- `app/components/PasswordStrengthMeter.vue` (new — shared with 4A)

**Estimated scope:** M (5 files).

---

### Task 2B: Login flow + auth header + state listener

**Description:** `/login` page. On submit: `signInWithPassword`, fetch
`user_keys`, derive KEK from password + stored salt, unwrap DEK, store in
sessionStorage. Logout clears DEK + cloud cache. Auth state listener in
`app/middleware/auth.global.ts` reacts to SIGNED_OUT. Header
(`app/layouts/default.vue`) gets `<AuthMenu />` next to
`UColorModeButton`. Maps pages remain anonymous-friendly.

**Acceptance criteria:**
- [ ] `/login` route renders form; submit logs the user in.
- [ ] After login, `useEncryptionKey().dek` is populated.
- [ ] Same-tab reload → DEK rehydrated from sessionStorage, no re-prompt.
- [ ] New tab → DEK is empty until login.
- [ ] Header shows "Sign in" + "Sign up" when logged out; user email +
      dropdown (Account, Sign out) when logged in.
- [ ] Sign out clears DEK + cloud cache + Supabase session.

**Verification:**
- [ ] Login → reload → still logged in → DEK present.
- [ ] Private window → not logged in.
- [ ] DevTools sessionStorage has `hexer:dek` only while logged in.
- [ ] Wrong password → error, no DEK written.

**Dependencies:** 2A.

**Files likely touched:**
- `app/pages/login.vue` (new)
- `app/components/AuthMenu.vue` (new)
- `app/middleware/auth.global.ts` (new)
- `app/layouts/default.vue`
- `app/composables/useEncryptionKey.ts`

**Estimated scope:** M (4–5 files).

---

### Checkpoint: Auth slice

- [ ] Sign up + log in + log out round-trip works.
- [ ] DEK persists in sessionStorage same-tab, drops on logout/new-tab.
- [ ] Maps pages still usable anonymously; only header changes when
      logged in.
- [ ] **Human review before proceeding to Phase 3.**

---

## Phase 3 — Cloud sync slice

### Task 3A: Merged `useMaps` + cloud create path

**Description:** Refactor `useMaps()` into a merged-view abstraction. Local
maps in `hexer:local-maps` (rename from `hexer:maps`; one-time migration on
load). Cloud maps fetched on login, decrypted into a `cloudMaps` ref,
optionally cached to `hexer:cloud-cache` (plaintext) for warm reloads.
`list` computed = merged, sorted by `updated_at` desc, each entry tagged
`source: 'local' | 'cloud'`. `add()` writes to cloud when logged in,
otherwise local. `get/update/remove` route by source.

**Acceptance criteria:**
- [ ] Logged-out: behavior identical to today.
- [ ] Logged-in: creating a new map via `/maps/new` writes an encrypted row
      and the list shows it cloud-badged.
- [ ] `cloud-cache` cleared on logout (Task 2B).
- [ ] `hexer:maps` → `hexer:local-maps` migration runs once and removes
      the old key.
- [ ] `MapEnvelope` type exported from `app/types/map.ts`.

**Verification:**
- [ ] Logged-out: new map in localStorage, none in Supabase.
- [ ] Logged-in: new map in Supabase with opaque `name_ct`.
- [ ] Decrypt round-trips the original SavedMap.
- [ ] `/maps` list shows merged entries with correct badges, newest first.

**Dependencies:** 2B.

**Files likely touched:**
- `app/composables/useMaps.ts`
- `app/composables/useCloudMaps.ts` (new)
- `app/types/map.ts`
- `app/pages/maps/index.vue`

**Estimated scope:** M (4 files).

---

### Task 3B: Upload-to-cloud button on local rows

**Description:** "Upload to cloud" action on local entries in `/maps`.
Click → encrypt and INSERT, then drop the localStorage entry. Toast on
success/failure. Idempotent retry: unique-violation on `id` = success.

**Acceptance criteria:**
- [ ] Button only on local rows when logged in.
- [ ] Click → row in Supabase with ciphertext.
- [ ] Entry's source flips from local to cloud without refresh.
- [ ] Local entry removed from `hexer:local-maps`.
- [ ] Currently-open editor for the uploaded map keeps working.

**Verification:**
- [ ] Upload, reload, map persists from cloud, local store empty.
- [ ] Offline upload → toast shows failure.
- [ ] Double-click upload → no duplicate row, no error toast.

**Dependencies:** 3A.

**Files likely touched:**
- `app/pages/maps/index.vue`
- `app/composables/useMaps.ts`

**Estimated scope:** S (2 files).

---

### Task 3C: Debounced autosave + SaveStatus pill

**Description:** Cloud-backed edits trigger per-id debounced save
(`useDebounceFn(save, 1000)`). Small `dirty/saving/saved/error` state
machine drives `<SaveStatus />` in `/maps/[id]` header. Local maps keep
their instant `useLocalStorage` behavior.

**Acceptance criteria:**
- [ ] Editing a cloud map: pill goes Saved → Saving… → Saved within ~1.2 s.
- [ ] Network failure: "Offline — queued"; reconnect retries.
- [ ] Rapid edits coalesce into one Supabase UPDATE.
- [ ] `updated_at` advances server-side on every successful save.
- [ ] Local-map editing behavior unchanged.

**Verification:**
- [ ] Edit cloud map → one PATCH ~1 s after last edit.
- [ ] Throttle network → offline-queued; restore → save lands.
- [ ] Edit + navigate within 0.5 s → save still flushes.

**Dependencies:** 3A.

**Files likely touched:**
- `app/components/SaveStatus.vue` (new)
- `app/pages/maps/[id].vue`
- `app/composables/useMaps.ts`

**Estimated scope:** M (3 files).

---

### Checkpoint: Cloud sync slice

- [ ] Create-edit-upload-edit-reload-decrypt flow works end-to-end.
- [ ] Logout clears cloud cache; login re-decrypts.
- [ ] Cloud rows in Supabase contain only ciphertext.
- [ ] **Human review before proceeding to Phase 4.**

---

## Phase 4 — Account management

### Task 4A: Change password + delete account

**Description:** `/account` page with two sections.

- **Change password**: verify current password by deriving its KEK and
  unwrapping the stored DEK; if OK, derive new KEK from new password +
  same salt, re-wrap DEK with new KEK, UPDATE
  `user_keys.wrapped_dek_password{,_iv}`, call
  `supabase.auth.updateUser({password})`. Maps don't re-encrypt.
- **Delete account**: confirm-by-typing-email → `supabase.rpc(
  'delete_self')` → cascade-deletes maps + user_keys + auth.users → local
  state cleared → redirect to `/`.

**Acceptance criteria:**
- [ ] Wrong current password → save fails clearly; no DB writes.
- [ ] Same strength meter from 2A on the new-password field; submit
      gated at Fair or above.
- [ ] Right current password + new password → `wrapped_dek_password`
      changes, `auth.users.encrypted_password` changes, session stays
      valid.
- [ ] After password change: log out + back in with new password →
      maps decrypt.
- [ ] Delete gate requires typing exact email.
- [ ] After delete: rows for that user_id gone; client logged out at `/`.

**Verification:**
- [ ] Change password, log out, log in with new password, open a map.
- [ ] Delete account, confirm tables empty.
- [ ] Mistyped email keeps delete button disabled.

**Dependencies:** 2B.

**Files likely touched:**
- `app/pages/account.vue` (new)
- `app/composables/useEncryptionKey.ts`

**Estimated scope:** M (2 files).

---

## Phase 5 — Verification

### Task 5A: End-to-end manual run + smoke

**Description:** Drive the whole flow via Playwright MCP in a clean
profile. Confirm anonymous, signup, recovery, login, upload, edit-
autosave, logout, login-again-decrypts, change-password, delete.

**Acceptance criteria:**
- [ ] All steps in the cross-cutting verification list below pass.

**Dependencies:** 3A–3C, 4A.

**Files likely touched:** None (verification only).

**Estimated scope:** S.

---

## Cross-cutting verification (run before declaring done)

- [ ] **Anonymous path unchanged**: `/maps` logged out, create/edit/
      export/import a local map; persists across reload.
- [ ] **Ciphertext is opaque**: `name_ct` and `data_ct` look random;
      no titles or terrain ids visible.
- [ ] **Anon key only in bundle**: the JWT in `dist/` carries the `anon`
      role only.
- [ ] **RLS works**: another user can't SELECT another's `maps`.
- [ ] **Static deploy still works**: `npm run generate`, open
      `dist/200.html`; login page mounts cleanly.
- [ ] **No plaintext after logout**: `hexer:cloud-cache` and `hexer:dek`
      removed.
- [ ] **Recovery code is one-time**.
- [ ] **Save status reflects real state** under network throttling.

---

## Risks and mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| User loses both password and recovery code → data unrecoverable. | High | Prominent warning at signup; "Export to JSON" remains user-controlled backup. |
| Web Crypto rejection on older browsers. | Low | Modern browsers all support PBKDF2 + AES-GCM. |
| `useLocalStorage` write of large plaintext map blocks main thread. | Low/Med | Same as today; encryption happens off the main path during debounce. |
| LWW silently overwrites a parallel-device edit. | Low (solo use) | Documented limitation. |
| `delete_self()` SECURITY DEFINER misconfigured → privilege escalation. | High | Strict `search_path = ''`, explicit `auth.uid()` check, revoke from public, grant to authenticated. |
| sessionStorage caches plaintext DEK bytes on disk. | Med | Documented tradeoff; future "strict mode" toggle. |

## Open questions

_(All open questions resolved during planning.)_
