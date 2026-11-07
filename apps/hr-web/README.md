# MenaITech HR — frontend (step 2)

React 19 + TypeScript + Vite + Tailwind CSS v4 + React Router 7.

## Run

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production build
npm run preview    # serve the build
npm run lint
```

Demo sign-in (no backend), password of 6+ characters:

- `name.admin@company.com` → admin dashboard (`/dashboard`)
- `name.employee@company.com` → employee home (`/home`). Any email without `.admin` is treated as an employee.

## Structure

```
src/
  app/            App.tsx (providers) · router.tsx (routes)
  layouts/        AppLayout.tsx (sidebar + topbar + <Outlet/>)
  components/
    layout/       Sidebar.tsx · Topbar.tsx
    ui/           Button · Input · Logo · Card · Badge · Avatar · Modal
  features/auth/  AuthProvider.tsx · useAuth.ts · ProtectedRoute.tsx (role guards)
  features/employee/  mockData.ts · types.ts · components/ (7 home sections + modals)
  config/         navigation.ts (sidebar links)
  pages/          LoginPage · DashboardPage · EmployeeHomePage · NotFoundPage
  lib/            cn.ts · roles.ts · format.ts · initials.ts
  index.css       Tailwind import + design tokens (@theme)
```

## Adding a module later

1. Create the page in `src/pages/`.
2. Add a route under the admin or employee `ProtectedRoute` group in `src/app/router.tsx` with `handle: { title: '...' }`.
3. Add a link in `src/config/navigation.ts` with the roles that should see it.
