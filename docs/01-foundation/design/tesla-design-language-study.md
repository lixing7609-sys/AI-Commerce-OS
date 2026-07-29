# Tesla Design Language Study

Research pass for AI Commerce OS Design DNA v1.0. Tesla is a **discipline reference, not a template**: this document exists to extract underlying principles (hierarchy, restraint, rhythm) that get reinterpreted into an original AI Commerce OS language — not to clone Tesla's UI.

**Method:** live inspection of tesla.com via an automated browser (screenshots + `getComputedStyle` reads on live DOM nodes), 2026-07-29. Values are labeled **Observed** (read directly from computed styles / DOM), **Estimated** (visual judgment where DOM measurement was unreliable — e.g. section rhythm on a carousel-heavy page), or **AI Commerce OS Decision** (what we do differently and why). Nothing here is claimed as exact CSS unless it came from a direct `getComputedStyle` read, quoted below.

## 1. Pages reviewed

- `tesla.com` root (redirects to the current featured vehicle — landed on the **Model S** product page)
- Model S product page, full scroll (desktop 1440×900): hero, spec-stat strip, interior/feature sections, regional availability grid, closing CTA hero, footer
- Same page at mobile viewport (375×812)
- Cookie-consent dialog (interaction, not visual reference)

Not reached in this pass: a separate non-vehicle page (e.g. Energy) and the global mega-nav dropdown open state — noted as a gap in "Known limitations" in the final implementation report rather than fabricated.

## 2. Desktop observations (1440×900)

- Header is fixed/overlay, height **56px** (Observed: `header` bounding rect), transparent background over the hero image (`background-color: rgba(0,0,0,0)` Observed), so the hero image reads edge-to-edge with no visible top bar.
- Primary hero: full-bleed vehicle video/image, large white heading directly on the image, one primary CTA button + one secondary/tertiary CTA side by side.
- Immediately below the hero: a three-up **stat strip** (range / 0–60 / power) — this is the single most distinctive Tesla composition pattern: a very large number, a smaller unit suffix beside it, and a muted caption label below. See §4 for exact type values.
- Content sections below alternate: full-bleed media (image/video) with overlaid or adjacent short heading, versus white-background sections with a heading + short supporting copy + a media panel.
- A regional-availability section renders as a plain text grid (region name as a level-2 heading, no card/border/shadow wrapping it) — confirms Tesla is comfortable presenting structured info as typography alone, no container needed.
- Page ends with a second full-bleed hero-style CTA block ("Design yours or get a trade-in estimate") immediately followed by the footer — bookending the page with the same visual weight as the opening hero.

## 3. Responsive observations

- **Mobile (375×812):** header collapses to wordmark (left) + text link "Menu" (right) — no hamburger icon glyph, a text label instead. Hero keeps the same full-bleed image treatment and single prominent CTA button, but drops the secondary CTA seen on desktop (one primary action, not two, at narrow width).
- Type and image treatment stay full-bleed/edge-to-edge at mobile — no added container padding around hero media.
- (Estimated, not measured directly this pass) Content sections likely stack from the desktop's implicit multi-column arrangement to single-column at mobile, consistent with the hero's collapse pattern.

## 4. Typography hierarchy (Observed via `getComputedStyle`)

