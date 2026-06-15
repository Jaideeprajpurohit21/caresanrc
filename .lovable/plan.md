## Problem

In the admin section, every tab (Dashboard, Facilities, Rooms & QR, Staff, Shifts, Reports) shows the same Dashboard screen.

Root cause: `src/routes/_authenticated.admin.tsx` is both the page at `/admin` and the parent of `/admin/facilities`, `/admin/rooms`, `/admin/staff`, `/admin/shifts`, `/admin/reports`. In TanStack Router, when a route has children, its component must render `<Outlet />` so child routes can mount. Today it renders the Dashboard UI directly — so the URL updates and the child route matches, but the child component has nowhere to render, and the Dashboard stays on screen.

## Fix

Convert `/admin` into a pure layout and move the dashboard to its own index leaf.

1. **Rewrite `src/routes/_authenticated.admin.tsx`** to be a thin layout: just `createFileRoute("/_authenticated/admin")` with `component: () => <Outlet />`. No dashboard UI, no data fetching.
2. **Create `src/routes/_authenticated.admin.index.tsx`** containing the existing `AdminDashboard` component, its server-fn query, head meta, and the `Stat` helper — registered as `createFileRoute("/_authenticated/admin/")`. This becomes the page that renders at `/admin`.
3. Leave the other admin routes (`facilities`, `rooms`, `rooms.print`, `staff`, `shifts`, `reports`) and the `AppShell` nav unchanged. The router plugin regenerates `routeTree.gen.ts`; no manual edits there.

## Verify

- Click each tab in the admin nav — Dashboard, Facilities, Rooms & QR, Staff, Shifts, Reports — and confirm the URL and the rendered screen both change.
- `/admin` still loads the Dashboard with live stats.
- `/admin/rooms/print` (the nested print view) still works.
