import { test } from "node:test";
import assert from "node:assert/strict";
import { managerInviteEmail } from "./templates.ts";
import { ACCESS_COPY, MANAGER_COPY, PAYMENT_BANNER_MANAGER } from "../live-view.ts";

const mail = managerInviteEmail({ dealer: "Kelso Autos", invitedBy: "owner@d.co", email: "mgr@d.co", accountUrl: "https://forecourt.example/account?invite=1" });

test("manager invite names the dealer, the inviter and links to sign in", () => {
  assert.match(mail.subject, /Kelso Autos/);
  assert.match(mail.text, /owner@d\.co has given you access/);
  assert.match(mail.text, /mgr@d\.co/);
  assert.ok(mail.html.includes("https://forecourt.example/account?invite=1"));
});

test("manager copy has no dashes and never says glass", () => {
  for (const s of [mail.subject, mail.preheader, mail.text, ACCESS_COPY, MANAGER_COPY, PAYMENT_BANNER_MANAGER]) {
    assert.ok(!/[\u2013\u2014]/.test(s), s);
    assert.ok(!/glass/i.test(s), s);
  }
});

test("manager banner points at the owner, not billing buttons", () => {
  assert.match(PAYMENT_BANNER_MANAGER, /account owner can update the card/);
  assert.doesNotMatch(PAYMENT_BANNER_MANAGER, /Stripe will retry/);
});
