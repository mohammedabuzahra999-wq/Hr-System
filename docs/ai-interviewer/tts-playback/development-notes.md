# Retained development attempts

- development-1: new test setup had a duplicate local declaration; transform failed
  before checks. Original failure log remains.
- development-2: initial server suite passed 21/21.
- development-3: UI passed 16/16; server stopped after 21 checks because the new
  replacement-generation test attempted rebind while ACTIVE. Corrected the setup
  to use the established disconnect → bind → connect → resume protocol; no existing
  production gate or assertion was weakened.
- development-4: expanded server suite passed 29/29. Native suite stopped at 14/15
  waiting for READY while implementation was still being edited; that original
  failure remains. The exact cause of this untraced attempt is not asserted.
- development-5: native Chrome suite passed 28/28 with response diagnostics.
- development-6: server passed 30/30 including the controlled warning-version
  window; UI passed 18/18. The final UI suite additionally tests retry after local
  playback loss and is 19 checks.

Direct workspace type checks initially caught an unused import and the new test's
duplicate declaration. Both were corrected. Subsequent checks passed with the two
existing unrelated lint warnings. Final evidence uses the complete guarded final
run and exact source manifest, not development totals. No failed result was deleted
or overwritten, no actual credential used, and no provider/model API called.
