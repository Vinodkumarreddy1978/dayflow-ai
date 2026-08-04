# 21 - Design System

| Field        | Value      |
| ------------ | ---------- |
| Document ID  | DF-DOC-021 |
| Version      | 0.1.0      |
| Status       | Draft      |
| Owner        | Founder    |
| Last updated | 2026-08-04 |

---

## 1. Purpose

The visual and interaction language of DayFlow AI: tokens, components, states and motion.
Per ADR-007 there is no third-party component library, so this document is the
specification the component kit is built from.

## 2. Design principles

1. **Data first.** Chrome recedes; the user's own data is the visual focus.
2. **Calm.** Muted surfaces, restrained colour, generous space. The product is used by
   people trying to reduce stress, not add to it.
3. **Colour carries meaning.** Every hue means something specific. Nothing is coloured for
   decoration, because that would dilute the signals that matter.
4. **Consistent density.** One spacing scale, one radius scale, one type scale.
5. **Legible in both themes.** Dark mode is a first-class theme, not an inversion.

## 3. Colour

Defined as CSS custom properties under Tailwind v4's `@theme`, so both Tailwind utilities
and chart libraries read the same values.

### 3.1 Neutrals

| Token                 | Light     | Dark      | Use                     |
| --------------------- | --------- | --------- | ----------------------- |
| `--color-bg`          | `#fafafa` | `#0a0a0b` | Page background         |
| `--color-surface`     | `#ffffff` | `#141416` | Cards, modals           |
| `--color-surface-2`   | `#f4f4f5` | `#1c1c20` | Nested surfaces, inputs |
| `--color-border`      | `#e4e4e7` | `#27272a` | Dividers, outlines      |
| `--color-text`        | `#18181b` | `#fafafa` | Primary text            |
| `--color-text-muted`  | `#71717a` | `#a1a1aa` | Secondary text          |
| `--color-text-subtle` | `#a1a1aa` | `#71717a` | Tertiary text, hints    |

### 3.2 Semantic

| Token                 | Light     | Dark      | Meaning                                   |
| --------------------- | --------- | --------- | ----------------------------------------- |
| `--color-accent`      | `#4f46e5` | `#6366f1` | Primary actions, active navigation        |
| `--color-success`     | `#16a34a` | `#22c55e` | Goal met, streak alive, saved             |
| `--color-warning`     | `#d97706` | `#f59e0b` | Needs attention, long activity, estimated |
| `--color-danger`      | `#dc2626` | `#ef4444` | Destructive actions, refusals             |
| `--color-distraction` | `#e11d48` | `#f43f5e` | Distracted Time, everywhere it appears    |

`--color-distraction` is reserved. It appears only for distraction data, per DF-CAT-032, so
that the user learns to recognise it instantly across every chart.

### 3.3 Category palette

Twelve hues assigned to Parent Categories in order of creation, chosen to be
distinguishable both from each other and under the common forms of colour vision
deficiency.

```
#4f46e5  indigo      #0891b2  cyan        #16a34a  green
#ca8a04  amber       #dc2626  red         #9333ea  purple
#0d9488  teal        #ea580c  orange      #2563eb  blue
#65a30d  lime        #c026d3  fuchsia     #57534e  stone
```

| ID        | Requirement                                                                                       |
| --------- | ------------------------------------------------------------------------------------------------- |
| DF-UX-040 | A Parent Category MUST keep its colour consistently across every chart and surface.               |
| DF-UX-041 | Categories MUST inherit their parent's hue at reduced saturation unless overridden.               |
| DF-UX-042 | Colour MUST NOT be the only means of conveying information. Labels or patterns MUST accompany it. |

DF-UX-042 is an accessibility requirement with a practical corollary: every chart needs a
legend and every segment needs a label on interaction.

## 4. Typography

System font stack, for instant rendering and native feel:

```css
font-family:
  ui-sans-serif,
  system-ui,
  -apple-system,
  "Segoe UI",
  Roboto,
  "Helvetica Neue",
  Arial,
  sans-serif;
```

Numeric data uses `font-variant-numeric: tabular-nums` so that durations and times align in
columns and do not jitter while a timer is counting.

| Token       | Size / line-height | Weight | Use                    |
| ----------- | ------------------ | ------ | ---------------------- |
| `display`   | 32px / 40px        | 700    | Page titles            |
| `heading-1` | 24px / 32px        | 600    | Section headings       |
| `heading-2` | 20px / 28px        | 600    | Card titles            |
| `heading-3` | 16px / 24px        | 600    | Sub-headings           |
| `body`      | 15px / 24px        | 400    | Default                |
| `body-sm`   | 13px / 20px        | 400    | Secondary              |
| `caption`   | 12px / 16px        | 500    | Labels, axis ticks     |
| `metric`    | 28px / 32px        | 700    | Large figures, tabular |

Minimum body size is 13px. Anything smaller fails legibility on a phone in daylight.

## 5. Spacing, radius, elevation

A 4px base scale: `1=4px`, `2=8px`, `3=12px`, `4=16px`, `5=20px`, `6=24px`, `8=32px`,
`10=40px`, `12=48px`, `16=64px`.

Radius: `sm=6px` for inputs and chips, `md=10px` for cards, `lg=16px` for modals and
sheets, `full` for pills and avatars.

Elevation is expressed with borders and very soft shadows. Dark theme leans on surface
lightness rather than shadow, because shadows are nearly invisible on dark backgrounds.

| Level | Light                           | Dark                           |
| ----- | ------------------------------- | ------------------------------ |
| 0     | border only                     | border only                    |
| 1     | `0 1px 2px rgb(0 0 0 / 0.05)`   | surface-2                      |
| 2     | `0 4px 12px rgb(0 0 0 / 0.08)`  | surface-2 plus border          |
| 3     | `0 12px 32px rgb(0 0 0 / 0.12)` | surface-2 plus stronger border |

