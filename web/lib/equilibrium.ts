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
  materialSpecies: Record<string, Record<string, number>>;
};

export type MaterialQueryEntry = {
  entryType?: "material";
  materialId: string;
  concentration: number;
};

export type SpeciesQueryEntry = {
  entryType: "species";
  speciesId: string;
  concentration: number;
};

export type QueryEntry = MaterialQueryEntry | SpeciesQueryEntry;

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
  initialSpecies: Record<string, number>;
  initialChargeResidual: number;
  componentTotals: Record<string, number>;
  activeComponents: ComponentRow[];
  selectedSpecies: SpeciesRow[];
};

const MIN_LOG_HYDROGEN = -100;
const MAX_LOG_HYDROGEN = 100;

function initialSpeciesFromEntries(
  database: ChemistryDatabase,
  entries: QueryEntry[],
) {
  const materialById = new Map(
    database.materials.map((material) => [material.material_id, material]),
  );
  const speciesById = new Map(
    database.species.map((species) => [species.species_id, species]),
  );
  const initialSpecies: Record<string, number> = {};
  let requiresChargeValidation = false;

  for (const entry of entries) {
    if (!Number.isFinite(entry.concentration) || entry.concentration < 0) {
      throw new Error("Informe concentrações maiores ou iguais a zero para todas as entradas.");
    }

    const mapping = "speciesId" in entry
      ? (() => {
          requiresChargeValidation = true;
          if (!speciesById.has(entry.speciesId)) {
            throw new Error(`Espécie não encontrada na base: ${entry.speciesId}.`);
          }
          return { [entry.speciesId]: 1 };
        })()
      : (() => {
          const material = materialById.get(entry.materialId);
          if (!material) {
            throw new Error(`Material não encontrado na base: ${entry.materialId}.`);
          }
          const decomposition = database.materialSpecies[material.material_id];
          if (!decomposition) {
            throw new Error(`Material sem decomposição em espécies: ${material.formula}.`);
          }
          return decomposition;
        })();

    for (const [speciesId, coefficient] of Object.entries(mapping)) {
      initialSpecies[speciesId] = (
        initialSpecies[speciesId] ?? 0
      ) + coefficient * entry.concentration;
    }
  }
  return { initialSpecies, requiresChargeValidation };
}

function initialChargeDiagnostics(
  database: ChemistryDatabase,
  initialSpecies: Record<string, number>,
) {
  const speciesById = new Map(
    database.species.map((species) => [species.species_id, species]),
  );
  let residual = 0;
  let scale = 0;
  for (const [speciesId, concentration] of Object.entries(initialSpecies)) {
    const species = speciesById.get(speciesId);
    if (!species) throw new Error(`Espécie não encontrada na base: ${speciesId}.`);
    const contribution = species.charge * concentration;
    residual += contribution;
    scale += Math.abs(contribution);
  }
  const tolerance = 1e-12 + 1e-9 * scale;
  return { residual, scale, tolerance, balanced: Math.abs(residual) <= tolerance };
}

function validateInitialCharge(
  database: ChemistryDatabase,
  initialSpecies: Record<string, number>,
) {
  const diagnostics = initialChargeDiagnostics(database, initialSpecies);
  if (!diagnostics.balanced) {
    const magnitude = Math.abs(diagnostics.residual);
    const excess = diagnostics.residual > 0 ? "positiva" : "negativa";
    const needed = diagnostics.residual > 0 ? "negativa" : "positiva";
    throw new Error(
      `A entrada por espécies não satisfaz a eletroneutralidade: excesso de carga ${excess} `
      + `de ${magnitude.toPrecision(6)} eq/L. Para neutralizar matematicamente, adicione `
      + `${magnitude.toPrecision(6)} mol/L de uma espécie monovalente ${needed}, `
      + `${(magnitude / 2).toPrecision(6)} mol/L de uma espécie divalente ${needed}, `
      + "ou ajuste as concentrações informadas. Confirme a compatibilidade química da correção.",
    );
  }
  return diagnostics;
}

function componentTotalsFromInitialSpecies(
  database: ChemistryDatabase,
  initialSpecies: Record<string, number>,
) {
  const massComponentIds = new Set(
    database.components
      .filter((component) => component.balance_mode === "mass_balance")
      .map((component) => component.component_id),
  );
  const totals: Record<string, number> = {};
  for (const [speciesId, concentration] of Object.entries(initialSpecies)) {
    const composition = database.composition[speciesId];
    if (!composition) throw new Error(`Espécie sem composição: ${speciesId}.`);
    for (const [componentId, coefficient] of Object.entries(composition)) {
      if (massComponentIds.has(componentId)) {
        totals[componentId] = (totals[componentId] ?? 0) + coefficient * concentration;
      }
    }
  }
  return totals;
}

function normalizedInput(database: ChemistryDatabase, entries: QueryEntry[]) {
  const normalized = initialSpeciesFromEntries(database, entries);
  const charge = normalized.requiresChargeValidation
    ? validateInitialCharge(database, normalized.initialSpecies)
    : initialChargeDiagnostics(database, normalized.initialSpecies);
  return {
    ...normalized,
    charge,
    componentTotals: componentTotalsFromInitialSpecies(database, normalized.initialSpecies),
  };
}

