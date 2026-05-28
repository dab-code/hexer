# Todo: Signup/login + E2E encrypted cloud sync

See `tasks/plan.md` for full context and acceptance criteria per task.

## Phase 1 — Foundation
- [ ] **1A** Wire `@nuxtjs/supabase` into Nuxt, env vars, anon key in
      `runtimeConfig.public` defaults. _S — `package.json`, `nuxt.config.ts`,
      `.env.example`._
- [ ] **1B** Write & apply `supabase/migrations/0001_auth_and_maps.sql`
      (tables, RLS, `delete_self()`). _S._
- [ ] **1C** Build `app/utils/crypto.ts` (PBKDF2/AES-GCM/wrap-unwrap/
      recovery-code helpers). _M._
- [ ] **Checkpoint:** `npm run dev` + `npm run generate` clean; crypto
      round-trip in console; tables in dashboard with RLS on.
      _Pause for human review._

## Phase 2 — Auth slice
- [ ] **2A** `/signup` + `/signup/recovery-code` pages; insert `user_keys`
      row with both wrapped DEKs; show recovery code once. Includes shared
      `passwordStrength.ts` validator + `PasswordStrengthMeter.vue` (reused
      in 4A). _M — 5 files._
- [ ] **2B** `/login` page + `AuthMenu` in header + global auth-state
      middleware; DEK rehydrate from sessionStorage. _M — 4–5 files._
- [ ] **Checkpoint:** sign up → log out → log in round-trip; anonymous
      maps pages unaffected. _Pause for human review._

## Phase 3 — Cloud sync slice
- [ ] **3A** Refactor `useMaps()` into merged-view (local + cloud);
      `useCloudMaps()` Supabase CRUD; new map creates encrypted cloud
      row when logged in. _M — 4 files._
- [ ] **3B** Upload-to-cloud button on local rows; idempotent insert.
      _S — 2 files._
- [ ] **3C** Debounced autosave (~1 s) + `<SaveStatus />` pill in
      `/maps/[id]`. _M — 3 files._
- [ ] **Checkpoint:** create-edit-upload-edit-reload-decrypt works;
      logout clears cache; ciphertext is opaque in dashboard.
      _Pause for human review._

## Phase 4 — Account management
- [ ] **4A** `/account` page: change password (re-wrap DEK only) +
      delete account (`rpc('delete_self')`). _M — 2 files._

## Phase 5 — Verification
- [ ] **5A** End-to-end manual run via Playwright MCP; cross-cutting
      verification list in `tasks/plan.md`.
