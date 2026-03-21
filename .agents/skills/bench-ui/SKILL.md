---
name: bench-ui
description: Bench UI — React, Vite, TypeScript, Tailwind, shadcn/ui, side panels, tokens, flow editor, infrastructure diagram. Use for any work under ui/, frontend components, pages, styling, hooks, or UX. Invoke before or while changing the Bench frontend; required for UI-related tasks in this repo.
---

# UI Guidelines for Bench

**Invoke this skill whenever you touch `ui/`**, build or modify components, pages, styling, or user-facing behavior. It complements **bench-development** (repo-wide) with UI-specific patterns.

When building or modifying frontend components, follow these UI guidelines derived from the existing layout and component patterns of the Bench project.

## Core Stack & Dependencies
- **UI Framework**: React 19, Vite, TypeScript.
- **Styling**: Tailwind CSS (`@tailwindcss/vite`), `clsx`, `tailwind-merge`, and `class-variance-authority` (cva).
- **Icons**: Lucide React.
- **Components**: **shadcn/ui** components located in `ui/src/components/ui/`. These are Radix UI primitives styled with Tailwind CSS (e.g., `Button`, `Dialog`, `Sheet`, `Sidebar`, etc.).

## Layout & Patterns
- **Right-Side Panels**: Use context-driven side panels (`flow-step-panel.tsx`, `database-panel.tsx`) mounted on the right or overlaying via `Sheet` when displaying detailed configuration or table views. Panels should have a top header with a title, a close button (`X` icon), and potentially action buttons (e.g., `Trash2` for delete).
- **Resizable Panels**: Implementation often involves an invisible resize bar (`cursor-col-resize`) to adjust the panel width, storing user preference in `localStorage`.
- **Dialogs**: Use for confirmations (e.g., `confirm-delete-dialog.tsx`) or short forms.
- **Tables**: Data-heavy views like `database-table-list.tsx` should effectively present data columns. Use appropriate grid or table layouts using Tailwind classes (`grid`, `flex`, `table`).

## Aesthetics & Rules
- **Themes**: Default into a clean, modern interface matching the Shadcn aesthetic. Support dark/light tokens relying on CSS variables (e.g., `bg-sidebar`, `text-sidebar-foreground`, `border-sidebar-border`).
- **Form Controls**: Use controlled inputs bound properly to state. Keep spacing consistent using standard Tailwind spacing (`p-4`, `gap-2`).
- **Icons**: Always stick to `lucide-react`. Use `size-4` (16px) or `size-5` (20px) standard sizes.
- **Loading & Error States**: Leverage `@tanstack/react-query` to gracefully handle `isLoading` and `isError` states visually.

## Development & Verification
- **Running Locally**: Use `./dev.sh` to run both the API and UI. This is **required** when verifying UI interactions and data fetching.
