import assert from "node:assert/strict";
import test from "node:test";

import databaseJson from "../data/chemistry-database.json" with { type: "json" };
import {
  calculateEquilibrium,
  equilibriumInternals,
  isNeutralMaterial,
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
  const hydrobromic = calculateEquilibrium(database, [
    { materialId: "M022", concentration: 0.1 },
  ]);

  assert.ok(Math.abs(acid.pH - 1) < 1e-9);
  assert.ok(Math.abs(base.pH - 13) < 1e-9);
  assert.ok(Math.abs(hydrobromic.pH - 1) < 1e-9);
});

test("neutraliza quantidades equimolares de ácido e base fortes", () => {
  const result = calculateEquilibrium(database, [
    { materialId: "M002", concentration: 0.1 },
    { materialId: "M010", concentration: 0.1 },
  ]);

  assert.ok(Math.abs(result.pH - 7) < 1e-10);
  assert.ok(Math.abs(result.chargeResidual) < 1e-12);
});

test("reproduz o pKa no ponto de meia neutralização do ácido acético", () => {
  const result = calculateEquilibrium(database, [
    { materialId: "M009", concentration: 0.01 },
    { materialId: "M010", concentration: 0.005 },
  ]);

  assert.ok(Math.abs(result.pH - 4.754487) < 0.005);
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

test("normaliza ácidos fracos e amônia em espécies formais", () => {
  const normalized = equilibriumInternals.initialSpeciesFromEntries(database, [
    { materialId: "M001", concentration: 0.1 },
    { materialId: "M009", concentration: 0.2 },
    { materialId: "M008", concentration: 0.3 },
  ]);

  assert.ok(Math.abs(normalized.initialSpecies.S001 - 0.3) < 1e-15);
  assert.equal(normalized.initialSpecies.S003, 0.1);
  assert.equal(normalized.initialSpecies.S012, 0.2);
  assert.equal(normalized.initialSpecies.S007, 0.3);
  assert.equal(normalized.initialSpecies.S002, 0.3);
});

test("aceita entrada direta por espécies quando a carga está balanceada", () => {
  const result = calculateEquilibrium(database, [
    { entryType: "species", speciesId: "S001", concentration: 0.1 },
    { entryType: "species", speciesId: "S005", concentration: 0.1 },
  ]);

  assert.ok(Math.abs(result.initialChargeResidual) < 1e-15);
  assert.ok(Math.abs(result.pH - 1) < 1e-9);
});

test("aceita compostos e espécies na mesma solução", () => {
  const result = calculateEquilibrium(database, [
    { entryType: "material", materialId: "M001", concentration: 0.01 },
    { entryType: "species", speciesId: "S009", concentration: 0.1 },
    { entryType: "species", speciesId: "S005", concentration: 0.1 },
  ]);

  assert.ok(Math.abs(result.initialChargeResidual) < 1e-15);
  assert.equal(result.initialSpecies.S001, 0.01);
  assert.equal(result.initialSpecies.S003, 0.01);
  assert.equal(result.initialSpecies.S009, 0.1);
  assert.equal(result.initialSpecies.S005, 0.1);
  assert.equal(result.converged, true);
});

test("recusa entrada direta por espécies sem eletroneutralidade e sugere correção", () => {
  assert.throws(
    () => calculateEquilibrium(database, [
      { entryType: "species", speciesId: "S007", concentration: 0.1 },
      { entryType: "species", speciesId: "S010", concentration: 0.1 },
    ]),
    /excesso de carga negativa.*monovalente positiva/,
  );
});

test("expõe somente materiais eletroneutros no modo de compostos", () => {
  assert.equal(isNeutralMaterial(database, "M002"), true);
  assert.equal(isNeutralMaterial(database, "M005"), false);
  assert.equal(isNeutralMaterial(database, "M006"), false);
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

test("permanece estável com componentes-traço e fundos concentrados", () => {
  const cases = [
    [{ materialId: "M001", concentration: 1e-14 }, { materialId: "M002", concentration: 1 }],
    [{ materialId: "M001", concentration: 1e-4 }, { materialId: "M007", concentration: 1 }],
    [{ materialId: "M001", concentration: 1e-2 }, { materialId: "M011", concentration: 1e-14 }],
    [{ materialId: "M003", concentration: 10 }],
  ];

  for (const entries of cases) {
    const result = calculateEquilibrium(database, entries);
    assert.equal(result.converged, true, JSON.stringify(entries));
    assert.ok(result.residualNorm < 1e-10, JSON.stringify(entries));
    assert.ok(Number.isFinite(result.pH), JSON.stringify(entries));
  }
});

test("todas as combinações convergem em escalas analíticas distintas", () => {
  const concentrationPairs = [[1e-12, 1], [1, 1e-12], [1e-4, 1]];
  for (let first = 0; first < database.materials.length; first += 1) {
    for (let second = first + 1; second < database.materials.length; second += 1) {
      for (const [firstConcentration, secondConcentration] of concentrationPairs) {
        const entries = [
          { materialId: database.materials[first].material_id, concentration: firstConcentration },
          { materialId: database.materials[second].material_id, concentration: secondConcentration },
        ];
        const result = calculateEquilibrium(database, entries);
        assert.equal(result.converged, true, JSON.stringify(entries));
        assert.ok(result.residualNorm < 1e-10, JSON.stringify(entries));
      }
    }
  }
});

test("aceita concentração zero como ausência de adição", () => {
  const result = calculateEquilibrium(database, [
    { materialId: "M002", concentration: 0 },
  ]);

  assert.ok(Math.abs(result.pH - 7) < 1e-12);
  assert.deepEqual(result.activeComponents, []);
});

test("recusa concentração negativa", () => {
  assert.throws(
    () => calculateEquilibrium(database, [{ materialId: "M002", concentration: -1 }]),
    /maiores ou iguais a zero/,
  );
});
