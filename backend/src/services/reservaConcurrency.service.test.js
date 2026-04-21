import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { bloquearEspaciosDeRecursos } from "./reservaConcurrency.service.js";

describe("bloquearEspaciosDeRecursos", () => {
  it("consulta espacios distintos y aplica FOR UPDATE por espacio en orden ascendente", async () => {
    const calls = [];
    const db = {
      async query(text, vals) {
        calls.push({ text: text.replace(/\s+/g, " ").trim(), vals: vals ? [...vals] : vals });
        if (text.includes("DISTINCT")) {
          return { rows: [{ idEspacio: 3 }, { idEspacio: 1 }] };
        }
        return { rows: [] };
      },
    };

    await bloquearEspaciosDeRecursos(db, [10, 10, 20]);

    assert.equal(calls.length, 3);
    assert.ok(calls[0].text.includes("DISTINCT"));
    assert.deepEqual(calls[0].vals, [[10, 20]]);
    assert.ok(calls[1].text.includes("FOR UPDATE"));
    assert.deepEqual(calls[1].vals, [1]);
    assert.ok(calls[2].text.includes("FOR UPDATE"));
    assert.deepEqual(calls[2].vals, [3]);
  });

  it("no consulta si no hay ids válidos", async () => {
    let n = 0;
    const db = {
      async query() {
        n += 1;
        return { rows: [] };
      },
    };
    await bloquearEspaciosDeRecursos(db, []);
    await bloquearEspaciosDeRecursos(db, [NaN, 0, -1]);
    assert.equal(n, 0);
  });
});
