export type ComponentRow = {
  component_id: string;
  species_id: string;
  formula: string;
  name: string;
  charge: number;
  balance_mode: "mass_balance" | "electroneutrality";
  notes: string;
};

export type SpeciesRow = {
  species_id: string;
  formula: string;
  name: string;
  charge: number;
  log_beta: number;
  constant_convention: string;
  source_equilibrium: string;
  source_logk: number | null;
  notes: string;
};

export type MaterialRow = {
  material_id: string;
  formula: string;
  name: string;
  input_model: string;
  notes: string;
};

export type ChemistryDatabase = {
  schemaVersion: number;
  components: ComponentRow[];
  species: SpeciesRow[];
  composition: Record<string, Record<string, number>>;
  materials: MaterialRow[];
  materialComposition: Record<string, Record<string, number>>;
};

export type QueryEntry = {
  materialId: string;
  concentration: number;
};

export type EquilibriumType = "acid_base" | "complexation" | "redox" | "precipitation";

export const SUPPORTED_EQUILIBRIUM_TYPES: readonly EquilibriumType[] = ["acid_base"];

type Problem = {
  database: ChemistryDatabase;
  protonComponentId: string;
  activeMassComponents: string[];
  variableComponents: string[];
  componentIndex: Record<string, number>;
  componentTotals: Record<string, number>;
  selectedSpecies: SpeciesRow[];
  chargeScale: number;
};

export type EquilibriumResult = {
  converged: boolean;
  iterations: number;
  residualNorm: number;
  pH: number;
  hydrogenConcentration: number;
  hydroxideConcentration: number;
  calculatedKw: number;
  chargeResidual: number;
  maxAbsResidual: number;
  concentrations: Record<string, number>;
  componentTotals: Record<string, number>;
  activeComponents: ComponentRow[];
  selectedSpecies: SpeciesRow[];
};

const MIN_LOG_CONCENTRATION = -30;
const MAX_LOG_CONCENTRATION = 2;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function componentTotalsFromEntries(
  database: ChemistryDatabase,
  entries: QueryEntry[],
) {
  const materialById = new Map(
    database.materials.map((material) => [material.material_id, material]),
  );
  const totals: Record<string, number> = {};

  for (const entry of entries) {
    if (!Number.isFinite(entry.concentration) || entry.concentration <= 0) {
      throw new Error("Informe concentrações maiores que zero para todos os componentes.");
    }
    const material = materialById.get(entry.materialId);
    if (!material) throw new Error(`Material não encontrado na base: ${entry.materialId}.`);
    const mapping = database.materialComposition[material.material_id];
    if (!mapping) throw new Error(`Material sem composição analítica: ${material.formula}.`);
    for (const [componentId, coefficient] of Object.entries(mapping)) {
      totals[componentId] = (totals[componentId] ?? 0) + coefficient * entry.concentration;
    }
  }
  return totals;
}

function buildProblem(
  database: ChemistryDatabase,
  componentTotals: Record<string, number>,
): Problem {
  const protonComponents = database.components.filter(
    (component) => component.balance_mode === "electroneutrality",
  );
  if (protonComponents.length !== 1) {
    throw new Error("A base deve possuir um único componente de eletroneutralidade.");
  }
  const protonComponentId = protonComponents[0].component_id;
  const activeMassComponents = Object.keys(componentTotals)
    .filter((componentId) => componentTotals[componentId] > 0)
    .sort();
  const activeSet = new Set(activeMassComponents);
  const selectedSpecies = database.species.filter((species) => {
    const composition = database.composition[species.species_id];
    const conservedDependencies = Object.keys(composition).filter(
      (componentId) => componentId !== protonComponentId,
    );
    return conservedDependencies.length
      ? conservedDependencies.every((componentId) => activeSet.has(componentId))
      : protonComponentId in composition;
  });
  const variableComponents = [protonComponentId, ...activeMassComponents];
  const componentIndex = Object.fromEntries(
    variableComponents.map((componentId, index) => [componentId, index]),
  );

  return {
    database,
    protonComponentId,
    activeMassComponents,
    variableComponents,
    componentIndex,
    componentTotals,
    selectedSpecies,
    chargeScale: Math.max(
      activeMassComponents.reduce((sum, id) => sum + componentTotals[id], 0),
      1e-7,
    ),
  };
}

function speciesConcentrations(problem: Problem, values: number[]) {
  return Object.fromEntries(
    problem.selectedSpecies.map((species) => {
      let logConcentration = species.log_beta;
      for (const [componentId, coefficient] of Object.entries(
        problem.database.composition[species.species_id],
      )) {
        logConcentration += coefficient * values[problem.componentIndex[componentId]];
      }
      return [species.species_id, 10 ** clamp(logConcentration, -300, 100)];
    }),
  );
}

function calculatedComponentTotals(
  problem: Problem,
  concentrations: Record<string, number>,
) {
  const calculated = Object.fromEntries(
    problem.activeMassComponents.map((componentId) => [componentId, 0]),
  );
  for (const species of problem.selectedSpecies) {
    for (const [componentId, coefficient] of Object.entries(
      problem.database.composition[species.species_id],
    )) {
      if (componentId in calculated) {
        calculated[componentId] += coefficient * concentrations[species.species_id];
      }
    }
  }
  return calculated;
}

function chargeResidual(problem: Problem, concentrations: Record<string, number>) {
  return problem.selectedSpecies.reduce(
    (sum, species) => sum + species.charge * concentrations[species.species_id],
    0,
  );
}

