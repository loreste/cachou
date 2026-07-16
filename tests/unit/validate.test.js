import { describe, it, before } from "node:test";
import assert from "node:assert/strict";

// Will import once module exists — test the logic exhaustively

describe("validators — loading", () => {
  it("module exports validators, compose, createValidator", async () => {
    const mod = await import("../../src/validate.js");
    assert.equal(typeof mod.validators, "object");
    assert.equal(typeof mod.compose, "function");
    assert.equal(typeof mod.createValidator, "function");
  });
});

describe("validators.email", () => {
  let email;
  before(async () => { email = (await import("../../src/validate.js")).validators.email; });

  it("accepts valid emails", () => {
    for (const e of ["a@b.com", "user@domain.co", "first.last@sub.domain.org", "user+tag@gmail.com", "x@y.io"]) {
      assert.ok(email(e).valid, `should accept ${e}`);
    }
  });

  it("rejects malformed emails", () => {
    for (const e of ["notanemail", "@domain.com", "user @domain.com", 42]) {
      assert.ok(!email(e).valid, `should reject ${JSON.stringify(e)}`);
    }
  });

  it("treats empty/null as optional (valid) — use compose with required for mandatory", () => {
    // Validators are optional by default; use compose(required, email) for mandatory
    assert.ok(email("").valid);
    assert.ok(email(null).valid);
  });

  it("returns a message on failure", () => {
    const result = email("bad");
    assert.ok(result.message && result.message.length > 0);
  });
});

describe("validators.url", () => {
  let url;
  before(async () => { url = (await import("../../src/validate.js")).validators.url; });

  it("accepts valid URLs", () => {
    for (const u of ["https://example.com", "http://localhost:3000", "https://sub.domain.co/path?q=1"]) {
      assert.ok(url(u).valid, `should accept ${u}`);
    }
  });

  it("rejects malformed URLs", () => {
    for (const u of ["not a url", "//missing-protocol.com"]) {
      assert.ok(!url(u).valid, `should reject ${JSON.stringify(u)}`);
    }
  });

  it("treats empty/null as optional (valid)", () => {
    assert.ok(url("").valid);
    assert.ok(url(null).valid);
  });
});

describe("validators.phone", () => {
  let phone;
  before(async () => { phone = (await import("../../src/validate.js")).validators.phone; });

  it("accepts valid phones", () => {
    for (const p of ["+1 555-555-5555", "(555) 555-5555", "5555555555", "+44 20 7946 0958"]) {
      assert.ok(phone(p).valid, `should accept ${p}`);
    }
  });

  it("rejects malformed phones", () => {
    for (const p of ["abc"]) {
      assert.ok(!phone(p).valid, `should reject ${JSON.stringify(p)}`);
    }
  });

  it("treats empty/null as optional (valid)", () => {
    assert.ok(phone("").valid);
    assert.ok(phone(null).valid);
  });
});

describe("validators.creditCard", () => {
  let creditCard;
  before(async () => { creditCard = (await import("../../src/validate.js")).validators.creditCard; });

  it("accepts valid cards (Luhn)", () => {
    // Known Luhn-valid test numbers
    for (const cc of ["4111111111111111", "5500000000000004", "378282246310005", "6011111111111117"]) {
      assert.ok(creditCard(cc).valid, `should accept ${cc}`);
    }
  });

  it("rejects invalid cards", () => {
    for (const cc of ["1234567890123456", "abcd", "411111111111111"]) {
      assert.ok(!creditCard(cc).valid, `should reject ${JSON.stringify(cc)}`);
    }
  });

  it("treats empty/null as optional (valid)", () => {
    assert.ok(creditCard("").valid);
    assert.ok(creditCard(null).valid);
  });

  it("handles cards with spaces/dashes", () => {
    assert.ok(creditCard("4111 1111 1111 1111").valid);
    assert.ok(creditCard("4111-1111-1111-1111").valid);
  });
});

describe("validators.required", () => {
  let required;
  before(async () => { required = (await import("../../src/validate.js")).validators.required; });

  it("rejects empty/null/undefined", () => {
    for (const v of ["", null, undefined]) {
      assert.ok(!required(v).valid, `should reject ${JSON.stringify(v)}`);
    }
  });

  it("accepts non-empty values", () => {
    for (const v of ["a", 0, false, "hello"]) {
      // 0 and false are valid (they're not empty)
      assert.ok(required(v).valid, `should accept ${JSON.stringify(v)}`);
    }
  });

  it("treats whitespace-only as empty", () => {
    assert.ok(!required(" ").valid);
    assert.ok(!required("  \t\n  ").valid);
  });
});

describe("validators.strongPassword", () => {
  let strongPassword;
  before(async () => { strongPassword = (await import("../../src/validate.js")).validators.strongPassword; });

  it("accepts strong passwords", () => {
    assert.ok(strongPassword("Str0ng!Pass").valid);
    assert.ok(strongPassword("MyP@ssw0rd").valid);
  });

  it("rejects weak passwords", () => {
    assert.ok(!strongPassword("short").valid);          // too short
    assert.ok(!strongPassword("ALLUPPERCASE1!").valid); // missing lowercase
    assert.ok(!strongPassword("NoNumbers!!").valid);     // no digit
    assert.ok(!strongPassword("NoSpecial1a").valid);     // no special char
    // empty is optional (valid) — use compose(required, strongPassword) for mandatory
  });
});

