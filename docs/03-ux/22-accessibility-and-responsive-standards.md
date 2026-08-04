# 22 - Accessibility and Responsive Standards

| Field        | Value      |
| ------------ | ---------- |
| Document ID  | DF-DOC-022 |
| Version      | 0.1.0      |
| Status       | Draft      |
| Owner        | Founder    |
| Last updated | 2026-08-04 |

---

## 1. Purpose

The non-negotiable quality bars for accessibility, responsiveness and performance. These
are product requirements with defined thresholds, not aspirations - charter principle 7.

They matter more here than in an average application for a specific reason: ADR-007 chose
to hand-build the component kit, which means no accessibility behaviour is inherited from a
library. Every focus trap, every ARIA relationship and every keyboard interaction has to be
written deliberately. This document is the checklist that makes that tractable.

## 2. Accessibility target

**WCAG 2.1 Level AA**, with Level AAA contrast where it costs nothing.

## 3. Colour and contrast

| ID          | Requirement                                                                           |
| ----------- | ------------------------------------------------------------------------------------- |
| DF-A11Y-001 | Body text MUST meet a contrast ratio of at least 4.5:1 against its background.        |
| DF-A11Y-002 | Text at 18px or larger MUST meet at least 3:1.                                        |
| DF-A11Y-003 | Interactive borders and focus indicators MUST meet at least 3:1.                      |
| DF-A11Y-004 | Colour MUST NOT be the sole carrier of meaning anywhere in the product.               |
| DF-A11Y-005 | Chart palettes MUST be distinguishable under deuteranopia, protanopia and tritanopia. |
| DF-A11Y-006 | Both light and dark themes MUST independently satisfy all of the above.               |

DF-A11Y-004 has concrete consequences worth stating: pending Moments carry a badge as well
as an accent border; goal states carry an icon and a text label as well as a colour;
distraction segments are labelled as well as coloured; and the heat map exposes numeric
values on interaction.

## 4. Keyboard

| ID          | Requirement                                                                                                            |
| ----------- | ---------------------------------------------------------------------------------------------------------------------- |
| DF-A11Y-010 | Every interactive element MUST be reachable and operable by keyboard alone.                                            |
| DF-A11Y-011 | Focus order MUST follow visual order.                                                                                  |
| DF-A11Y-012 | Focus MUST be visible at all times, with a 2px ring at 2px offset. `outline: none` without a replacement is forbidden. |
| DF-A11Y-013 | Modals MUST trap focus and restore it to the trigger on close.                                                         |
| DF-A11Y-014 | Escape MUST close any dismissible overlay.                                                                             |
| DF-A11Y-015 | A skip-to-content link MUST be the first focusable element on every page.                                              |
| DF-A11Y-016 | Drag-and-drop reordering MUST have a keyboard equivalent.                                                              |
| DF-A11Y-017 | No keyboard trap MUST exist anywhere.                                                                                  |

### Shortcuts

| Key      | Action                        |
| -------- | ----------------------------- |
| `n`      | New Moment                    |
| `e`      | End the oldest pending Moment |
| `d`      | Dashboard                     |
| `c`      | Calendar                      |
| `a`      | Analytics                     |
| `/`      | Search                        |
| `Escape` | Close overlay                 |
| `?`      | Shortcut reference            |

| ID          | Requirement                                                                 |
| ----------- | --------------------------------------------------------------------------- |
| DF-A11Y-018 | Shortcuts MUST NOT fire while focus is in a text input.                     |
| DF-A11Y-019 | Shortcuts MUST be discoverable via `?` and MUST be disableable in settings. |

## 5. Screen readers

| ID          | Requirement                                                                                                    |
| ----------- | -------------------------------------------------------------------------------------------------------------- |
| DF-A11Y-020 | Semantic HTML MUST be used before ARIA. A `div` with `role="button"` is a defect where a `button` would serve. |
| DF-A11Y-021 | Every form control MUST have an associated label.                                                              |
| DF-A11Y-022 | Errors MUST be linked to their control with `aria-describedby` and announced.                                  |
| DF-A11Y-023 | Live regions MUST announce toasts, save confirmations and queue changes politely.                              |
| DF-A11Y-024 | Icon-only controls MUST have accessible names.                                                                 |
| DF-A11Y-025 | Every chart MUST have a text alternative or an equivalent data table.                                          |
| DF-A11Y-026 | Landmarks MUST be present: `banner`, `navigation`, `main`, `contentinfo`.                                      |
| DF-A11Y-027 | Headings MUST form a logical hierarchy with exactly one `h1` per page.                                         |
| DF-A11Y-028 | Route changes MUST be announced.                                                                               |
| DF-A11Y-029 | Elapsed-time updates on queue cards MUST NOT be announced on every tick.                                       |

DF-A11Y-029 matters: a live region updating each minute for two pending Moments would make
the dashboard unusable with a screen reader.

## 6. Touch and pointer

