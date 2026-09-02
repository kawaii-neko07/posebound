import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

test("defines all five control points", () => {
  for (const id of ["head", "leftHand", "rightHand", "pelvis", "interest"]) {
    assert.match(source, new RegExp(`\\b${id}\\b`));
  }
});

test("keeps anatomical constraints visible in the model", () => {
  assert.match(source, /armReach: 174/);
  assert.match(source, /gaze: \[-28, 28\]/);
  assert.match(source, /Ramię zatrzymane/);
  assert.match(source, /Szyja zatrzymana/);
});

test("supports pose export and a neutral reset", () => {
  assert.match(source, /posebound-pose\.json/);
  assert.match(source, /setPose\(NEUTRAL\)/);
});
