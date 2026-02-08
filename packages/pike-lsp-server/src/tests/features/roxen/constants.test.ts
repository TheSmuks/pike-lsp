import assert from "node:assert";
import { MODULE_TAG, MODULE_LOCATION, MODULE_FILTER, MODULE_EXTENSION, MODULE_URL, MODULE_AUTH,
         TYPE_STRING, TYPE_FILE, VAR_TYPE_MASK, MODULE_TYPE_MASK } from "../../../features/roxen/constants.js";

describe("Roxen Constants - match Roxen headers", () => {
    test("MODULE_TAG equals 1 << 4 (16)", () => { assert.strictEqual(MODULE_TAG, 16); });
    test("MODULE_LOCATION equals 1 << 1 (2)", () => { assert.strictEqual(MODULE_LOCATION, 2); });
    test("MODULE_FILTER equals 1 << 13 (8192)", () => { assert.strictEqual(MODULE_FILTER, 8192); });
    test("MODULE_EXTENSION equals 1 << 0 (1)", () => { assert.strictEqual(MODULE_EXTENSION, 1); });
    test("MODULE_URL equals 1 << 2 (4)", () => { assert.strictEqual(MODULE_URL, 4); });
    test("MODULE_AUTH equals 1 << 7 (128)", () => { assert.strictEqual(MODULE_AUTH, 128); });
    test("TYPE_STRING equals 1", () => { assert.strictEqual(TYPE_STRING, 1); });
    test("TYPE_FILE equals 2", () => { assert.strictEqual(TYPE_FILE, 2); });
    test("VAR_TYPE_MASK equals 0xFF", () => { assert.strictEqual(VAR_TYPE_MASK, 0xFF); });
    test("MODULE_TYPE_MASK equals (1 << 27) - 1", () => { assert.strictEqual(MODULE_TYPE_MASK, (1 << 27) - 1); });
});