| ID          | Requirement                                                                       |
| ----------- | --------------------------------------------------------------------------------- |
| DF-A11Y-030 | Touch targets MUST be at least 44 by 44 CSS pixels.                               |
| DF-A11Y-031 | Adjacent targets MUST be separated by at least 8px.                               |
| DF-A11Y-032 | No functionality MUST depend on hover.                                            |
| DF-A11Y-033 | No functionality MUST depend solely on a gesture; a button equivalent MUST exist. |
| DF-A11Y-034 | Chart interactions MUST work by tap as well as by hover.                          |

## 7. Motion and preferences

| ID          | Requirement                                                                 |
| ----------- | --------------------------------------------------------------------------- |
| DF-A11Y-040 | `prefers-reduced-motion: reduce` MUST disable all non-essential animation.  |
| DF-A11Y-041 | Nothing MUST flash more than three times per second.                        |
| DF-A11Y-042 | `prefers-color-scheme` MUST be honoured when the theme setting is `system`. |
| DF-A11Y-043 | The interface MUST remain usable at 200% browser zoom.                      |
| DF-A11Y-044 | The interface MUST reflow without horizontal scrolling at 320px width.      |

## 8. Responsive breakpoints

| Name | Width         | Layout                                         |
| ---- | ------------- | ---------------------------------------------- |
| `xs` | 320-479px     | Single column, bottom navigation, sheets       |
| `sm` | 480-767px     | Single column, wider cards                     |
| `md` | 768-1023px    | Two columns where useful, icon rail navigation |
| `lg` | 1024-1439px   | Full sidebar, multi-column dashboard           |
| `xl` | 1440px and up | As `lg`, content capped at 1280px              |

320px is the floor, not 360px, because it is the width of the smallest devices still in
active use and because designing to it forces genuine content prioritisation.

| ID          | Requirement                                                                                               |
| ----------- | --------------------------------------------------------------------------------------------------------- |
| DF-A11Y-050 | Every screen MUST be fully functional at 320px.                                                           |
| DF-A11Y-051 | No horizontal scrolling MUST occur at any supported width, except within a chart that explicitly scrolls. |
| DF-A11Y-052 | Bottom navigation MUST respect `env(safe-area-inset-bottom)`.                                             |
| DF-A11Y-053 | Modals MUST present as bottom sheets below 768px.                                                         |
| DF-A11Y-054 | Charts MUST resize responsively without clipping labels.                                                  |
| DF-A11Y-055 | Tables MUST become card lists below 768px rather than scrolling horizontally.                             |

## 9. Performance budgets

Performance is an accessibility concern: the product must be usable on a mid-range Android
device on a slow connection, which is the reality for a large share of the intended
audience.

| Metric                               | Budget      |
| ------------------------------------ | ----------- |
| Largest Contentful Paint, p75        | Under 2.0s  |
| Interaction to Next Paint, p75       | Under 200ms |
| Cumulative Layout Shift              | Under 0.1   |
| Time to Interactive, mid-range phone | Under 3.5s  |
| Initial JavaScript, gzipped          | Under 200KB |
| Total JavaScript, gzipped            | Under 400KB |

| ID          | Requirement                                                           |
| ----------- | --------------------------------------------------------------------- |
| DF-A11Y-060 | Charts MUST be code-split and loaded only on screens that use them.   |
| DF-A11Y-061 | Images and icons MUST be sized to prevent layout shift.               |
| DF-A11Y-062 | Skeletons MUST match final content dimensions.                        |
| DF-A11Y-063 | Fonts MUST be system fonts, so there is no font loading shift at all. |
| DF-A11Y-064 | Aggregation MUST occur server-side, per DF-ANA-092.                   |

## 10. Internationalisation readiness

Not translated in 1.0, but not made untranslatable either.

| ID          | Requirement                                                               |
| ----------- | ------------------------------------------------------------------------- |
| DF-A11Y-070 | User-facing strings MUST NOT be concatenated from fragments.              |
| DF-A11Y-071 | Dates, times and numbers MUST be formatted through `Intl`, never by hand. |
| DF-A11Y-072 | Layouts MUST tolerate text expanding by 40%.                              |
| DF-A11Y-073 | `lang` MUST be set on the document element.                               |

## 11. Verification

| Method                   | Frequency          | Covers                            |
| ------------------------ | ------------------ | --------------------------------- |
| ESLint jsx-a11y          | Every commit       | Static markup issues              |
| axe-core in Playwright   | Every pull request | Automated WCAG violations         |
| Manual keyboard pass     | Every feature      | Focus order, traps, operability   |
| Screen reader spot check | Every release      | NVDA on Windows, VoiceOver on iOS |
| Zoom and reflow check    | Every release      | 200% zoom, 320px width            |
| Lighthouse               | Every release      | Performance budgets               |

Automated tooling catches perhaps 30% of real accessibility defects. The manual passes are
where the rest are found, and they are not optional.

---

## Change History

| Version | Date       | Author  | Change         |
| ------- | ---------- | ------- | -------------- |
| 0.1.0   | 2026-08-04 | Founder | Initial draft. |
