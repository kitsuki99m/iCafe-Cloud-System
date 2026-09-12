# Aezakmi Palette Branding Design

## Goal
Apply the approved Midnight Express / Dance of the Goddesses / New Wool / Bluish Black / Trillium / Paradise Grape palette consistently across Admin and Customer UI without changing functional behavior, rate/session logic, or semantic status meanings.

## Approved Palette
- Midnight Express: `#202937` — primary brand color in light mode and dark mode structure; primary buttons, active navigation, strong headings/icons, branded chart accents.
- Bluish Black: `#423D42` — secondary dark surface/text emphasis.
- Paradise Grape: `#766664` — muted brand accent and secondary emphasis.
- Trillium: `#A99898` — soft accent, hover/supporting states.
- New Wool: `#D4C1B9` — borders and raised neutral surfaces.
- Dance of the Goddesses: `#E6D7CD` — light cards/panels.
- Soft White: `#F5F5F5` — primary light canvas and light text on dark brand surfaces.

## Light Mode
The light canvas uses `#F5F5F5`. Cards and secondary panels use `#E6D7CD` and `#D4C1B9`. Midnight Express remains prominent in light mode for primary actions, selected navigation, headings, key icons, and high-emphasis controls. Bluish Black and Paradise Grape provide supporting text/accent contrast.

## Dark Mode
Dark mode uses Midnight Express and Bluish Black as structural surfaces, with the approved warm neutrals for readable text and borders. It should remain recognizably the same brand rather than reverting to the old black/orange theme.

## Semantic States
Success/available remains green, warning/low-time remains amber, danger/error remains red, and informational states remain distinguishable. These functional colors are not replaced with the brand palette when doing so would reduce comprehension.

## Components
Admin and Customer consume the same semantic Tailwind theme token names (`ink`, `surface`, `gold`, `slate`, etc.), but those tokens are remapped to the new palette. Existing components should update primarily through token changes rather than widespread one-off class replacement.

Primary `Button` styling changes to Midnight Express with Soft White text. Secondary/subtle/ghost controls use the warm neutral surfaces and Midnight/Paradise text. Existing semantic teal/danger variants remain functional.

## Branding Assets
Both Admin and Customer bundled `aktura-logo.svg` fallback assets use Midnight Express as the dominant logo background and Soft White for the internal A mark. Dynamically uploaded branding logos are never recolored.

## Hard-coded Bypasses
Legacy hard-coded orange/gold focus rings, chart brand accents, and old dark-mode colors that bypass shared tokens are updated to approved palette values. Semantic chart series such as revenue/success and expenses/danger remain green/red; neutral/net/brand series uses Midnight Express or Paradise Grape.

## Constraints
- Do not change backend/database behavior.
- Do not recolor uploaded dynamic logos.
- Do not alter rate calculations, session state, navigation behavior, or chart data.
- Preserve accessibility and recognizable status colors.
- Keep `#F5F5F5` as the white/light base requested by the user.
