# SOP: Trackence iOS Safari Performance Rules (Enforceable)

## Objective
Make iPhone Safari performance consistently smooth while preserving intentional design.

Non-negotiable outcomes:
1. No visible typing lag on auth inputs.
2. No recurring frame stutter on QR and admin live pages.
3. No repeated long tasks over 50ms during core interactions.

## Rule 1: React Render Budget
Policy:
1. No component should re-render more than once per user interaction target path.
2. High-frequency components must not pass fresh inline objects or arrays as props.
3. Any component re-rendering more than 5 times per second must be memoized or refactored.

Pass criteria:
1. React Profiler traces on iPhone show stable commit frequency under interaction.
2. Hot components on QR/admin pages stay under 5 renders per second in steady state.

Primary files:
1. [client/src/pages/QRScanner.tsx](client/src/pages/QRScanner.tsx)
2. [client/src/pages/QRFullscreen.tsx](client/src/pages/QRFullscreen.tsx)
3. [client/src/pages/adminSessions/AdminSessionManagementPage.tsx](client/src/pages/adminSessions/AdminSessionManagementPage.tsx)
4. [client/src/pages/absences/AbsenceTable.tsx](client/src/pages/absences/AbsenceTable.tsx)

## Rule 2: Layout Stability
Policy:
1. Do not mix DOM reads and writes in the same frame where avoidable.
2. Avoid forced layout reads in loops.
3. Batch UI updates with requestAnimationFrame when needed.

Forbidden patterns in hot loops:
1. offsetHeight
2. getBoundingClientRect in iterative loops

Pass criteria:
1. No layout-thrash spikes in Safari Performance timeline for target flows.

## Rule 3: iOS Animation Limits
Policy:
1. Maximum concurrent animated elements on iOS: 5.
2. Only transform and opacity animations are allowed.
3. Disable blur animations, gradient animations, and scroll-linked animations in iOS mode.

Pass criteria:
1. No continuous animation-driven main-thread pressure on iPhone idle screens.

## Rule 4: Blur Policy
Policy:
1. Glassmorphism is allowed only in Navbar on iOS mode.
2. All other backdrop-filter and blur effects must be disabled in iOS mode.

Pass criteria:
1. iOS perf mode preserves navbar glass surfaces only.
2. Non-navbar blur effects are absent in computed styles.

Primary files:
1. [client/src/styles/global.css](client/src/styles/global.css)
2. [client/src/components/Navbar.tsx](client/src/components/Navbar.tsx)

## Rule 5: Main Thread Budget
Policy:
1. Target frame budget: 16ms per frame.
2. No single JS task should exceed 50ms during core flows.
3. If exceeded, split logic, defer work, or offload work.

Pass criteria:
1. Safari trace shows no recurring long tasks over 50ms while typing, scanning, or live-updating sessions.

## Rule 6: Socket Update Rules
Policy:
1. Batch socket-driven refresh intent within 500ms windows.
2. Throttle silent refresh calls with a minimum 1 second interval.
3. Deduplicate identical refresh triggers while one refresh is queued.

Pass criteria:
1. Network timeline shows no refresh storms from clustered socket events.
2. Refresh cadence respects 500ms batching and >=1s throttle.

Primary files:
1. [client/src/pages/adminSessions/AdminSessionManagementPage.tsx](client/src/pages/adminSessions/AdminSessionManagementPage.tsx)
2. [client/src/pages/sessionHistory/SessionHistoryPage.tsx](client/src/pages/sessionHistory/SessionHistoryPage.tsx)
3. [client/src/services/socket.service.ts](client/src/services/socket.service.ts)

## Rule 7: iOS Detection Standard
Policy:
1. Use one shared detection utility only.
2. Do not duplicate iOS regex checks in components/services.

Implementation standard:
1. Use [client/src/utils/device.ts](client/src/utils/device.ts)

Pass criteria:
1. No ad hoc iOS detection regex usage outside the shared utility.

## Rule 8: iOS Performance Mode Architecture
Policy:
1. Use a single root class: ios-perf-mode.
2. Degradation behavior must be CSS-driven or feature-flag-driven.
3. Avoid scattered component-level conditionals unless unavoidable for logic loops.

Pass criteria:
1. iOS degradation is consistently controlled from root class and shared utility.

Primary files:
1. [client/src/App.tsx](client/src/App.tsx)
2. [client/src/styles/global.css](client/src/styles/global.css)

## Mandatory Profiling Procedure
Tools:
1. Safari Web Inspector on real iPhone.
2. React Profiler.

Record these flows each release:
1. Login typing
2. SignUp typing
3. QR scanner active scan loop
4. QR fullscreen live attendance
5. Admin session management live updates
6. Session history with socket and polling active

## Merge Gate Checklist (Fail-fast)
A change must not merge if any item fails:
1. Typing lag is visible on iPhone auth forms.
2. Any recurring task exceeds 50ms in target flows.
3. Socket updates trigger burst refresh storms.
4. Non-navbar blur/backdrop effects remain active in iOS mode.
5. More than one iOS detection implementation is present.
6. client build fails.

## Current Status in Codebase
Implemented:
1. Shared iOS utility and root ios-perf-mode architecture.
2. iOS websocket transport preference to reduce polling overhead.
3. QR/admin/session pages include batched and throttled silent refresh handling.
4. Auth and visual iOS perf-mode reductions with navbar glass preservation.

Remaining recommended work:
1. Add virtualization for very large tables if dataset size grows.
2. Add lightweight iOS performance telemetry for regression alerting.
