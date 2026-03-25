import { parseSnapshotFixture } from './snapshot-fixture.js';

const { describe, expect, it } = require('bun:test');

describe('snapshot fixture marker parser', () => {
  it('parses cursor and unnamed range markers', () => {
    const fixture = parseSnapshotFixture('int [|counter|] = $01;');

    expect(fixture.code).toBe('int counter = 1;');
    expect(fixture.cursorOffset).toBe(14);
    expect(fixture.ranges).toEqual([{ start: 4, end: 11 }]);
  });

  it('parses labeled ranges', () => {
    const fixture = parseSnapshotFixture('mapping m = {|target: (["a": 1]) |};');

    expect(fixture.code).toBe('mapping m =  (["a": 1]) ;');
    expect(fixture.ranges).toEqual([{ start: 12, end: 24, label: 'target' }]);
  });
});
