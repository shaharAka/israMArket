import assert from "node:assert/strict";
import { test } from "node:test";
import { parseLocaleNumber, parseMeasurementInput, updateFieldError } from "../lib/localeNumber.ts";
import { enoughFeaturedTopics, maySavePartialTopics } from "../lib/featuredTopicProgress.ts";

test("parses grouped values in the active interface locale", () => {
  assert.equal(parseLocaleNumber("3,000", "he-IL"), 3000);
  assert.equal(parseLocaleNumber("3,000", "en-IL"), 3000);
  assert.equal(parseLocaleNumber("3 000", "ru-RU"), 3000);
  assert.equal(parseLocaleNumber("٣٬٠٠٠", "ar-IL"), 3000);
});

test("uses the locale decimal mark and rejects malformed numeric input", () => {
  assert.equal(parseLocaleNumber("3,5", "ru-RU"), 3.5);
  assert.equal(parseLocaleNumber("3.5", "he-IL"), 3.5);
  assert.equal(parseLocaleNumber("3,00", "he-IL"), null);
  assert.equal(parseLocaleNumber("NaN", "he-IL"), null);
  assert.equal(parseLocaleNumber("1e6", "en-IL"), null);
  assert.equal(parseLocaleNumber("", "he-IL"), null);
});

test("validates typed measurements before updating the observation", () => {
  assert.deepEqual(parseMeasurementInput("3,000", "he-IL", "count"), { value: 3000 });
  assert.deepEqual(parseMeasurementInput("3.5", "he-IL", "count"), { value: null, error: "integer" });
  assert.deepEqual(parseMeasurementInput("3,00", "he-IL", "ILS"), { value: null, error: "invalid" });
  assert.deepEqual(parseMeasurementInput("1,000,000,001", "en-IL", "ILS"), { value: null, error: "limit" });
  assert.deepEqual(parseMeasurementInput("0", "he-IL", "count"), { value: 0 });
  assert.deepEqual(parseMeasurementInput("", "he-IL", "ILS"), { value: null });
  const errors = { "outcomes-lower": "הזינו מספר שלם.", "budget-upper": "הזינו מספר תקין." };
  assert.deepEqual(updateFieldError(errors, "outcomes-lower", null), { "budget-upper": "הזינו מספר תקין." });
  assert.deepEqual(updateFieldError(errors, "outcomes-lower", "הזינו מספר תקין."), { "outcomes-lower": "הזינו מספר תקין.", "budget-upper": "הזינו מספר תקין." });
});

test("allows an owner-edited topic list to save below the required next-step count", () => {
  assert.equal(maySavePartialTopics(1, 2, true), true);
  assert.equal(enoughFeaturedTopics(1, 2), false);
  assert.equal(maySavePartialTopics(1, 2, false), false);
  assert.equal(maySavePartialTopics(0, 2, true), false);
  assert.equal(enoughFeaturedTopics(2, 2), true);
});
