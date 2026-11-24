import test from 'node:test';
import assert from 'node:assert/strict';

// The connector router: pure geometry,
// a straight segment where the boxes overlap on the shared axis by at least 16 px inside both, else an
// orthogonal elbow through the midpoint between them.
const { routeConnector } = await import('../../src/scripts/story/connectors.ts');

const box = (left, top, right, bottom) => ({ left, top, right, bottom });

test('overlapping boxes, bottom to top: two points with the same x, edge to edge', () => {
  const a = box(0, 0, 200, 50);
  const b = box(100, 150, 300, 200);
  for (const narrow of [false, true]) {
    const pts = routeConnector(a, 'b', b, 't', narrow);
    assert.equal(pts.length, 2);
    assert.equal(pts[0][0], pts[1][0]);
    assert.deepEqual([pts[0][1], pts[1][1]], [50, 150]);
    // inside the overlap (100..200), at least 16 px in from both boxes' sides
    assert.ok(pts[0][0] >= 116 && pts[0][0] <= 184, String(pts[0][0]));
  }
});

test('overlapping boxes, top to bottom (going up): edge to edge, x within the overlap', () => {
  const a = box(0, 300, 400, 380); // a wide kernel box below
  const b = box(250, 100, 350, 180); // a narrower box above
  const pts = routeConnector(a, 't', b, 'b', false);
  assert.equal(pts.length, 2);
  assert.equal(pts[0][0], pts[1][0]);
  assert.deepEqual([pts[0][1], pts[1][1]], [300, 180]);
  assert.ok(pts[0][0] >= 266 && pts[0][0] <= 334);
});

test('non-overlapping boxes: four points, the middle segment at the midpoint', () => {
  const a = box(0, 0, 100, 50);
  const b = box(300, 150, 400, 200);
  const pts = routeConnector(a, 'b', b, 't', false);
  assert.equal(pts.length, 4);
  assert.deepEqual(pts[0], [50, 50]);
  assert.deepEqual(pts[3], [350, 150]);
  assert.equal(pts[1][1], 100);
  assert.equal(pts[2][1], 100);
  assert.deepEqual([pts[1][0], pts[2][0]], [50, 350]);
});

test('an overlap thinner than 16 px inside both is not enough: an elbow', () => {
  const a = box(0, 0, 100, 50);
  const b = box(80, 150, 200, 200); // overlap 80..100: 20 px, less than 16 px inside each side
  assert.equal(routeConnector(a, 'b', b, 't', false).length, 4);
});

test('horizontal links (r to l) take the shared y', () => {
  const a = box(0, 0, 100, 100);
  const b = box(200, 40, 300, 140);
  const pts = routeConnector(a, 'r', b, 'l', false);
  assert.equal(pts.length, 2);
  assert.deepEqual(pts[0], [100, pts[1][1]]);
  assert.equal(pts[1][0], 200);
  // the shared band is 40..100: the line is inside it, clear of both boxes' corners
  assert.ok(pts[0][1] > 40 && pts[0][1] < 100);
  assert.equal(pts[0][1], 70);
});

test('horizontal links without a shared band: an elbow through the midpoint between the boxes', () => {
  const a = box(0, 0, 100, 50);
  const b = box(200, 150, 300, 200);
  const pts = routeConnector(a, 'r', b, 'l', false);
  assert.deepEqual(pts, [[100, 25], [150, 25], [150, 175], [200, 175]]);
});
