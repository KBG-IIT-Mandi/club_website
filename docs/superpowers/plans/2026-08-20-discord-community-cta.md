# Discord Community CTA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish the permanent KBG Global Discord invite as a safe, responsive, globally visible website action.

**Architecture:** A focused community configuration module owns the invite URL. Existing navigation, home, and footer components import the value and render context-appropriate external anchors; scoped CSS extends the existing living-lab visual system without changing remote content contracts.

**Tech Stack:** React 19, React Router 7, Vite 7, CSS, Vitest 4.

## Global Constraints

- Canonical invite: `https://discord.gg/QttCgAqCp6`.
- External invite anchors use `target="_blank"` and `rel="noopener noreferrer"`.
- Keep email contact available in the final home join section.
- Preserve existing mobile drawer, keyboard focus, remote JSON fallbacks, and reduced-motion behavior.
- Add no dependency, tracking, secret, or remote-content schema change.

---

### Task 1: Canonical invite contract and regression test

**Files:**
- Create: `src/config/community.js`
- Create: `src/config/community.test.jsx`

**Interfaces:**
- Produces: `DISCORD_INVITE_URL: string`.
- Consumes: the real navigation, home, and footer React components through server rendering.

- [x] **Step 1: Write the failing test**

Create a Vitest test that server-renders `NavBar`, `Home`, and `Footer` inside `MemoryRouter`. Assert the rendered navigation and footer each contain one permanent invite, the home page contains two, and every invite anchor has `target="_blank"` plus `rel="noopener noreferrer"`.

- [x] **Step 2: Run the focused test and confirm failure**

Run: `npx vitest run src/config/community.test.jsx`

Expected: FAIL because the rendered components do not contain the Discord invite.

- [x] **Step 3: Add the canonical constant**

Create `src/config/community.js` exporting exactly:

```js
export const DISCORD_INVITE_URL = 'https://discord.gg/QttCgAqCp6';
```

- [x] **Step 4: Keep the test red until all consumers are implemented**

Run: `npx vitest run src/config/community.test.jsx`

Expected: FAIL because the rendered components do not yet contain the Discord invite.

### Task 2: Global and home community actions

**Files:**
- Modify: `src/Components/NavBar.jsx`
- Modify: `src/Components/NavBar.css`
- Modify: `src/Pages/Home/Home.jsx`
- Modify: `src/Pages/Home/Home.css`
- Modify: `src/Components/Footer/Footer.jsx`
- Modify: `vite.config.js`
- Modify: `eslint.config.js`

**Interfaces:**
- Consumes: `DISCORD_INVITE_URL` from `src/config/community.js`.
- Produces: safe `Join Discord` anchors in navigation, hero, join membrane, and footer.

- [x] **Step 1: Add the global navigation action**

Import `DISCORD_INVITE_URL`, render an external `Join Discord` anchor after route links, close the mobile drawer on click, and style `.nav__discord` as a restrained bio-green instrument action that becomes full-width in the mobile drawer.

- [x] **Step 2: Add the home actions**

Import `DISCORD_INVITE_URL`. Replace the remote hero CTA with a stable `Join Discord` ghost action. In the final join membrane render `Join KBG Global` as the primary Discord action and retain the existing mail link as `Contact the club`.

- [x] **Step 3: Add the footer fallback action**

Import `DISCORD_INVITE_URL` and append a safe `Discord` external link after remote footer links, independent of remote JSON availability.

- [x] **Step 4: Run the focused test and confirm green**

Run: `npx vitest run src/config/community.test.jsx`

Expected: PASS.

- [x] **Step 5: Bound test discovery to application sources**

Set Vitest `include` to `src/**/*.test.{js,jsx,ts,tsx}` so unrelated tests in untracked workspace scratch directories cannot enter the application suite. Verify with the full `npm test` command that reproduced the failure before this change.

- [x] **Step 6: Exclude workspace scratch files from application linting**

Add `tmp/**` to ESLint's existing global ignores. This preserves lint coverage for the application while preventing unrelated CommonJS scratch files from entering `npm run lint`.

### Task 3: Verification and delivery

**Files:**
- Modify: `docs/superpowers/plans/2026-08-20-discord-community-cta.md`

**Interfaces:**
- Consumes: completed CTA implementation.
- Produces: verified commit on `origin/main`.

- [x] **Step 1: Run the full quality gate**

Run: `npm test && npm run lint && npm run build`

Expected: all commands exit 0.

- [x] **Step 2: Review the intended diff**

Run: `git diff --check && git status --short && git diff -- src/config/community.js src/config/community.test.jsx src/Components/NavBar.jsx src/Components/NavBar.css src/Pages/Home/Home.jsx src/Pages/Home/Home.css src/Components/Footer/Footer.jsx`

Expected: no whitespace errors and no unrelated tracked files.

- [x] **Step 3: Commit and push**

Stage only the spec, plan, configuration, test, and component files. Commit with `feat: publish Discord community invite`, then run `git push origin main`.

- [x] **Step 4: Verify remote delivery**

Run: `git rev-parse HEAD && git ls-remote origin refs/heads/main`

Expected: local and remote hashes match.