| Role (Tesla's actual use) | Font size | Weight | Line height | Font family |
|---|---|---|---|---|
| Page/hero H1 ("Model S") | 64px | 500 | 64px | "Universal Sans Display" |
| Section H1 ("Next-Level Interior", "Signature From Start to Finish") | 48px | 500 | 56px | "Universal Sans Display" |
| Sub-section H1 ("Three Ultra-Responsive Displays") | 34px | 500 | 44px | "Universal Sans Display" |
| Stat number (hero spec strip, "410") | 64px | 500 | 64px | "Universal Sans Display" |
| Stat unit suffix ("mi") | 28px | 500 | 36px | "Universal Sans Display" |
| Stat caption ("Range (EPA est.)") | 20px | 500 | 28px | "Universal Sans Display" |
| Card/region heading (H2, "North America") | 20px | 500 | 28px | "Universal Sans Display" |
| Nav / body text | 14px | 400–500 | 20px | "Universal Sans Text" |
| Footer legal text | 12px | 400 | — | "Universal Sans Text" |
| Footer links | 12px | 500 | — | "Universal Sans Text" |

**Observed pattern, not a specific pixel value:** every heading role uses the same font-weight (**500**) regardless of size — hierarchy comes from size and line-height, not from mixing weights. Body/UI text uses a separate, slightly lighter-optical "Text" cut of the same family at 400–500. **Letter-spacing was `normal` at every size checked** — no artificial tightening/tracking on large display type, contrary to a common assumption about "premium" display type.

**Font family (Observed, and explicitly excluded from adoption):** `"Universal Sans Display"` / `"Universal Sans Text"` — Tesla's proprietary in-house typeface, with `-apple-system, Arial, sans-serif` as its own fallback stack. This confirms Tesla's fallback strategy is itself just system-font-first, which validates rather than obligates our own system-font approach.

## 5. Font-weight usage

Two weights carry the entire page: **500 (Medium)** for every heading and stat number, **400 (Regular)** for body/legal text, with **500** reappearing for nav links, buttons, and captions (i.e. Medium is also the "interactive/labeled" weight, not exclusively a heading weight). No Bold (700) observed anywhere in this pass. This is a much narrower weight range than the AI Commerce OS spec's four-weight system (400/500/600/700) — see §19/20 for how we adapt it.

## 6. Font-size contrast

The scale observed — 64 / 48 / 34 / 28 / 20 / 14 / 12 — steps down in large, deliberate jumps (roughly ×1.3–1.4 between adjacent steps) rather than a dense, evenly-spaced scale. There is no 15/16/17px "almost-body" clutter — sizes are chosen to be clearly distinct at a glance.

## 7. Line-height observations

Observed line-heights track close to `1.0×` font-size for large display type (64px/64px, 48px/56px ≈ 1.17×) and widen toward `~1.4×–1.43×` for smaller/body text (14px/20px, 12px/~17px estimated). Tighter leading at large sizes, looser at small sizes — standard optical practice, confirmed rather than assumed here.

## 8. Text alignment patterns

Left-aligned headings and body copy throughout every section visited; the only centered elements were CTA button groups and the stat-strip numbers (each stat block is its own centered mini-column, but the three blocks together are left-aligned as a strip). No large blocks of centered paragraph text were seen.

## 9. Grid and composition

Sections read as full-bleed media anchored to short, left-aligned text blocks — not a conventional 12-column card grid. The one clear "grid" instance (regional-availability list) uses plain typography in a loose column layout, no card borders. **Estimated:** overall content width for text-bearing sections appears constrained to a comfortable reading measure (roughly 600–700px for body copy blocks) even though media spans full width — consistent with the spec's "Chinese/English text max-width" requirement we define in `typography-spec.md`.

## 10. Section spacing

**Estimated** (DOM-measured gaps were unreliable on this carousel/animation-heavy page, so this is visual-scroll judgment, not a verified pixel value): sections carry generous internal vertical padding — comfortably more than 80px above and below each heading+media block — with no visible hairline dividers between full-bleed sections; the transition between sections is handled by contrast (dark hero → white section → dark hero) rather than by rule lines.

## 11. Button hierarchy (Observed)

| Button | Font size/weight | Height | Padding | Radius | Background |
|---|---|---|---|---|---|
| Primary CTA ("Browse Inventory") | 14px / 500 | 40px | small (icon-only internal padding, width set by content) | **4px** | brand blue `rgb(62,106,225)` |
| High-contrast/dark variant | 14px / 500 | 40px | — | 4px | near-black `rgb(23,26,32)` |
| Small/tertiary CTA | 12px / 500 | 28px | `8px 16px` | 4px | dark gray `rgb(34,34,34)` / `rgb(57,60,65)` |
| Inline text link ("Trade In") | 12px / 500 | 20px | 0 | 0 (no button chrome) | transparent, underline-free |

**Key finding, contrary to a common assumption:** Tesla's buttons use a **small, tight radius (4px)** — not a rounded/pill shape. Rounding is reserved for media containers (video/image panels observed at **8px**), not for buttons. Button transitions were `border-color 0.33s, background-color 0.33s, color 0.33s, box-shadow 0.25s` (Observed) — short, linear-feeling state changes, no bounce/spring easing.

## 12. Icon characteristics

Minimal icon usage was visible in this pass — mobile nav uses a **text label** ("Menu") rather than a hamburger glyph; the in-page assistant affordance is a small chat-bubble icon. Not enough icon variety was observed live to fully catalog stroke width/style, so **AI Commerce OS's icon system (Lucide, per spec) is an original choice, not a derivation from observed Tesla iconography.**

## 13. Radius characteristics (Observed)

Two radius values recur: **4px** on interactive controls (buttons) and **8px** on media/content panels (video and carousel image containers, `border-radius: 8px` on `.tcl-media--rounded-corners` elements). No large/pill radii (24px+, 999px) were observed anywhere in this pass — Tesla's rounding is subtle throughout, scaling with element size but staying tight.

## 14. Surface and border treatment

Sections rely on solid color fields (pure white, pure/near black) rather than bordered cards; the regional-info grid — the closest thing to a "list of items" — has no border or background differentiation at all, just typographic grouping. No shadowed floating cards were observed.

## 15. Color restraint (Observed)

- Primary text on light sections: near-black `rgb(23,26,32)` (i.e. `#171A20`)
- Secondary/caption text: `rgb(92,94,98)` (`#5C5E62`)
- Tertiary/muted text: `rgb(142,142,142)` (`#8E8E8E`)
- Nav text on light: `rgb(57,60,65)` (`#393C41`)
- Footer: pure black background `rgb(0,0,0)`, primary footer text `rgb(238,238,238)`, secondary footer links `rgb(208,209,210)`
- One brand accent blue observed on the primary CTA button: `rgb(62,106,225)` (`#3E6AE1`) — notably **not red**; Tesla's own product chrome/CTA color in this surface is a blue, reserving red for vehicle paint/brand-mark contexts elsewhere on the site (not observed directly in this pass, known from general familiarity — flagged as background knowledge, not a verified read).

Overall palette is achromatic (near-black / white / grays) with a single accent color used sparingly for the one primary action per screen — not a "colorful UI," color as signal not decoration.

## 16. Image and content relationship

Photography/video is the primary content, not a decorative accent — most sections are majority-image with a small amount of overlaid or adjacent text. Text never competes with the image for attention; headings sit in generous negative space either above, beside, or directly on a darkened portion of the image.

## 17. Motion principles (Observed + Estimated)

Observed transition timing on interactive elements: `0.25s–0.33s`, `ease`/`cubic-bezier(0.5,0,0,0.75)` — short and controlled. Estimated (visual, from the auto-playing hero video and carousel): section-level motion (video looping, carousel auto-advance) is slow and continuous rather than snappy; there is no visible bounce, overshoot, or spring easing anywhere in this pass.

## 18. What should be adopted

- Two-weight-dominant type system (one heading weight, one body weight) with hierarchy from size/line-height, not weight-stacking
- Large, deliberate size jumps in the type scale (no dense near-duplicate sizes)
- Small, consistent radius on controls; slightly larger (not dramatically larger) radius on media/content panels
- Restrained, mostly-achromatic palette with one accent color reserved for the primary action
- Typography-first hierarchy — some content (the regional list) needs no card/border at all
- Short, linear-feeling motion timing (~150–350ms) with no bounce
- One clear primary action per screen, image/content-led composition

## 19. What must not be copied

- Tesla's proprietary "Universal Sans" font files or family names
- Tesla's red as our accent (explicitly excluded per spec; also not what Tesla uses for its own product CTAs, per §15)
- Tesla's exact page compositions, exact component markup/class names (`tds-*`, `tcl-*`), exact copy, exact photography
- Tesla's logo/wordmark treatment

## 20. How the principles are transformed for AI Commerce OS

- **Type stack:** system-first (`-apple-system, "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif`) instead of a bundled proprietary font — see `typography-spec.md`. We keep Tesla's "few weights, size does the work" discipline but widen to four semantic weights (400/500/600/700) because AI Commerce OS's information density (decision cards, data tables, approval flows) needs more structural weight contrast than a marketing site does — full rationale in `typography-spec.md`.
- **Radius:** we adopt the "small on controls, larger on major surfaces" relationship directly (our `radius-xs`/`radius-sm` map to Tesla's control-radius instinct; `radius-lg`/`radius-xl` are reserved for hero/major surfaces the way Tesla reserves its 8px for media panels) — see `layout-grid-spec.md` and `color-spec.md`.
- **Color:** achromatic-first palette, one AI-accent color reserved for AI state/action (not Tesla red, not a copy of the current generic `#4F46E5` indigo-SaaS accent already in the repo) — see `color-spec.md` for the specific decision.
- **Motion:** short, linear/ease timing bands (100–600ms per the spec's own ranges) directly informed by Tesla's observed 250–330ms control transitions, scaled up modestly for larger UI regions (menus, drawers) — see the Design DNA master doc §14.
- **Composition:** "one primary intent per screen," typography-first hierarchy, and reserving containers for objects that truly need a boundary — directly adopted as Design DNA Principles 1 and 5, applied to the Founder工作台 pilot in place of the current 25-tile equal-weight KPI grid.
