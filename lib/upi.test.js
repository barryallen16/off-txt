import { describe, expect, test } from "bun:test";
import {
  buildRequestLink,
  buildRequestText,
  extractUpiLink,
  extractUpiLinks,
  parseUpiLink,
  validateAmount,
} from "./upi";

const SIGNED_WITH_AM = "upi://pay?pa=a@b&pn=A&am=10&sign=xxx";
const SIGNED_NO_AM = "upi://pay?pa=a@b&pn=A&mode=00&sign=xxx";
const UNSIGNED_NO_AM = "upi://pay?pa=a@b&pn=A";

describe("parseUpiLink", () => {
  test("reads payee, amount, minimum and signature flag", () => {
    const parsed = parseUpiLink(
      "upi://pay?pa=bivek@npci&pn=bivek%20rath&am=10&mam=5&cu=INR&sign=abc=",
    );
    expect(parsed.valid).toBe(true);
    expect(parsed.pa).toBe("bivek@npci");
    expect(parsed.pn).toBe("bivek rath");
    expect(parsed.am).toBe("10");
    expect(parsed.mam).toBe("5");
    expect(parsed.cu).toBe("INR");
    expect(parsed.signed).toBe(true);
  });

  test("accepts an uppercase scheme", () => {
    const parsed = parseUpiLink("UPI://PAY?pa=a@b&pn=A");
    expect(parsed.valid).toBe(true);
    expect(parsed.pa).toBe("a@b");
  });

  test("rejects a non-UPI url", () => {
    const parsed = parseUpiLink("https://example.com/pay?pa=a@b");
    expect(parsed.valid).toBe(false);
    expect(parsed.reason).toBeTruthy();
  });

  test("rejects a link without pa", () => {
    expect(parseUpiLink("upi://pay?pn=A").valid).toBe(false);
    expect(parseUpiLink("upi://pay?pa=").valid).toBe(false);
    expect(parseUpiLink("upi://pay").valid).toBe(false);
  });

  test("rejects a currency other than INR", () => {
    expect(parseUpiLink("upi://pay?pa=a@b&cu=USD").valid).toBe(false);
    expect(parseUpiLink("upi://pay?pa=a@b&cu=INR").valid).toBe(true);
  });

  test("treats null/empty am and mam as absent", () => {
    expect(parseUpiLink("upi://pay?pa=a@b&am=").am).toBe(null);
    expect(parseUpiLink("upi://pay?pa=a@b&am=null").am).toBe(null);
    expect(parseUpiLink("upi://pay?pa=a@b&mam=null").mam).toBe(null);
  });
});

describe("buildRequestLink", () => {
  test("leaves a link with an amount untouched", () => {
    expect(buildRequestLink(SIGNED_WITH_AM, "250")).toEqual({
      link: SIGNED_WITH_AM,
      strippedSignature: false,
    });
  });

  test("leaves a base64 signature untouched when am exists", () => {
    const raw =
      "upi://pay?pa=bivekrath@npci&pn=bivek%20rath&am=10&sign=sQpPJ0YkdEHIV4b1Hme566aEp1XXXqfe9wqaXgUDfhCfSV1MWdgXnfIQcQYBHaZjDbcuIVrhcq11vhmmURYKsDb1ZbbXRlGXxDhIul5etM/EckmiIbpD90njclCyrLmOe6dp5F0rxzXsiTbjvCN8tUFc4fLFZktMnNF3+L8jqHc=";
    expect(buildRequestLink(raw, "250").link).toBe(raw);
  });

  test("strips the signature and appends the amount when am is missing", () => {
    expect(buildRequestLink(SIGNED_NO_AM, "250")).toEqual({
      link: "upi://pay?pa=a@b&pn=A&mode=00&am=250",
      strippedSignature: true,
    });
  });

  test("appends the amount to an unsigned link", () => {
    expect(buildRequestLink(UNSIGNED_NO_AM, "250")).toEqual({
      link: "upi://pay?pa=a@b&pn=A&am=250",
      strippedSignature: false,
    });
  });

  test("keeps every non-target parameter byte-identical", () => {
    const raw =
      "upi://pay?pa=bivek%40npci&pn=bivek%20rath&mc=9999&tid=cxnk&tr=4894&tn=Pay%20to%20mystar%20store&mam=null&cu=INR&url=https://mystar.com/orderid=9298yw89&mode=02&orgid=123456&mid=1234&msid=3432&mtid=1212&sign=sQpPJ0YkdEHIV4b1Hme566aEp1XXXqfe9wqaXgUDfhCfSV1MWdgXnfIQcQYBHaZjDbcuIVrhcq11vhmmURYKsDb1ZbbXRlGXxDhIul5etM/EckmiIbpD90njclCyrLmOe6dp5F0rxzXsiTbjvCN8tUFc4fLFZktMnNF3+L8jqHc=";
    const { link } = buildRequestLink(raw, "250");
    expect(link).toBe(
      "upi://pay?pa=bivek%40npci&pn=bivek%20rath&mc=9999&tid=cxnk&tr=4894&tn=Pay%20to%20mystar%20store&mam=null&cu=INR&url=https://mystar.com/orderid=9298yw89&mode=02&orgid=123456&mid=1234&msid=3432&mtid=1212&am=250",
    );
    expect(link).not.toContain("sign=");
  });

  test("keeps the scheme case of the original link", () => {
    expect(buildRequestLink("UPI://PAY?pa=a@b", "250").link).toBe(
      "UPI://PAY?pa=a@b&am=250",
    );
  });

  test("removes an empty am and appends the typed amount", () => {
    expect(buildRequestLink("upi://pay?pa=a@b&am=&sign=xxx", "250")).toEqual({
      link: "upi://pay?pa=a@b&am=250",
      strippedSignature: true,
    });
    expect(buildRequestLink("upi://pay?pa=a@b&am=", "250")).toEqual({
      link: "upi://pay?pa=a@b&am=250",
      strippedSignature: false,
    });
  });

  test("removes a malformed sign that is not last", () => {
    expect(buildRequestLink("upi://pay?pa=a@b&sign=xxx&pn=A", "250")).toEqual({
      link: "upi://pay?pa=a@b&pn=A&am=250",
      strippedSignature: true,
    });
  });

  test("handles a duplicate am by using the first value", () => {
    const raw = "upi://pay?pa=a@b&am=10&am=20";
    expect(buildRequestLink(raw, "250").link).toBe(raw);
    expect(parseUpiLink(raw).am).toBe("10");
  });

  test("ignores an invalid link and an empty amount", () => {
    expect(buildRequestLink("https://example.com", "250").link).toBe(
      "https://example.com",
    );
    expect(buildRequestLink(UNSIGNED_NO_AM, "").link).toBe(UNSIGNED_NO_AM);
  });

  test("encodes only the amount value", () => {
    expect(buildRequestLink("upi://pay?pa=a@b&tn=hi%20there", "250.5").link).toBe(
      "upi://pay?pa=a@b&tn=hi%20there&am=250.5",
    );
  });
});

