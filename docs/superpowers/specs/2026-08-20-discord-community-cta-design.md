# Discord Community CTA Design

## Goal

Make the permanent KBG Global Discord community invite easy to find from every page without disrupting the site's existing living-laboratory identity or replacing the club's email contact path.

## Approved direction

Use `https://discord.gg/QttCgAqCp6` as one canonical configuration value. Present it as a concise `Join Discord` action in the global navigation, the home hero, the final home join membrane, and the footer. External links open in a new tab with `noopener noreferrer` and an accessible new-tab label.

The navigation action is the persistent acquisition surface. It uses the established bio-green, mono-label, instrument-control language rather than Discord-purple branding. On desktop it sits after the route links; in the mobile drawer it becomes a full-width terminal action. The home hero keeps `Enter the lab` primary and makes Discord the complementary community action. The final join section makes Discord primary while retaining email as `Contact the club`. The footer appends Discord locally even when remote footer JSON has not yet been updated.

## Boundaries

- Do not modify remote content schemas or require a KBG_Links change.
- Do not introduce a dependency, tracking script, secret, or API call.
- Do not replace existing internal navigation or the email contact path.
- Do not change the permanent invite URL in more than one source file.
- Preserve keyboard focus, reduced-motion behavior, responsive navigation, and safe external-link attributes.

## Verification

Add a deterministic source-level test proving the canonical invite is rendered by the navigation, home page, and footer with safe external-link behavior. Run the focused test red/green, then the full test suite, ESLint, and production build. Inspect the final diff, commit only intended files, push `main`, and verify the remote commit.
