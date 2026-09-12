# Admin Dark Secondary Gold Accent Design

## Goal
Use a restrained champagne-gold accent for secondary text in Admin dark mode while preserving the cool Midnight-led structural hierarchy and all light-mode colors.

## Design
- Dark-mode secondary/supporting text token: `#C9B27A`.
- Primary headings, values, and critical labels remain Soft White (`#F5F5F5`).
- Semantic success/warning/error colors remain unchanged.
- Structural dark surfaces remain Midnight/deep blue-gray; gold is text/accent only, never a large background surface.
- Analytics chart axis, legend, tooltip body, and other secondary chart labels use the same `#C9B27A` for visual consistency.
- Light mode remains unchanged.

## Verification
Regression coverage must assert the dark secondary token and Analytics chart text color while confirming light-mode secondary text remains `#423D42`.