describe("extractUpiLink", () => {
  test("finds a link after a sender prefix", () => {
    expect(
      extractUpiLink("From HDFC: :txt Pay Rs 250 upi://pay?pa=a@b&am=250"),
    ).toBe("upi://pay?pa=a@b&am=250");
  });

  test("trims trailing punctuation and quotes", () => {
    expect(extractUpiLink("pay now: upi://pay?pa=a@b&am=10.")).toBe(
      "upi://pay?pa=a@b&am=10",
    );
    expect(extractUpiLink('send "upi://pay?pa=a@b&am=10" today')).toBe(
      "upi://pay?pa=a@b&am=10",
    );
  });

  test("keeps base64 signature characters", () => {
    const link = "upi://pay?pa=a@b&sign=ab+cd/ef==";
    expect(extractUpiLink(`:txt ${link}`)).toBe(link);
  });

  test("returns the first link and handles uppercase", () => {
    expect(
      extractUpiLink(
        ":txt UPI://PAY?pa=a@b upi://pay?pa=c@d",
      ),
    ).toBe("UPI://PAY?pa=a@b");
  });

  test("returns null when there is no link", () => {
    expect(extractUpiLink(":txt hello")).toBe(null);
    expect(extractUpiLink(null)).toBe(null);
    expect(extractUpiLinks(":txt hello")).toEqual([]);
  });

  test("finds every link in a grouped notification", () => {
    expect(
      extractUpiLinks(
        ":txt Pay Rs 10 upi://pay?pa=a@b&am=10\n:txt Pay Rs 20 upi://pay?pa=c@d&am=20",
      ),
    ).toEqual(["upi://pay?pa=a@b&am=10", "upi://pay?pa=c@d&am=20"]);
  });
});

describe("validateAmount", () => {
  test("accepts whole and two-decimal amounts", () => {
    expect(validateAmount("250", null)).toEqual({
      valid: true,
      reason: null,
      amount: "250",
    });
    expect(validateAmount("250.50", null).amount).toBe("250.5");
    expect(validateAmount("1,000", null).amount).toBe("1000");
  });

  test("rejects empty, zero, negative and long decimals", () => {
    expect(validateAmount("", null).valid).toBe(false);
    expect(validateAmount("0", null).valid).toBe(false);
    expect(validateAmount("-5", null).valid).toBe(false);
    expect(validateAmount("12.345", null).valid).toBe(false);
    expect(validateAmount("abc", null).valid).toBe(false);
  });

  test("enforces mam when present", () => {
    expect(validateAmount("100", "250").valid).toBe(false);
    expect(validateAmount("250", "250").valid).toBe(true);
    expect(validateAmount("300", "250").valid).toBe(true);
    expect(validateAmount("100", null).valid).toBe(true);
    expect(validateAmount("100", "null").valid).toBe(true);
    expect(validateAmount("100", "").valid).toBe(true);
  });
});

describe("buildRequestText", () => {
  test("prefixes the message with :txt and states the amount", () => {
    expect(buildRequestText("upi://pay?pa=a@b&am=250", "250")).toBe(
      ":txt Pay Rs 250 upi://pay?pa=a@b&am=250",
    );
  });
});