function componentTotalsFromEntries(
  database: ChemistryDatabase,
  entries: QueryEntry[],
) {
  return normalizedInput(database, entries).componentTotals;
}

export function isNeutralMaterial(
  database: ChemistryDatabase,
  materialId: string,
) {
  const mapping = database.materialSpecies[materialId];
  if (!mapping) return false;
  const speciesById = new Map(
    database.species.map((species) => [species.species_id, species]),
  );
  const charge = Object.entries(mapping).reduce((sum, [speciesId, coefficient]) => {
    const species = speciesById.get(speciesId);
    return sum + (species?.charge ?? Number.NaN) * coefficient;
  }, 0);
  return Number.isFinite(charge) && Math.abs(charge) <= 1e-12;
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
      return [species.species_id, 10 ** Math.min(100, Math.max(-300, logConcentration))];
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

function log10Sum(logValues: number[]) {
  if (logValues.length === 0) throw new Error("Uma família ácido-base ficou sem espécies.");
  const maximum = Math.max(...logValues);
  return maximum + Math.log10(
    logValues.reduce((sum, value) => sum + 10 ** (value - maximum), 0),
  );
}

type AcidBaseTerm = {
  logBeta: number;
  protonCoefficient: number;
};

function idealAcidBaseFamilies(problem: Problem) {
  const activeSet = new Set(problem.activeMassComponents);
  const families = Object.fromEntries(
    problem.activeMassComponents.map((componentId) => [componentId, [] as AcidBaseTerm[]]),
  );

  for (const species of problem.selectedSpecies) {
    const composition = problem.database.composition[species.species_id];
    const massDependencies = Object.keys(composition).filter(
      (componentId) => componentId !== problem.protonComponentId,
    );
    if (massDependencies.length > 1) {
      throw new Error(
        `O solver ácido-base ideal não admite espécie com múltiplos componentes: ${species.species_id}.`,
      );
    }
    if (massDependencies.length === 0) continue;

    const componentId = massDependencies[0];
    if (!activeSet.has(componentId)) continue;
    if (Math.abs(composition[componentId] - 1) > 1e-12) {
      throw new Error(
        `O solver ácido-base ideal exige coeficiente unitário em ${species.species_id}.`,
      );
    }
    families[componentId].push({
      logBeta: species.log_beta,
      protonCoefficient: composition[problem.protonComponentId] ?? 0,
    });
  }

  const missing = problem.activeMassComponents.filter(
    (componentId) => families[componentId].length === 0,
  );
  if (missing.length > 0) {
    throw new Error(`Componentes ativos sem família ácido-base: ${missing.join(", ")}.`);
  }
  return families;
}

function idealAcidBaseValues(
  problem: Problem,
  families: Record<string, AcidBaseTerm[]>,
  logHydrogen: number,
) {
  return [
    logHydrogen,
    ...problem.activeMassComponents.map((componentId) => {
      const logDistribution = log10Sum(
        families[componentId].map(
          (term) => term.logBeta + term.protonCoefficient * logHydrogen,
        ),
      );
      return Math.log10(problem.componentTotals[componentId]) - logDistribution;
    }),
  ];
}

function solveProblem(problem: Problem) {
  const families = idealAcidBaseFamilies(problem);
  const tolerance = 1e-12;
  const logHydrogenTolerance = 1e-12;
  const maxIterations = 256;
  let lower = MIN_LOG_HYDROGEN;
  let upper = MAX_LOG_HYDROGEN;

  const evaluate = (logHydrogen: number) => {
    const values = idealAcidBaseValues(problem, families, logHydrogen);
    const currentResiduals = residuals(problem, values);
    return { values, residuals: currentResiduals };
  };

  const lowerEvaluation = evaluate(lower);
  const upperEvaluation = evaluate(upper);
  if (
    lowerEvaluation.residuals.at(-1)! > 0
    || upperEvaluation.residuals.at(-1)! < 0
  ) {
    throw new Error("Não foi possível delimitar a raiz de eletroneutralidade.");
  }

  let evaluation = lowerEvaluation;
  for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
    const midpoint = (lower + upper) / 2;
    evaluation = evaluate(midpoint);
    const residualNorm = infinityNorm(evaluation.residuals);
    if (residualNorm <= tolerance && upper - lower <= logHydrogenTolerance) {
      return { converged: true, values: evaluation.values, iterations: iteration, residualNorm };
    }
    if (evaluation.residuals.at(-1)! > 0) upper = midpoint;
    else lower = midpoint;
  }

  return {
    converged: false,
    values: evaluation.values,
    iterations: maxIterations,
    residualNorm: infinityNorm(evaluation.residuals),
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
  const input = normalizedInput(database, entries);
  const componentTotals = input.componentTotals;
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
    initialSpecies: input.initialSpecies,
    initialChargeResidual: input.charge.residual,
    componentTotals,
    activeComponents: problem.activeMassComponents.map((id) => componentById.get(id)!),
    selectedSpecies: problem.selectedSpecies,
  };
}

export const equilibriumInternals = {
  initialSpeciesFromEntries,
  initialChargeDiagnostics,
  validateInitialCharge,
  componentTotalsFromInitialSpecies,
  componentTotalsFromEntries,
};
