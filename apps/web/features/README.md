# features

Empty in this Sprint — no feature has business logic yet (Agent 1 scaffolds
routing/layout only, Engineering Constitution Article VIII). TDD §5's
intended convention for whoever adds the first feature:

```
/features/<feature>/actions      — Server Actions (thin: requirePermission(), validate with Zod, call @aaf/core, return ActionResult)
/features/<feature>/components   — feature-specific React components
/features/<feature>/schemas      — Zod schemas for form validation
```

See `apps/web/lib/auth/guard.ts` (`requirePermission`) and
`apps/web/lib/auth/action.ts` (`withActionErrorHandling`) for the two
utilities every Server Action in a future feature should start with.
