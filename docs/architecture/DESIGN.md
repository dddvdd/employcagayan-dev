# Trabaho Caravan — Project Design Guide

## Visual direction

Build a clear, dependable public employment service for job seekers, employers, and PESO staff. Favor trust, legibility, and direct task completion over decorative novelty. Preserve the existing Trabaho Caravan / Quest Board identity.

## Existing visual language

- React and Tailwind CSS are the current frontend stack. Reuse existing components and utilities.
- Inter/system sans typography is the current base. Use a clear size and weight hierarchy.
- Blue is the primary action color; slate neutrals support surfaces and text. Keep status colors consistent with their meaning.
- The app supports light and dark themes through the root `.dark` class. New surfaces and controls should work in both.
- Existing pixel-art details belong to the Quest Board. Use them selectively where that visual context already exists; keep administrative workflows quieter.

## Component and layout guidance

- Keep pages responsive from 320px upward. Use readable content widths and consistent spacing.
- Use clear headings, visible labels, helpful inline instructions, and explicit loading, empty, and error states.
- Inputs and buttons should have visible hover and keyboard focus states, accessible names, and comfortable touch targets.
- Prefer restrained borders, radii, and shadows. Avoid ornamental gradients or motion that compete with the task.
- Use semantic links for navigation and buttons for actions. Respect reduced-motion preferences.

## Guardrails

- Do not invent government seals, official claims, partner logos, or trust statistics.
- Do not apply another company's brand guide as if it were the product's own identity.
- Preserve the existing authentication, routing, and data workflows when changing presentation.
