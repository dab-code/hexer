// Password strength heuristic — no external deps.
//
// The user's password is the master key for end-to-end encryption (via
// PBKDF2 in app/utils/crypto.ts), so we enforce a hard 10-char minimum
// and require at least the "Fair" tier before signup/change-password
// will submit.
//
// Scoring:
//   - Below 10 chars: always Very weak (no class boost can rescue it).
//   - Length bucket sets a base tier (Weak / Fair / Strong / Very strong).
//   - Character-class diversity adjusts up or down:
//       1 class:  base − 1
//       2 classes: base
//       3 classes: base + 1
//       4 classes: base + 2
//   - Tier is clamped to [VeryWeak, VeryStrong].
//
// Tiers are returned as both numeric (0–4) and label, so the meter
// component can render without re-mapping.

export type StrengthTier = 0 | 1 | 2 | 3 | 4

export interface StrengthResult {
  tier: StrengthTier
  label: 'Very weak' | 'Weak' | 'Fair' | 'Strong' | 'Very strong'
  /** True when the password meets the minimum length AND tier for submission. */
  acceptable: boolean
  /** Short human-readable hint when not yet acceptable. */
  hint: string
}

const MIN_LENGTH = 10
const MIN_TIER: StrengthTier = 2 // Fair

const TIER_LABELS: StrengthResult['label'][] = [
  'Very weak', 'Weak', 'Fair', 'Strong', 'Very strong',
]

function clamp(n: number): StrengthTier {
  if (n < 0) return 0
  if (n > 4) return 4
  return n as StrengthTier
}

function countClasses(pw: string): number {
  let lower = 0, upper = 0, digit = 0, other = 0
  for (const c of pw) {
    if (c >= 'a' && c <= 'z') lower = 1
    else if (c >= 'A' && c <= 'Z') upper = 1
    else if (c >= '0' && c <= '9') digit = 1
    else other = 1
  }
  return lower + upper + digit + other
}

function baseTierByLength(len: number): StrengthTier {
  if (len < MIN_LENGTH) return 0
  if (len < 13) return 1            // 10–12: Weak baseline
  if (len < 16) return 2            // 13–15: Fair
  if (len < 20) return 3            // 16–19: Strong
  return 4                           // 20+: Very strong
}

export function scorePassword(pw: string): StrengthResult {
  if (pw.length === 0) {
    return { tier: 0, label: 'Very weak', acceptable: false, hint: 'Required.' }
  }
  if (pw.length < MIN_LENGTH) {
    return {
      tier: 0,
      label: 'Very weak',
      acceptable: false,
      hint: `At least ${MIN_LENGTH} characters.`,
    }
  }
  const classes = countClasses(pw)
  const base = baseTierByLength(pw.length)
  const adjust = classes - 2 // 1→-1, 2→0, 3→+1, 4→+2
  const tier = clamp(base + adjust)
  const label = TIER_LABELS[tier]!
  const acceptable = tier >= MIN_TIER
  let hint = ''
  if (!acceptable) {
    if (classes === 1) hint = 'Mix character types (letters, numbers, symbols).'
    else hint = 'Make it longer.'
  }
  return { tier, label, acceptable, hint }
}

export const PASSWORD_MIN_LENGTH = MIN_LENGTH
export const PASSWORD_MIN_TIER = MIN_TIER
