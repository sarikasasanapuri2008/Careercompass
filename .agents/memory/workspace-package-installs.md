---
name: Workspace package installs
description: Replit package-install behavior in this pnpm monorepo.
---

When a dependency belongs to a workspace package, a generic package-install operation may target the monorepo root and fail. Use a scoped pnpm command with the package's workspace filter; run a full workspace install if package links are missing.

**Why:** The package-install operation attempted to add a dependency at the workspace root, while the filtered pnpm command succeeded.

**How to apply:** For a dependency used by one workspace, install it with `pnpm --filter @workspace/<package> add <dependency>` and use `pnpm install` to refresh workspace links if needed.
