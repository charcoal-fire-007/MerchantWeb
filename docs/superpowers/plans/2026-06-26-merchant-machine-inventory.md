# Merchant Machine Inventory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a merchant-facing `机器库存` page and backend inventory snapshot APIs so merchants can batch submit current machine quantities.

**Architecture:** CentralizedDataHub stores inventory submissions and items, derives latest inventory per merchant/app/rule_id, and creates or reuses product applications for catalog-only items. MerchantWeb adds a fifth nav page that combines owned product selection, platform catalog selection, quantity entry, and one footer submit action.

**Tech Stack:** Vue 3 + TypeScript + Vite for MerchantWeb; FastAPI + SQLAlchemy + PostgreSQL + contract-style unittest tests for CentralizedDataHub.

---

## File Map

- Modify `D:\‪Program Data\Git DeData\CentralizedDataHub\backend\app\models.py`
  Add `MerchantInventorySubmission` and `MerchantInventoryItem`.
- Modify `D:\‪Program Data\Git DeData\CentralizedDataHub\db\init\001_stage0.sql`
  Add SQL tables and indexes.
- Modify `D:\‪Program Data\Git DeData\CentralizedDataHub\backend\app\db.py`
  Add runtime migrations for deployed databases.
- Modify `D:\‪Program Data\Git DeData\CentralizedDataHub\backend\app\schemas.py`
  Add merchant/platform inventory schemas.
- Modify `D:\‪Program Data\Git DeData\CentralizedDataHub\backend\app\routers\merchant.py`
  Add inventory options, latest, and snapshot submission endpoints.
- Modify `D:\‪Program Data\Git DeData\CentralizedDataHub\backend\app\routers\platform.py`
  Add platform latest inventory endpoint.
- Create `D:\‪Program Data\Git DeData\CentralizedDataHub\backend\tests\test_merchant_inventory_contract.py`
  Contract coverage for backend storage and APIs.
- Modify `D:\‪Program Data\Git DeData\MerchantWeb\src\api.ts`
  Add inventory types and API methods.
- Modify `D:\‪Program Data\Git DeData\MerchantWeb\src\App.vue`
  Add nav item, state, computed lists, submit flow, and page template.
- Modify `D:\‪Program Data\Git DeData\MerchantWeb\src\styles.css`
  Add compact inventory page styles and mobile layout.
- Modify `D:\‪Program Data\Git DeData\MerchantWeb\tests\app-contract.test.ts`
  Add frontend contract tests.

## Task 1: Backend Inventory Contract Tests

**Files:**
- Create: `D:\‪Program Data\Git DeData\CentralizedDataHub\backend\tests\test_merchant_inventory_contract.py`

- [ ] **Step 1: Write failing backend contract tests**

Create tests that read source files and assert these strings exist:

```python
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[2]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


class MerchantInventoryContractTests(unittest.TestCase):
    def test_sql_defines_inventory_tables(self):
        sql = read("db/init/001_stage0.sql")
        self.assertIn("CREATE TABLE IF NOT EXISTS merchant_inventory_submissions", sql)
        self.assertIn("CREATE TABLE IF NOT EXISTS merchant_inventory_items", sql)
        self.assertIn("idx_merchant_inventory_items_latest", sql)

    def test_runtime_migrations_create_inventory_tables(self):
        source = read("backend/app/db.py")
        self.assertIn("CREATE TABLE IF NOT EXISTS merchant_inventory_submissions", source)
        self.assertIn("CREATE TABLE IF NOT EXISTS merchant_inventory_items", source)

    def test_models_define_inventory_entities(self):
        source = read("backend/app/models.py")
        self.assertIn("class MerchantInventorySubmission(TimestampMixin, Base):", source)
        self.assertIn("class MerchantInventoryItem(TimestampMixin, Base):", source)
        self.assertIn('__tablename__ = "merchant_inventory_items"', source)

    def test_schemas_define_inventory_contracts(self):
        source = read("backend/app/schemas.py")
        for name in [
            "MerchantInventoryOption",
            "MerchantInventoryOptionsResponse",
            "MerchantInventorySnapshotCreate",
            "MerchantInventorySnapshotRead",
            "MerchantInventoryLatestResponse",
            "PlatformMerchantInventoryLatestResponse",
        ]:
            self.assertIn(f"class {name}", source)
        self.assertIn("quantity: int = Field(ge=0)", source)

    def test_merchant_router_exposes_inventory_endpoints(self):
        source = read("backend/app/routers/merchant.py")
        self.assertIn('"/inventory/options"', source)
        self.assertIn('"/inventory/snapshots"', source)
        self.assertIn('"/inventory/latest"', source)
        self.assertIn("MerchantProductApplication(", source)
        self.assertIn('"库存上报自动生成"', source)

    def test_platform_router_exposes_inventory_latest_endpoint(self):
        source = read("backend/app/routers/platform.py")
        self.assertIn('"/merchant-inventory/latest"', source)
        self.assertIn("PlatformMerchantInventoryLatestResponse", source)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Verify RED**

Run:

```powershell
python -m unittest backend.tests.test_merchant_inventory_contract -v
```

Expected: failures for missing inventory tables/classes/endpoints.

## Task 2: Backend Storage, Schemas, and Endpoints

**Files:**
- Modify: `backend/app/models.py`
- Modify: `db/init/001_stage0.sql`
- Modify: `backend/app/db.py`
- Modify: `backend/app/schemas.py`
- Modify: `backend/app/routers/merchant.py`
- Modify: `backend/app/routers/platform.py`

- [ ] **Step 1: Add models and SQL**

Add submission/item models with UUID ids, platform app, merchant, product/rule fields, source type, quantity, optional application id, and timestamps. Add SQL tables and indexes in init SQL plus runtime migrations.

- [ ] **Step 2: Add schemas**

Define option, snapshot create/read, latest item/response, and platform latest response models. Quantity uses `Field(ge=0)`.

- [ ] **Step 3: Add merchant option endpoint**

`GET /api/merchant/inventory/options` returns:

- `owned`: enabled `MerchantProductAccess` rows for the merchant.
- `catalog`: enabled `PlatformProductCatalog` rows excluding owned rule ids.

- [ ] **Step 4: Add snapshot submit endpoint**

`POST /api/merchant/inventory/snapshots` validates batch rows, creates a submission row, creates item rows, and creates/reuses active `existing_product` applications for catalog-only items.

- [ ] **Step 5: Add latest endpoints**

Add merchant latest and platform latest inventory endpoints by selecting inventory items ordered newest first and deduping by merchant/app/rule_id.

- [ ] **Step 6: Verify GREEN**

Run:

```powershell
python -m unittest backend.tests.test_merchant_inventory_contract -v
python -m unittest discover backend/tests -v
python -m compileall backend/app
```

Expected: inventory contract tests and existing tests pass.

## Task 3: Frontend API and Contract Tests

**Files:**
- Modify: `D:\‪Program Data\Git DeData\MerchantWeb\src\api.ts`
- Modify: `D:\‪Program Data\Git DeData\MerchantWeb\tests\app-contract.test.ts`

- [ ] **Step 1: Add failing frontend contract assertions**

Add tests asserting:

- `type InventorySourceType = 'owned' | 'catalog'`
- inventory option/latest/snapshot interfaces exist
- `listInventoryOptions`, `listLatestInventory`, and `submitInventorySnapshot` exist
- nav active index maps `inventory`
- template has `navActive === 'inventory'`
- page labels include `机器库存`, `选择机器`, `上报清单`, `库存数量`, `平台库`, `待申请`
- there is no top header submit button pattern for inventory page; submit is inside inventory list footer

- [ ] **Step 2: Verify RED**

Run:

```powershell
npm test
```

Expected: frontend contract tests fail because inventory API/page is not implemented.

## Task 4: Frontend Inventory Page

**Files:**
- Modify: `src/api.ts`
- Modify: `src/App.vue`
- Modify: `src/styles.css`

- [ ] **Step 1: Add API types/methods**

Add inventory interfaces and methods:

- `listInventoryOptions()`
- `listLatestInventory()`
- `submitInventorySnapshot(items)`

- [ ] **Step 2: Add page state and computed lists**

Add selected inventory rows keyed by source/rule id, search keyword, source tab, quantity validation, and submit/loading messages.

- [ ] **Step 3: Add nav and page template**

Add a fifth nav item `机器库存`, update `navActiveIndex`, and render compact layout:

- header title only
- no top-right submit button
- compact picker toolbar
- `上报清单` with footer submit button

- [ ] **Step 4: Add styles**

Add responsive CSS classes for desktop two-column layout and mobile stacked layout. Keep the page text-light and compact.

- [ ] **Step 5: Verify GREEN**

Run:

```powershell
npm test
npm run build
```

Expected: all MerchantWeb tests and build pass.

## Task 5: Integrated Review and Verification

**Files:**
- Review both repositories.

- [ ] **Step 1: Run full verification**

Run:

```powershell
cd "D:\‪Program Data\Git DeData\CentralizedDataHub"
python -m unittest discover backend/tests -v
python -m compileall backend/app
node frontend/tests/test_layout_structure.mjs
cd frontend
npm run build

cd "D:\‪Program Data\Git DeData\MerchantWeb"
npm test
npm run build
```

- [ ] **Step 2: Request subagent review**

Dispatch reviewers for:

- backend schema/API/data behavior
- frontend UX/API behavior

- [ ] **Step 3: Fix review findings and rerun verification**

Fix critical/important findings. Rerun relevant tests and builds before final report.
