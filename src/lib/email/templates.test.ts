/** Journey email copy rules: six steps, house style, plain text, safe HTML. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { CUSTOMER_STEPS, customerStepNumber, customerStepFor } from "../journey.ts";
import { hasProgressEmail, progressEmail, thankYouEmail } from "./templates.ts";

const base = { bookUrl: "https://www.forecourt.me/book", accountUrl: "https://www.forecourt.me/account" };
const thanks = thankYouEmail({
  ...base,
  firstName: "Sam Taylor",
  dealer: "Northbridge Motors",
  planName: "Site",
  kind: "subscription",
  paidPence: 450000,
  monthlyPence: 39900,
  monthlyChargedToday: false,
});
const progress = ["brief", "pack", "build", "preview", "testing", "live"].map((stage) =>
  progressEmail({ ...base, firstName: "Sam", dealer: "Northbridge Motors", stage, domain: "desk.northbridgemotors.example", previewUrl: "https://desk-northbridge.example", monthlyPence: 39900, monthlyStartsToday: true })!,
);
const all = [thanks, ...progress];

test("six customer steps, mapped from the internal stages", () => {
  assert.deepEqual(CUSTOMER_STEPS.map((s) => s.title), [
    "Payment received",
    "Kickoff call",
    "We set up your desk",
    "Your preview",
    "Testing",
    "Live",
  ]);
  assert.deepEqual(
    ["briefing", "paid", "brief", "pack", "build", "preview", "testing", "live", "nonsense", null].map(customerStepNumber),
    [0, 1, 2, 3, 3, 4, 5, 6, 0, 0],
  );
  assert.equal(customerStepFor("briefing"), null);
  assert.equal(hasProgressEmail("paid"), false);
  assert.equal(hasProgressEmail("pack"), true);
});

test("house style: no dashes, no glass, no portal, no internal stage names, plain text present", () => {
  for (const e of all) {
    const words = `${e.subject}\n${e.preheader}\n${e.text}\n${e.html.replace(/<[^>]+>/g, " ")}`;
    assert.doesNotMatch(words, /[\u2013\u2014]/, e.subject);
    assert.doesNotMatch(words, / - /, e.subject);
    assert.doesNotMatch(words, /glass/i, e.subject);
    assert.doesNotMatch(words, /portal/i, e.subject);
    assert.doesNotMatch(words, /\b(Brief|Pack)\b/, e.subject);
    assert.ok(e.text.length > 200, "plain text part");
    assert.ok(e.subject.length <= 60, e.subject);
  }
});

test("thank you: book button first, setup today, monthly from go live", () => {
  assert.equal(thanks.subject, "Thanks, Sam. Next step: book your kickoff call");
  assert.match(thanks.html, /Book your kickoff call/);
  assert.match(thanks.html, /v:roundrect/);
  assert.match(thanks.html, /mso-hide:all/);
  assert.match(thanks.html, /<!--\[if !mso\]><!--><link href="https:\/\/fonts\.googleapis\.com/);
  assert.match(thanks.html, /\[data-ogsc\] \.cta-a/);
  assert.match(thanks.text, /Today you paid £4,500 for the one-off setup\. Your monthly plan of £399 starts on the day your desk goes live/);
  assert.match(thanks.html, /kept separate from every other dealership/);
  assert.doesNotMatch(thanks.html, /tel:/);
});

test("progress: NOW tag, headline names the step, one bar plus Step n of 6", () => {
  const [, setup, , preview, , live] = progress;
  assert.equal(setup!.subject, "We're setting up your Forecourt desk");
  assert.match(setup!.text, /Step 3 of 6: We set up your desk/);
  assert.match(setup!.html, />Now</);
  assert.match(preview!.text, /Step 4 of 6: Your preview/);
  assert.match(preview!.html, /Open your preview/);
  assert.equal(live!.subject, "Northbridge Motors is live on Forecourt");
  assert.match(live!.text, /Your monthly plan starts today/);
  const notStarted = progressEmail({ ...base, dealer: "Northbridge Motors", stage: "live", monthlyStartsToday: false })!;
  assert.doesNotMatch(notStarted.text, /monthly plan starts today/i);
});

test("dynamic values are escaped", () => {
  const e = progressEmail({ ...base, dealer: "<script>x</script> & Sons", stage: "preview", previewUrl: "javascript:alert(1)" })!;
  assert.doesNotMatch(e.html, /<script>x/);
  assert.doesNotMatch(e.html, /javascript:/);
});
