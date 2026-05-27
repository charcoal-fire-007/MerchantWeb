# Unified Product Application Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge existing-product and new-product application into one search-or-create product application flow.

**Architecture:** Keep the existing Vue single-file structure, but replace the explicit product application mode tabs with an intent derived from selection: existing product when a list option is selected, new product when the merchant chooses the no-result create CTA. Preserve backend payloads for `existing_product` and `new_product`.

**Tech Stack:** Vue 3 Composition API, TypeScript, Vite, Node test runner contract tests, plain CSS.

---

### Task 1: Contract Tests

**Files:**
- Modify: `tests/app-contract.test.ts`

- [ ] Write failing assertions that the product application UI no longer renders separate `申请已有商品` / `申请新增商品` mode buttons.
- [ ] Add assertions for the unified copy: `搜索商品，或输入想申请的新商品`, `没有找到「`, `申请新增商品「`, `已选择新增商品`.
- [ ] Add assertions that internal platform terms remain hidden.
- [ ] Run `npm.cmd test -- --run tests/app-contract.test.ts` and confirm the new assertions fail before implementation.

### Task 2: Vue State And Submission

**Files:**
- Modify: `src/App.vue`

- [ ] Remove explicit product application mode switching from the visible product application UI.
- [ ] Add derived helpers for searched draft name and whether the current application is existing or new.
- [ ] Add a create-new action that fills `newProductApplicationForm.product` from the search text and closes the picker.
- [ ] Add one submit handler that branches to the existing or new payload while keeping current backend contract intact.

### Task 3: Unified Picker UI

**Files:**
- Modify: `src/App.vue`
- Modify: `src/styles.css`

- [ ] Replace the two product application templates with one progressive form.
- [ ] Keep desktop dropdown and mobile bottom sheet, but add a no-result create CTA in both.
- [ ] Show selected existing/new product card below the picker.
- [ ] Show `品牌/型号补充（选填）` only for new product applications.

### Task 4: Verification

**Files:**
- Modify: `tests/app-contract.test.ts`
- Modify: `src/App.vue`
- Modify: `src/styles.css`

- [ ] Run `npm.cmd test -- --run tests/app-contract.test.ts`.
- [ ] Run `npm.cmd run build`.
- [ ] Run `git diff --check`.
