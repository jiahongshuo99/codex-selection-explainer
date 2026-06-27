import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildNativeHostLauncher } from "../scripts/native-host-launcher.mjs";

describe("native host launcher", () => {
  it("uses an absolute Node executable so Chrome GUI PATH does not matter", () => {
    const script = buildNativeHostLauncher({
      nodePath: "/opt/homebrew/bin/node"
    });

    assert.match(script, /exec "\/opt\/homebrew\/bin\/node" "\$DIR\/index\.mjs"/);
    assert.doesNotMatch(script, /env node/);
  });
});