## 6. Components

### 6.1 Button

Variants `primary`, `secondary`, `ghost`, `danger`. Sizes `sm` 32px, `md` 40px, `lg` 48px.

States: default, hover, active, focus-visible, disabled, loading. A loading button retains
its width to prevent layout shift, and remains disabled until resolution.

| ID        | Requirement                                                                    |
| --------- | ------------------------------------------------------------------------------ |
| DF-UX-050 | Every button MUST show a visible focus ring on keyboard focus.                 |
| DF-UX-051 | A button performing an async action MUST show a loading state and be disabled. |
| DF-UX-052 | Icon-only buttons MUST carry an accessible label.                              |

### 6.2 Input, time input, textarea

Standard text and number inputs at 40px height with a 6px radius.

The **time input** is the most important control in the product and gets specific
treatment: a native `datetime-local` field paired with a **Now** button, plus quick offsets
for -15m, -30m and -1h.

| ID        | Requirement                                                                        |
| --------- | ---------------------------------------------------------------------------------- |
| DF-UX-053 | Time inputs MUST offer one-tap Now Capture.                                        |
| DF-UX-054 | Time inputs MUST offer relative quick-adjust of at least -15m, -30m and -1h.       |
| DF-UX-055 | Time inputs MUST respect the user's `time_format` setting for display.             |
| DF-UX-056 | Validation errors MUST appear beneath the field, associated by `aria-describedby`. |

The quick offsets exist because retroactive capture is the primary path, and "half an hour
ago" is how people actually think about the recent past.

### 6.3 Category selector

A searchable list grouped by Parent Category, with each entry showing its colour. Includes
an inline "Create category" action so that DF-MOM-008 is satisfied without leaving the form.

Below ten categories it renders as a simple grouped list; above ten, search appears
automatically per DF-CAT-008.

### 6.4 Card

The base container. Variants: `default`, `pending` with an accent left border, `warning` for
the needs-attention state, `muted` for archived or estimated content.

### 6.5 Queue card

A specialisation of Card, specified fully in
[12 - PRD Queue and Reminder Engine](../02-product/12-prd-queue-and-reminder-engine.md)
section 3.3. Two primary actions, live elapsed time, urgency-driven appearance.

### 6.6 Modal and sheet

Below 768px a modal presents as a bottom sheet that can be dismissed by dragging down.
Above, it is a centred dialog.

| ID        | Requirement                                                                      |
| --------- | -------------------------------------------------------------------------------- |
| DF-UX-060 | Focus MUST be trapped within an open modal.                                      |
| DF-UX-061 | Escape MUST close it, unless there are unsaved changes, which MUST prompt first. |
| DF-UX-062 | Focus MUST return to the triggering element on close.                            |
| DF-UX-063 | Background content MUST NOT scroll while a modal is open.                        |
| DF-UX-064 | The modal MUST carry `role="dialog"`, `aria-modal="true"` and a labelled title.  |

### 6.7 Toast

Bottom-centre on phone, bottom-right on desktop. Variants success, error, info. Dismisses
after 5 seconds, or 10 when it carries an Undo.

| ID        | Requirement                                                               |
| --------- | ------------------------------------------------------------------------- |
| DF-UX-065 | Destructive actions MUST offer Undo in the toast for at least 10 seconds. |
| DF-UX-066 | Toasts MUST be announced in an `aria-live="polite"` region.               |
| DF-UX-067 | Toasts MUST NOT obscure the bottom navigation on phone.                   |

### 6.8 Timeline

A vertical list on phone, a horizontal 24-hour track on desktop. Blocks are coloured by
Parent Category, sized by duration with a minimum tappable height, and gaps are rendered as
subdued dashed regions that are themselves tappable to create a Moment.

### 6.9 Charts

Recharts, themed from the same tokens. Every chart must provide a legend, tooltips with
absolute and percentage values, an accessible data table alternative, and a defined empty
state.

### 6.10 Other

Switch, Tabs, Select, Progress bar, Badge, Skeleton, Empty state. Each hand-built with the
accessibility requirements of
[22 - Accessibility and Responsive Standards](22-accessibility-and-responsive-standards.md).

## 7. Motion

| Purpose          | Duration | Easing                        |
| ---------------- | -------- | ----------------------------- |
| Hover, focus     | 120ms    | `ease-out`                    |
| Modal, sheet     | 220ms    | `cubic-bezier(0.32,0.72,0,1)` |
| Toast            | 180ms    | `ease-out`                    |
| Chart transition | 400ms    | `ease-in-out`                 |
| Skeleton pulse   | 1600ms   | `ease-in-out`, infinite       |

| ID        | Requirement                                                               |
| --------- | ------------------------------------------------------------------------- |
| DF-UX-070 | All motion MUST be disabled when `prefers-reduced-motion: reduce` is set. |
| DF-UX-071 | No animation MUST delay the availability of an interactive element.       |

## 8. Iconography

Lucide, at 20px in navigation and buttons, 16px inline, 24px in empty states. Stroke width
1.75. Icons never appear without either a label or an accessible name.

## 9. Writing style

Sentence case everywhere, including buttons. Second person. Verb-led actions - "Add
moment", not "New". Times as `14:30` or `2:30 PM` per setting; durations as `2h 15m`, never
`2.25h`. Errors state the fix, not the fault: "End time must be after start time" rather
than "Invalid input".

---

## Change History

| Version | Date       | Author  | Change         |
| ------- | ---------- | ------- | -------------- |
| 0.1.0   | 2026-08-04 | Founder | Initial draft. |
