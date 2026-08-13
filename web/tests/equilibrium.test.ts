import assert from "node:assert/strict";
import test from "node:test";

import databaseJson from "../data/chemistry-database.json" with { type: "json" };
import {
  calculateEquilibrium,
  equilibriumInternals,
  type ChemistryDatabase,
} from "../lib/equilibrium.ts";

const database = databaseJson as ChemistryDatabase;

test("reproduz no navegador o caso do Excel anterior", () => {
  const result = calculateEquilibrium(database, [
    { materialId: "M009", concentration: 0.025 },
    { materialId: "M011", concentration: 0.001 },
  ], ["acid_base"]);

  assert.ok(Math.abs(result.pH - 3.033672202678) < 1e-8);
  assert.ok(Math.abs(result.calculatedKw - 1e-14) < 1e-24);
  assert.ok(Math.abs(result.chargeResidual) < 1e-12);
  assert.ok(result.maxAbsResidual < 1e-9);
});

test("resolve os limites de ácido e base fortes", () => {
  const acid = calculateEquilibrium(database, [
    { materialId: "M002", concentration: 0.1 },
  ]);
  const base = calculateEquilibrium(database, [
    { materialId: "M010", concentration: 0.1 },
  ]);

  assert.ok(Math.abs(acid.pH - 1) < 1e-9);
  assert.ok(Math.abs(base.pH - 13) < 1e-9);
});

test("resolve água pura", () => {
  const result = calculateEquilibrium(database, []);

  assert.ok(Math.abs(result.pH - 7) < 1e-12);
  assert.deepEqual(result.activeComponents, []);
});

test("exige ao menos um tipo de equilíbrio", () => {
  assert.throws(
    () => calculateEquilibrium(database, [], []),
    /Selecione ao menos um tipo de equilíbrio/,
  );
});

test("recusa tipos sem suporte científico", () => {
  assert.throws(
    () => calculateEquilibrium(database, [], ["complexation"]),
    /ainda não suportados: complexation/,
  );
});

test("converte materiais em totais dos componentes-base", () => {
  const totals = equilibriumInternals.componentTotalsFromEntries(database, [
    { materialId: "M003", concentration: 0.05 },
    { materialId: "M007", concentration: 0.02 },
  ]);

  assert.deepEqual(totals, { "003": 0.02, "004": 0.05, "005": 0.05, "006": 0.02 });
});

test("todos os materiais cadastrados convergem isoladamente", () => {
  for (const material of database.materials) {
    const result = calculateEquilibrium(database, [
      { materialId: material.material_id, concentration: 0.01 },
    ]);
    assert.equal(result.converged, true, material.formula);
    assert.ok(result.residualNorm < 1e-9, material.formula);
  }
});

test("todas as combinações de dois materiais convergem", () => {
  for (let first = 0; first < database.materials.length; first += 1) {
    for (let second = first + 1; second < database.materials.length; second += 1) {
      const result = calculateEquilibrium(database, [
        { materialId: database.materials[first].material_id, concentration: 0.01 },
        { materialId: database.materials[second].material_id, concentration: 0.005 },
      ]);
      assert.equal(
        result.converged,
        true,
        `${database.materials[first].formula} + ${database.materials[second].formula}`,
      );
      assert.ok(result.residualNorm < 1e-9);
    }
  }
});
