# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

`牌効率クイズ（何切る）` — a browser-based "what to discard" (何切る) training quiz for mahjong tile efficiency. The user is shown a random 14-tile hand and must pick the discard that both advances shanten and maximizes ukeire (accepting tiles). The entire app lives in three files with **no build step and no dependencies**: `index.html`, `app.js`, `styles.css`.

Design rationale is documented in `docs/superpowers/specs/2026-07-02-pai-kouritsu-quiz-design.md`; the implementation plan (all 12 original tasks, written test-first) is in `docs/superpowers/plans/2026-07-02-pai-kouritsu-quiz.md`.

## Running the App

Open `index.html` directly in a browser, or use the configured launch task which serves the current directory over HTTP:

```powershell
# Named configuration "mahjong-kouritsu" in .claude/launch.json, serves on port 8792
```

Access the app at `http://localhost:8792/`.

## Running Tests

There is no test runner/CLI — tests are plain assertions executed in-browser.

- Open `test.html` (or `http://localhost:8792/test.html`) in a browser.
- `app.js` is loaded as a plain script; `test.html` then calls `window.__registerTests()` (defined at the bottom of `app.js`) which runs every `assertEqual(name, actual, expected)` call and renders `OK`/`NG` lines into `#out`.
- There is no way to run a single test in isolation — `__registerTests` runs all assertions every time. To check a specific case, temporarily comment out unrelated `assertEqual` calls or read the rendered output for the specific test name.
- Any logic change to `app.js` must keep all assertions passing before committing.

## Architecture

`app.js` is one script, structured bottom layer to top layer:

1. **Tile representation** — a hand is always a `counts[34]` array (never a list of tile objects). Index ranges: 0-8 man (萬子), 9-17 pin (筒子), 18-26 sou (索子), 27-33 honors (東南西北白發中). `tileLabel`, `tileGlyph`, `tileSuitClass` convert an index to display form; `mkCounts(str)` (test-only helper) parses shorthand like `"123456789m12356p"` into a counts array.

2. **Shanten engine** — `shanten(counts)` returns `Math.min` of three independent calculations, and works unmodified on both 13-tile and 14-tile hands (14 tiles forming a complete hand yields -1):
   - `stdShanten` — recursive exhaustive search over melds/taatsu/pair decomposition (standard hand shape).
   - `chiitoiShanten` — closed-form for seven pairs.
   - `kokushiShanten` — closed-form for thirteen orphans, using the `YAOCHUU` index list.

3. **`ukeire(counts13)`** — for a 13-tile hand, tries adding each of the 34 tile kinds and keeps the ones that reduce `shanten`; sums `4 - counts13[t]` (remaining live tiles) over those accepted kinds.

4. **`evaluateDiscards(counts14)`** — for every tile kind present in the 14-tile hand, computes the resulting 13-tile shanten and ukeire. Correct answers (`isCorrect: true`) are every discard tied for minimum resulting shanten **and** tied for maximum ukeire within that group (ties are all marked correct, not just one).

5. **Problem generation** — `drawRandomHand(rng, includeHonors)` shuffles a fresh tile wall (Fisher-Yates) and takes the first 14; passing `includeHonors=false` restricts the wall to the first 27 tile kinds (excludes honors). `generateProblem(rng, difficulty, includeHonors)` calls it in a retry loop until the resulting `bestShanten` matches the requested difficulty band (`'tenpai'` → 0-1, `'mid'` → 2-3, `'all'` → no filter). `rng` is always a seeded `mulberry32(seed)` generator, not `Math.random`, so hand generation is reproducible in tests.

6. **UI/state layer** — module-level globals (`currentProblem`, `currentDifficulty`, `includeHonors`, `answered`) hold quiz state; `newProblem()`/`onTileClick()`/`initUI()` drive the single-page flow (generate → render → click → grade → show explanation → next). `renderHand`, `renderExplain`, `renderStats` build DOM directly (no virtual DOM/templating) and are the only functions that touch `#hand`/`#explain`/`#statsBar`.

7. **Persistence** — `loadStats()`/`saveStats()` read/write a single JSON blob at `localStorage['mahjong_kiru_stats']` (`{attempts, correct, currentStreak, bestStreak}`). Difficulty and honor-tile-toggle choices are **not** persisted; they reset to defaults (`'all'`, honors off) on reload.

## Key Constraints

- No build tooling, no framework, no external libraries. Tile glyphs are Unicode mahjong characters (U+1F007+), styled via CSS — no image assets.
- `$` is `document.getElementById` (not jQuery). `esc()` HTML-escapes any value interpolated into an `innerHTML` template string.
- Keep `counts[34]` as the canonical hand representation everywhere; don't introduce a parallel tile-object model.
- When adding a new "何切る" rule variant or difficulty mode, follow the existing pattern: a pure function that takes/returns `counts` arrays, plus assertions in `__registerTests` using `mkCounts()` fixtures — see the existing tests in `app.js` for the expected style (hand notation string → expected shanten/ukeire/isCorrect).

## 言語設定
- 常に日本語で応答してください
- コードのコメントも日本語で記述してください