function residuals(problem: Problem, values: number[]) {
  const concentrations = speciesConcentrations(problem, values);
  const calculatedTotals = calculatedComponentTotals(problem, concentrations);
  return [
    ...problem.activeMassComponents.map((componentId) => {
      const calculated = calculatedTotals[componentId];
      return calculated <= 0
        ? -300
        : Math.log10(calculated / problem.componentTotals[componentId]);
    }),
    chargeResidual(problem, concentrations) / problem.chargeScale,
  ];
}

function infinityNorm(values: number[]) {
  return Math.max(...values.map((value) => Math.abs(value)));
}

function solveLinearSystem(matrix: number[][], target: number[]) {
  const size = target.length;
  const augmented = matrix.map((row, index) => [...row, target[index]]);
  for (let column = 0; column < size; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) pivot = row;
    }
    if (Math.abs(augmented[pivot][column]) < 1e-14) {
      throw new Error("O sistema numérico ficou singular para esta composição.");
    }
    [augmented[column], augmented[pivot]] = [augmented[pivot], augmented[column]];
    const divisor = augmented[column][column];
    for (let index = column; index <= size; index += 1) augmented[column][index] /= divisor;
    for (let row = 0; row < size; row += 1) {
      if (row === column) continue;
      const factor = augmented[row][column];
      for (let index = column; index <= size; index += 1) {
        augmented[row][index] -= factor * augmented[column][index];
      }
    }
  }
  return augmented.map((row) => row[size]);
}

function solveProblem(problem: Problem) {
  let values = problem.variableComponents.map((componentId) =>
    Math.log10(
      componentId === problem.protonComponentId
        ? 1e-7
        : Math.max(problem.componentTotals[componentId], 1e-12),
    ),
  );
  const tolerance = 1e-10;

  for (let iteration = 0; iteration <= 100; iteration += 1) {
    const currentResiduals = residuals(problem, values);
    const residualNorm = infinityNorm(currentResiduals);
    if (residualNorm <= tolerance) {
      return { converged: true, values, iterations: iteration, residualNorm };
    }
    if (iteration === 100) break;

    const jacobian = values.map((_, column) => {
      const step = 1e-6 * Math.max(1, Math.abs(values[column]));
      const shifted = [...values];
      shifted[column] += step;
      const shiftedResiduals = residuals(problem, shifted);
      return shiftedResiduals.map((value, row) => (value - currentResiduals[row]) / step);
    });
    const rowMatrix = jacobian[0].map((_, row) => jacobian.map((column) => column[row]));
    let newtonStep = solveLinearSystem(rowMatrix, currentResiduals.map((value) => -value));
    const maxStep = infinityNorm(newtonStep);
    if (maxStep > 3) newtonStep = newtonStep.map((value) => (value * 3) / maxStep);

    let accepted = false;
    let damping = 1;
    for (let attempt = 0; attempt < 24; attempt += 1) {
      const candidate = values.map((value, index) =>
        clamp(value + damping * newtonStep[index], MIN_LOG_CONCENTRATION, MAX_LOG_CONCENTRATION),
      );
      if (infinityNorm(residuals(problem, candidate)) < residualNorm) {
        values = candidate;
        accepted = true;
        break;
      }
      damping *= 0.5;
    }
    if (!accepted) break;
  }
  return {
    converged: false,
    values,
    iterations: 100,
    residualNorm: infinityNorm(residuals(problem, values)),
  };
}

export function calculateEquilibrium(
  database: ChemistryDatabase,
  entries: QueryEntry[],
  equilibriumTypes: EquilibriumType[] = ["acid_base"],
): EquilibriumResult {
  if (equilibriumTypes.length === 0) {
    throw new Error("Selecione ao menos um tipo de equilíbrio.");
  }
  const unsupportedTypes = equilibriumTypes.filter(
    (type) => !SUPPORTED_EQUILIBRIUM_TYPES.includes(type),
  );
  if (unsupportedTypes.length > 0) {
    throw new Error(`Tipos de equilíbrio ainda não suportados: ${unsupportedTypes.join(", ")}.`);
  }
  const componentTotals = componentTotalsFromEntries(database, entries);
  const problem = buildProblem(database, componentTotals);
  const numerical = solveProblem(problem);
  if (!numerical.converged) {
    throw new Error(
      `O cálculo não convergiu; maior resíduo ${numerical.residualNorm.toExponential(3)}.`,
    );
  }
  const concentrations = speciesConcentrations(problem, numerical.values);
  const hydrogen = problem.selectedSpecies.find((species) => species.formula === "H+");
  const hydroxide = problem.selectedSpecies.find((species) => species.formula === "OH-");
  if (!hydrogen || !hydroxide) throw new Error("A base não contém H+ e OH- ativos.");
  const charge = chargeResidual(problem, concentrations);
  const finalResiduals = residuals(problem, numerical.values);
  const componentById = new Map(
    database.components.map((component) => [component.component_id, component]),
  );

  return {
    converged: true,
    iterations: numerical.iterations,
    residualNorm: numerical.residualNorm,
    pH: -Math.log10(concentrations[hydrogen.species_id]),
    hydrogenConcentration: concentrations[hydrogen.species_id],
    hydroxideConcentration: concentrations[hydroxide.species_id],
    calculatedKw: concentrations[hydrogen.species_id] * concentrations[hydroxide.species_id],
    chargeResidual: charge,
    maxAbsResidual: infinityNorm(finalResiduals),
    concentrations,
    componentTotals,
    activeComponents: problem.activeMassComponents.map((id) => componentById.get(id)!),
    selectedSpecies: problem.selectedSpecies,
  };
}

export const equilibriumInternals = {
  componentTotalsFromEntries,
};
