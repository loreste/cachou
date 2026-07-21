import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { applySelectValue, reapplySelectValue, isHTMLSelect } from "../../src/select-bind.js";

function mockSelect(optionValues = []) {
  const options = optionValues.map(value => {
    const opt = {
      value: String(value),
      selected: false
    };
    return opt;
  });
  const select = {
    nodeType: 1,
    tagName: "SELECT",
    multiple: false,
    options,
    selectedIndex: -1,
    _value: ""
  };
  Object.defineProperty(select, "value", {
    get() {
      return this._value;
    },
    set(v) {
      const next = String(v);
      const match = this.options.find(o => o.value === next);
      if (match) {
        this._value = next;
        this.options.forEach(o => {
          o.selected = o.value === next;
        });
        this.selectedIndex = this.options.indexOf(match);
      } else {
        // Browser behavior: ignore unknown value if options exist; keep empty if not.
        if (this.options.length === 0) {
          this._value = next;
        }
      }
    }
  });
  return select;
}

describe("select-bind", () => {
  it("isHTMLSelect detects SELECT nodes", () => {
    assert.equal(isHTMLSelect(mockSelect()), true);
    assert.equal(isHTMLSelect({ nodeType: 1, tagName: "DIV" }), false);
    assert.equal(isHTMLSelect(null), false);
  });

  it("remembers value when options are empty then reapplies", () => {
    const select = mockSelect([]);
    applySelectValue(select, "b");
    assert.equal(select.$$cachouSelectValue, "b");
    // Options appear later
    select.options.push({ value: "a", selected: false }, { value: "b", selected: false });
    reapplySelectValue(select);
    assert.equal(select.value, "b");
    assert.equal(select.options[1].selected, true);
  });

  it("applies immediately when matching option exists", () => {
    const select = mockSelect(["a", "b", "c"]);
    applySelectValue(select, "c");
    assert.equal(select.value, "c");
  });

  it("supports multi-select arrays", () => {
    const select = mockSelect(["a", "b", "c"]);
    select.multiple = true;
    applySelectValue(select, ["a", "c"]);
    assert.deepEqual(
      select.options.filter(o => o.selected).map(o => o.value),
      ["a", "c"]
    );
  });
});
