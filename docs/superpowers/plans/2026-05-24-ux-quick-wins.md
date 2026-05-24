# Actor Collab UX Quick Wins Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve first-run trust, search correctness, and perceived actor-page speed without changing the static hosting model.

**Architecture:** Keep the app as plain HTML/CSS/JS. Extract small pure helpers into `js/state.js` so behavior can be tested with Node while `js/app.js` remains the DOM coordinator and `js/api.js` remains the TMDB boundary.

**Tech Stack:** Static HTML, CSS, browser JavaScript modules, Node's built-in `node:test` runner.

---

### Task 1: Add Behavior Tests

**Files:**
- Create: `js/state.js`
- Create: `test/state.test.mjs`

- [ ] Write tests for `createLatestOnlyRunner`, `selectPopularWorks`, and `formatApiKeyError`.
- [ ] Run `node --test test/state.test.mjs` and verify the tests fail because `js/state.js` does not exist yet.

### Task 2: Implement Testable Helpers

**Files:**
- Modify: `js/state.js`
- Modify: `test/state.test.mjs`

- [ ] Implement `createLatestOnlyRunner` so only the newest async search result is rendered.
- [ ] Implement `selectPopularWorks` so actor pages can show top works without extra detail fetches.
- [ ] Implement `formatApiKeyError` so invalid, missing, rate-limited, and generic errors have consistent user-facing copy.
- [ ] Run `node --test test/state.test.mjs` and verify all helper tests pass.

### Task 3: Wire Quick Wins Into The App

**Files:**
- Modify: `index.html`
- Modify: `css/style.css`
- Modify: `js/app.js`
- Modify: `js/api.js`

- [ ] Change `index.html` to load `js/app.js` as a module and add API key trust/help copy.
- [ ] Export API functions from `js/api.js`; keep the same TMDB endpoint behavior.
- [ ] Import helpers and API functions in `js/app.js`.
- [ ] Validate the API key before saving by calling `getConfiguration()`.
- [ ] Replace search debounce rendering with `createLatestOnlyRunner`.
- [ ] Render actor banner and popularity-based top works before collaboration analysis finishes.
- [ ] Keep the existing collaboration grid, modal, graph toggle, and cache behavior intact.

### Task 4: Verify In Browser

**Files:**
- No source changes expected.

- [ ] Start `python3 -m http.server 8017`.
- [ ] Open `http://localhost:8017`.
- [ ] Confirm first screen explains API key storage and has no console syntax error.
- [ ] Confirm invalid key stays on the prompt and shows a clear error.
- [ ] Stop the local server.

### Task 5: Relationship Graph Next Step

**Files:**
- No source changes in this pass unless quick wins are complete and verified.

- [ ] Summarize the next graph iteration: weighted nodes/edges, hover/tap shared works, reshuffle, and exploration history.