describe("validators — factory functions", () => {
  let validators;
  before(async () => { validators = (await import("../../src/validate.js")).validators; });

  it("minLength(n) works", () => {
    const min5 = validators.minLength(5);
    assert.ok(!min5("abc").valid);
    assert.ok(min5("abcde").valid);
    assert.ok(min5("abcdef").valid);
  });

  it("maxLength(n) works", () => {
    const max3 = validators.maxLength(3);
    assert.ok(max3("ab").valid);
    assert.ok(max3("abc").valid);
    assert.ok(!max3("abcd").valid);
  });

  it("min(n) works for numbers", () => {
    const min10 = validators.min(10);
    assert.ok(!min10(5).valid);
    assert.ok(min10(10).valid);
    assert.ok(min10(15).valid);
  });

  it("max(n) works for numbers", () => {
    const max100 = validators.max(100);
    assert.ok(max100(50).valid);
    assert.ok(max100(100).valid);
    assert.ok(!max100(101).valid);
  });

  it("pattern(regex, msg) works", () => {
    const hexColor = validators.pattern(/^#[0-9a-fA-F]{6}$/, "Must be a hex color");
    assert.ok(hexColor("#ff0000").valid);
    assert.ok(!hexColor("red").valid);
    assert.equal(hexColor("red").message, "Must be a hex color");
  });
});

describe("validators — other formats", () => {
  let validators;
  before(async () => { validators = (await import("../../src/validate.js")).validators; });

  it("uuid accepts v4 format", () => {
    assert.ok(validators.uuid("550e8400-e29b-41d4-a716-446655440000").valid);
    assert.ok(!validators.uuid("not-a-uuid").valid);
    assert.ok(validators.uuid("").valid); // optional
  });

  it("slug accepts valid slugs", () => {
    assert.ok(validators.slug("hello-world").valid);
    assert.ok(validators.slug("post-123").valid);
    assert.ok(!validators.slug("Hello World").valid);
    assert.ok(!validators.slug("has spaces").valid);
  });

  it("ipv4 accepts valid IPs", () => {
    assert.ok(validators.ipv4("192.168.1.1").valid);
    assert.ok(validators.ipv4("0.0.0.0").valid);
    assert.ok(!validators.ipv4("999.999.999.999").valid);
    assert.ok(!validators.ipv4("abc").valid);
  });

  it("dateISO accepts YYYY-MM-DD", () => {
    assert.ok(validators.dateISO("2024-06-15").valid);
    assert.ok(!validators.dateISO("06/15/2024").valid);
    assert.ok(validators.dateISO("").valid); // optional
  });

  it("numeric accepts number strings", () => {
    assert.ok(validators.numeric("123").valid);
    assert.ok(validators.numeric("3.14").valid);
    assert.ok(validators.numeric("-42").valid);
    assert.ok(!validators.numeric("abc").valid);
    assert.ok(validators.numeric("").valid); // optional
  });

  it("integer rejects floats", () => {
    assert.ok(validators.integer("42").valid);
    assert.ok(!validators.integer("3.14").valid);
    assert.ok(!validators.integer("abc").valid);
  });

  it("hex accepts hex strings", () => {
    assert.ok(validators.hex("ff00aa").valid);
    assert.ok(validators.hex("DEADBEEF").valid);
    assert.ok(!validators.hex("xyz").valid);
  });

  it("alphanumeric works", () => {
    assert.ok(validators.alphanumeric("abc123").valid);
    assert.ok(!validators.alphanumeric("abc 123").valid);
    assert.ok(!validators.alphanumeric("abc-123").valid);
  });
});

describe("compose", () => {
  let compose, validators;
  before(async () => {
    const mod = await import("../../src/validate.js");
    compose = mod.compose;
    validators = mod.validators;
  });

  it("runs validators in order, returns first failure", () => {
    const validate = compose(validators.required, validators.email);
    assert.ok(!validate("").valid);
    assert.ok(validate("").message.toLowerCase().includes("required") || validate("").message.length > 0);
    assert.ok(!validate("bad").valid);
    assert.ok(validate("a@b.com").valid);
  });

  it("returns valid when all pass", () => {
    const validate = compose(validators.required, validators.minLength(3));
    assert.ok(validate("hello").valid);
  });

  it("handles single validator", () => {
    const validate = compose(validators.required);
    assert.ok(!validate("").valid);
    assert.ok(validate("x").valid);
  });

  it("handles no validators", () => {
    const validate = compose();
    assert.ok(validate("anything").valid);
  });
});

describe("createValidator", () => {
  let createValidator;
  before(async () => { createValidator = (await import("../../src/validate.js")).createValidator; });

  it("creates a custom validator", () => {
    const isEven = createValidator(v => Number(v) % 2 === 0, "Must be even");
    assert.ok(isEven(4).valid);
    assert.ok(!isEven(3).valid);
    assert.equal(isEven(3).message, "Must be even");
  });

  it("propagates exceptions from test function", () => {
    const bad = createValidator(() => { throw new Error("boom"); }, "Error");
    assert.throws(() => bad("anything"), /boom/);
  });
});
