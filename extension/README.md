# Commodity AI: Price Check — v0.2.6

An unpacked Chrome/Edge extension for Shopee Thailand and Lazada Thailand.
All interface text is English; item prices are in THB. Original listing titles
are preserved. Requires the accompanying v2 backend; there are no mock prices.

## Local setup

Run the API from [commodity-ai-backend](https://github.com/MobyDIGG-commidtyAI/commodity-ai-backend):

    PYTHONPATH=src python -m uvicorn api.app:app --host 127.0.0.1 --port 8000

1. Open edge://extensions or chrome://extensions and enable Developer mode.
2. Load unpacked and select this extension directory.
3. Open extension Settings, save the API address, and test the connection.
4. Open a GPU, RAM DDR4/DDR5, or NVMe/SATA SSD listing.
5. Select **View price breakdown** for the full receipt.

For release, `python scripts/build_extension.py <https API URL>` writes
`dist/commodity-ai-extension-<version>.zip` with that URL as the default and only the
shops plus that origin in host_permissions.

Loading or reloading an installed extension is a manual step. Packaging does not
change any browser installation. The default address is http://localhost:8000.
The manifest also allows the existing Cloud Run and Railway host patterns.
For the isolated preview, set the API address to http://127.0.0.1:8011.
Version 0.2.1 adds explicit localhost/127.0.0.1 permissions for ports 8000 and
8011. Reload the unpacked extension and refresh existing product tabs after updating.
Version 0.2.5 uses the selected product option. If none is selected, it selects
the first enabled option in each product-option group, then waits for the page
to update. RAM kits use total capacity once. Explicit WD SA510 option SKUs are
recognized; ambiguous translated units are not guessed. A product-area price
range is withheld, not replaced by its minimum. Conflicting generations remain
unassessed unless an explicit description block resolves the selected option.
The Mall landing page is not a product page.

## Reading the receipt

Version 0.2.6 compares a single listing price with the displayed reference band
independently of seasonal/outlook status and validation counts. Stale reference/FX
or unverified product options add a Provisional warning rather than suppressing
the price comparison. This does not turn a historical or assumed-product
comparison into a current Thai-market valuation. Missing price/band still prevents
a verdict; seasonal and forecast quality gates are unchanged.

- **Price:** Below / Within / Above a US reference converted to THB, not a calibrated
  Thai matched-product fair value. Category references do not control for all specs.
- **Timing:** Detrended calendar history. Buying-season labels require at least two
  qualifying years passing leave-one-year-out checks.
- **Next 90 days:** Forecast status requires 12 observed-target rolling tests and
  at least 5% MAE improvement over carry. Otherwise an illustrative scenario is
  labelled, or the outlook is withheld when evidence is missing or stale.
- **History:** Raw means filled prices without EMA. EMA 30D smooths that history.
  Observed points and gaps over 30 days are marked. Interpolation never supplies
  evaluation targets. FX is held constant for displayed history and outlook.
- **Variants:** The selected option and product-area price travel together to the
  API and receipt. Confirm manually when they cannot be paired. M.2 alone never
  means NVMe. No cart or checkout actions are performed automatically.

The backend retains its last verified snapshot during an invalid replacement.
The pipeline publishes atomically; the backend reloads without restart. Source
observation age is displayed separately from snapshot age. Undated Thai catalog
snapshots are excluded from calibration.

## Checks and package

    node --test extension/test/
    python -m pytest -q
    python scripts/build_extension.py https://<api-origin>

Extract the ZIP before using Load unpacked. It contains the extension only; the API runs
separately. See docs/assessment-v2.md in commodity-ai-backend for the method.
