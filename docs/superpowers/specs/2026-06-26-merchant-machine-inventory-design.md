# Merchant Machine Inventory Snapshot Design

## Goal

Add a new merchant Web page named `机器库存` for one-time or periodic machine inventory snapshot collection.

Merchants select machines from two sources, enter only the current stock quantity for each machine, and submit the batch as one inventory snapshot. The platform keeps submission history and exposes the latest quantity per merchant and machine.

## Confirmed Product Decisions

- Main navigation label: `机器库存`
- Page title: `机器库存`
- Submit button: `提交库存快照`
- First version is inventory snapshot collection, not real-time stock locking.
- Each selected machine only requires one field: `库存数量`.
- Submit mode is batch-only: merchants fill multiple rows and submit once.
- Top-right duplicate submit button is removed; only the inventory list footer has the submit button.
- The machine picker header is compact: `选择机器`, search input, and source tabs in one toolbar.
- The page avoids explanatory copy and behaves like an operation surface.

## Machine Sources

### 我的商品

Use the merchant's existing product list from商品管理. These are products already assigned to the merchant through `merchant_product_access`.

Rows show short source and status labels:

- `我的商品`
- `接单中`
- `已暂停`

### 平台机器库

Use the platform product catalog. Merchants can search and select enabled catalog machines even if they are not assigned to the merchant yet.

Rows show:

- `平台库`
- `待申请`

When submitted, the backend records the inventory quantity and creates or reuses a pending product application. It must not automatically enable product access or make the machine enter the可接单 area.

## Frontend Design

The `机器库存` page is a new `navActive` section in the existing single-page Vue app.

Desktop layout:

- Left panel: compact machine picker
  - Toolbar: `选择机器`, search input, `我的商品 / 平台机器库` segmented control
  - List rows: product name, source/status chips, `加入`
- Right panel: `上报清单`
  - Selected machines as compact cards
  - Each card has product name, source label, `库存数量` numeric input, and `移除`
  - Footer has one primary `提交库存快照` button

Mobile layout:

- Same content order, stacked vertically.
- Machine picker appears first.
- `上报清单` appears below.
- The submit button stays at the bottom of the list card.

Validation:

- At least one machine must be selected.
- Each selected machine must have an integer quantity.
- Quantity must be `0` or greater.
- Duplicate rule ids cannot appear in the same submission.

## Backend Design

The canonical backend is `CentralizedDataHub`.

Add inventory snapshot storage:

- `merchant_inventory_submissions`
  - one row per batch submission
  - merchant, app, submitted_at, source
- `merchant_inventory_items`
  - one row per submitted machine
  - references submission
  - merchant, app, rule_id, product, source_type, quantity
  - stores `product_application_id` when a platform catalog item requires an application

Latest inventory is derived by querying the newest item per merchant/app/rule_id. If implementation benefits from it, add a read-only latest endpoint rather than maintaining a duplicate latest table in v1.

Merchant endpoints:

- `GET /api/merchant/inventory/options`
  - returns `owned` and `catalog` options
  - `owned` comes from enabled merchant product access
  - `catalog` comes from enabled platform product catalog, excluding owned items
- `POST /api/merchant/inventory/snapshots`
  - accepts batch items with `rule_id`, `source_type`, and `quantity`
  - validates that owned items belong to the merchant
  - validates that catalog items exist and are enabled
  - creates/reuses a product application for catalog items that are not already assigned
  - records one submission and item rows
  - returns the saved submission and item list
- `GET /api/merchant/inventory/latest`
  - returns the merchant's latest inventory quantities for prefill and confirmation

Platform/data endpoints:

- `GET /api/platform/merchant-inventory/latest`
  - token-protected platform endpoint
  - returns latest inventory rows for data relay or centralized views
- `GET /api/platform/merchant-inventory/submissions`
  - optional history endpoint for audit or admin views

## Product Application Rules

When a catalog item is submitted and the merchant does not already have product access:

- If an active `existing_product` application already exists for the same merchant and rule id, reuse it.
- Otherwise create `MerchantProductApplication` with:
  - `application_type = "existing_product"`
  - `status = "submitted"`
  - `product`, `product_id`, `rule_id` from catalog
  - `reason = "库存上报自动生成"`
- Do not create duplicate active applications.
- Do not create `MerchantProductAccess`.

## Data Visibility

The data relay platform must be able to see:

- merchant id
- merchant name
- app code
- rule id
- product name
- quantity
- source type: `owned` or `catalog`
- submitted at
- product application id, when applicable

## Tests

Backend contract tests should assert:

- SQL/init schema includes inventory submission and item tables.
- Runtime migrations create both tables and indexes.
- Models define `MerchantInventorySubmission` and `MerchantInventoryItem`.
- Schemas define inventory option, snapshot payload, snapshot response, and latest response types.
- Merchant router exposes options, submit snapshot, and latest endpoints.
- Submit snapshot validates non-negative integer quantity.
- Submit snapshot creates/reuses product applications for catalog items.
- Platform router exposes latest inventory read endpoint.

Frontend contract tests should assert:

- Navigation includes `机器库存`.
- `navActiveIndex` accounts for five main nav entries.
- The inventory page renders only one `提交库存快照` button in the list footer.
- Picker toolbar combines `选择机器`, search input, and source tabs.
- Page labels include `我的商品`, `平台机器库`, `平台库`, `待申请`, `上报清单`, `库存数量`.
- API client exposes inventory option, snapshot submit, and latest inventory methods.

## Out Of Scope

- Real-time stock locking.
- Order occupancy and return release.
- Inventory decrement from dispatches.
- Admin inventory editing.
- Merchant-entered free-text machine names.
- Automatic product access enablement.
