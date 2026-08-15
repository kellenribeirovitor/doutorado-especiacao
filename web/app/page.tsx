"use client";

import { useMemo, useState } from "react";

import chemistryDatabase from "@/data/chemistry-database.json";
import {
  calculateEquilibrium,
  isNeutralMaterial,
  SUPPORTED_EQUILIBRIUM_TYPES,
  type ChemistryDatabase,
  type EquilibriumType,
  type EquilibriumResult,
  type QueryEntry,
} from "@/lib/equilibrium";

export const dynamic = "force-static";

type EditableEntry = {
  id: number;
  entryType: EntryType;
  selectionId: string;
  concentration: string;
};

type EntryType = "material" | "species";

const equilibriumOptions: Array<{
  id: EquilibriumType;
  label: string;
  symbol: string;
}> = [
  { id: "acid_base", label: "Ácido–base", symbol: "H⁺" },
  { id: "complexation", label: "Complexação", symbol: "M" },
  { id: "redox", label: "Redox", symbol: "e⁻" },
  { id: "precipitation", label: "Precipitação", symbol: "s↓" },
];

const distributionColors = ["#0d6fdc", "#2eb5ae", "#7398c8", "#64c7c0", "#8b9caf"];

const database = chemistryDatabase as ChemistryDatabase;
const protonComponentId = database.components.find(
  (component) => component.balance_mode === "electroneutrality",
)?.component_id;

const superscriptMap: Record<string, string> = {
  "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴",
  "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹",
  "+": "⁺", "-": "⁻",
};

function displayFormula(formula: string) {
  const withSubscripts = formula.replace(/([A-Za-z)])(\d+)/g, (_, atom, digits: string) =>
    atom + digits.replace(/\d/g, (digit) => "₀₁₂₃₄₅₆₇₈₉"[Number(digit)]),
  );
  return withSubscripts.replace(/([+-])(\d*)$/, (_, sign, digits: string) =>
    (digits || "").split("").map((digit) => superscriptMap[digit]).join("") + superscriptMap[sign],
  );
}

function parseConcentration(value: string) {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return Number.NaN;
  return Number(normalized);
}

function toQueryEntries(entries: EditableEntry[]): QueryEntry[] {
  const seen = new Set<string>();
  return entries.map((entry) => {
    const key = `${entry.entryType}:${entry.selectionId}`;
    if (seen.has(key)) {
      throw new Error(
        `Cada ${entry.entryType === "material" ? "composto" : "espécie"} deve aparecer uma única vez na consulta.`,
      );
    }
    seen.add(key);
    const concentration = parseConcentration(entry.concentration);
    return entry.entryType === "material"
      ? { entryType: "material", materialId: entry.selectionId, concentration }
      : { entryType: "species", speciesId: entry.selectionId, concentration };
  });
}

function scientific(value: number, digits = 4) {
  if (value === 0) return "0";
  const [mantissa, exponent] = value.toExponential(digits).split("e");
  const exponentText = exponent
    .replace("+", "")
    .split("")
    .map((character) => superscriptMap[character] ?? character)
    .join("");
  const [integerPart, decimalPart = ""] = mantissa.split(".");
  const localizedMantissa = digits > 0
    ? `${integerPart},${decimalPart.padEnd(digits, "0")}`
    : integerPart;
  return `${localizedMantissa} × 10${exponentText}`;
}

function familyForSpecies(speciesId: string) {
  const composition = database.composition[speciesId];
  const componentId = Object.keys(composition).find((id) => id !== protonComponentId);
  return componentId
    ? database.components.find((component) => component.component_id === componentId)?.name ?? "Sistema"
    : "Sistema";
}

function formatDecimal(value: number, minimumFractionDigits: number, maximumFractionDigits: number) {
  const displayValue = Math.abs(value) < 0.5 * 10 ** (-maximumFractionDigits)
    ? 0
    : value;
  const fixed = displayValue.toFixed(maximumFractionDigits);
  const [integerPart, decimalPart = ""] = fixed.split(".");
  const trimmedDecimal = decimalPart.replace(/0+$/, "").padEnd(minimumFractionDigits, "0");
  return trimmedDecimal ? `${integerPart},${trimmedDecimal}` : integerPart;
}

function materialDecomposition(materialId: string) {
  const speciesById = new Map(
    database.species.map((species) => [species.species_id, species]),
  );
  return Object.entries(database.materialSpecies[materialId] ?? {})
    .map(([speciesId, coefficient]) => {
      const formula = speciesById.get(speciesId)?.formula ?? speciesId;
      return `${coefficient === 1 ? "" : `${coefficient} `}${displayFormula(formula)}`;
    })
    .join(" + ");
}

export default function Home() {
  const [entries, setEntries] = useState<EditableEntry[]>([]);
  const [result, setResult] = useState<EquilibriumResult | null>(null);
  const [calculatedAt, setCalculatedAt] = useState("");
  const [error, setError] = useState("");
  const [activityModel, setActivityModel] = useState("ideal");
  const [equilibriumTypes, setEquilibriumTypes] = useState<EquilibriumType[]>(["acid_base"]);

  const materialById = useMemo(
    () => new Map(database.materials.map((material) => [material.material_id, material])),
    [],
  );
  const speciesById = useMemo(
    () => new Map(database.species.map((species) => [species.species_id, species])),
    [],
  );
  const compoundMaterials = useMemo(
    () => database.materials.filter((material) =>
      isNeutralMaterial(database, material.material_id)),
    [],
  );
  function optionsForType(entryType: EntryType) {
    return entryType === "material" ? compoundMaterials : database.species;
  }

  function optionId(option: (typeof compoundMaterials)[number] | (typeof database.species)[number]) {
    return "material_id" in option ? option.material_id : option.species_id;
  }

  function clearCalculation() {
    setResult(null);
    setCalculatedAt("");
    setError("");
  }

  function calculate(entriesToCalculate: EditableEntry[]) {
    try {
      const calculated = calculateEquilibrium(
        database,
        toQueryEntries(entriesToCalculate),
        equilibriumTypes,
      );
      setResult(calculated);
      setCalculatedAt(new Date().toLocaleString("pt-BR"));
      setError("");
    } catch (calculationError) {
      setError(calculationError instanceof Error ? calculationError.message : "Não foi possível calcular.");
    }
  }

  function addEntry(entryType: EntryType) {
    setEntries((currentEntries) => {
      const used = new Set(
        currentEntries
          .filter((entry) => entry.entryType === entryType)
          .map((entry) => entry.selectionId),
      );
      const available = optionsForType(entryType).find(
        (option) => !used.has(optionId(option)),
      );
      if (!available) return currentEntries;
      const id = Math.max(0, ...currentEntries.map((entry) => entry.id)) + 1;
      return [
        ...currentEntries,
        {
          id,
          entryType,
          selectionId: optionId(available),
          concentration: "",
        },
      ];
    });
    clearCalculation();
  }

  function changeEntryType(id: number, entryType: EntryType) {
    setEntries((currentEntries) => {
      const used = new Set(
        currentEntries
          .filter((entry) => entry.id !== id && entry.entryType === entryType)
          .map((entry) => entry.selectionId),
      );
      const available = optionsForType(entryType).find(
        (option) => !used.has(optionId(option)),
      );
      if (!available) return currentEntries;
      return currentEntries.map((entry) => entry.id === id
        ? { ...entry, entryType, selectionId: optionId(available) }
        : entry);
    });
    clearCalculation();
  }

  function updateEntry(id: number, patch: Partial<EditableEntry>) {
    const updatedEntries = entries.map((entry) =>
      entry.id === id ? { ...entry, ...patch } : entry,
    );
    setEntries(updatedEntries);
    clearCalculation();
  }

  function removeEntry(id: number) {
    const updatedEntries = entries.filter((entry) => entry.id !== id);
    setEntries(updatedEntries);
    clearCalculation();
  }

  function toggleEquilibriumType(type: EquilibriumType) {
    setEquilibriumTypes((selected) =>
      selected.includes(type)
        ? selected.filter((item) => item !== type)
        : [...selected, type],
    );
    clearCalculation();
  }

  const familyTotals = new Map<string, number>();
  if (result) {
    for (const species of result.selectedSpecies) {
      const family = familyForSpecies(species.species_id);
      if (family !== "Sistema") {
        familyTotals.set(
          family,
          (familyTotals.get(family) ?? 0)
            + result.concentrations[species.species_id],
        );
      }
    }
  }
  const distributions = (result?.selectedSpecies ?? [])
    .map((species) => {
      const family = familyForSpecies(species.species_id);
      const familyTotal = familyTotals.get(family) ?? 0;
      return {
        species,
        family,
        share: familyTotal && result ? (result.concentrations[species.species_id] / familyTotal) * 100 : 0,
      };
    })
    .filter((item) => item.family !== "Sistema" && item.share >= 0.01);

  const distributionGroups = [...new Set(distributions.map((item) => item.family))].map((family) => {
    const items = distributions.filter((item) => item.family === family);
    const chart = `conic-gradient(${items.map((item, index) => {
      const start = items.slice(0, index).reduce((sum, current) => sum + current.share, 0);
      return `${distributionColors[index % distributionColors.length]} ${start}% ${start + item.share}%`;
    }).join(", ")})`;
    return { family, items, chart };
  });

  const steps = [
    { number: "01", label: "Tipos de equilíbrio", target: "#equilibrium-types" },
    { number: "02", label: "Condições", target: "#conditions" },
    { number: "03", label: "Composição", target: "#components" },
    { number: "04", label: "Resultado", target: "#results" },
    { number: "05", label: "Distribuição", target: result ? "#distribution" : "#results" },
    { number: "06", label: "Concentrações", target: "#species" },
  ];

  return (
    <main className="application-shell">
      <header className="app-header">
        <a className="tool-brand" href="#workspace" aria-label="Especiação Química em Solução Aquosa — início">
          <span className="tool-mark" aria-hidden="true"><i /><i /><i /><i /><i /><i /></span>
          <strong>Especiação Química em Solução Aquosa</strong>
        </a>
        <nav className="primary-navigation" aria-label="Seções principais">
          <a className="active" href="#workspace"><span aria-hidden="true">⇌</span>Sistema de equilíbrio</a>
        </nav>
      </header>

      <section className="workspace" id="workspace">
        <div className="workspace-toolbar">
          <div className="workspace-heading">
            <h1>Sistema de equilíbrio</h1>
          </div>

          <nav className="step-navigation" aria-label="Etapas da análise">
            {steps.map((step, index) => <a className={index === 0 ? "active" : ""} href={step.target} key={step.number}><span>{step.number}</span>{step.label}</a>)}
          </nav>
        </div>

        {error && <div className="notice notice-error" role="alert"><span aria-hidden="true">!</span><p>{error}</p></div>}

        {result && <>
          <section className="print-only print-report-header" aria-label="Cabeçalho do relatório">
            <h1>Relatório de especiação química</h1>
            <p>Gerado em {calculatedAt} · 25,00 °C · Solução ideal</p>
          </section>
          <section className="print-only print-input-summary" aria-labelledby="print-inputs-title">
            <h2 id="print-inputs-title">Composição informada</h2>
            <table>
              <thead><tr><th>Tipo</th><th>Entrada</th><th>Concentração</th><th>Interpretação</th></tr></thead>
              <tbody>{entries.map((entry) => {
                const entity = entry.entryType === "material"
                  ? materialById.get(entry.selectionId)!
                  : speciesById.get(entry.selectionId)!;
                const interpretation = entry.entryType === "material"
                  ? `${displayFormula(entity.formula)} → ${materialDecomposition(entry.selectionId)}`
                  : `carga ${"charge" in entity && entity.charge > 0 ? "+" : ""}${"charge" in entity ? entity.charge : ""}`;
                return <tr key={entry.id}><td>{entry.entryType === "material" ? "Composto" : "Espécie"}</td><td>{displayFormula(entity.formula)} — {entity.name}</td><td>{entry.concentration} mol/L</td><td>{interpretation}</td></tr>;
              })}</tbody>
            </table>
          </section>
        </>}

        <div className="work-grid">
          <div className="input-column">
          <section className="panel equilibrium-panel" id="equilibrium-types" aria-labelledby="equilibrium-types-title">
            <div className="panel-heading">
              <div><span className="section-index">01</span><h2 id="equilibrium-types-title">Tipos de equilíbrio</h2></div>
            </div>
            <fieldset className="equilibrium-fieldset">
                <legend className="sr-only">Tipos de equilíbrio</legend>
                <div className="equilibrium-options">
                  {equilibriumOptions.map((option) => {
                    const available = SUPPORTED_EQUILIBRIUM_TYPES.includes(option.id);
                    return (
                      <label className={available ? "" : "unavailable"} key={option.id} title={available ? undefined : "Ainda não disponível"}>
                        <input
                          type="checkbox"
                          checked={equilibriumTypes.includes(option.id)}
                          disabled={!available}
                          onChange={() => toggleEquilibriumType(option.id)}
                        />
                        <i aria-hidden="true">{option.symbol}</i>
                        <span>{option.label}</span>
                        {equilibriumTypes.includes(option.id) && <b aria-hidden="true">✓</b>}
                      </label>
                    );
                  })}
                </div>
              </fieldset>
          </section>

          <section className="panel conditions-panel" id="conditions" aria-labelledby="conditions-title">
            <div className="panel-heading">
              <div><span className="section-index">02</span><h2 id="conditions-title">Condições do sistema</h2></div>
            </div>
            <div className="conditions-content">
              <label className="setup-field"><span>Temperatura</span><span className="input-shell"><input value="25,00" readOnly aria-label="Temperatura" /><small>°C</small></span></label>
              <label className="setup-field"><span>Modelo de atividade</span><span className="select-shell"><select value={activityModel} onChange={(event) => setActivityModel(event.target.value)} aria-label="Modelo de atividade"><option value="ideal">Solução ideal</option></select></span></label>
            </div>
          </section>

            <section className="panel components-panel" id="components" aria-labelledby="components-title">
              <div className="panel-heading">
                <div><span className="section-index">03</span><h2 id="components-title">Composição analítica</h2></div>
                <div className="entry-add-actions">
                  <button type="button" className="text-button" onClick={() => addEntry("material")} disabled={entries.filter((entry) => entry.entryType === "material").length >= compoundMaterials.length}>+ Adicionar composto</button>
                  <button type="button" className="text-button" onClick={() => addEntry("species")} disabled={entries.filter((entry) => entry.entryType === "species").length >= database.species.length}>+ Adicionar espécie</button>
                </div>
              </div>
              <div className="mixed-entry-note">
                Você pode misturar compostos e espécies na mesma solução. Quando houver entrada direta por espécies, a eletroneutralidade do conjunto completo será verificada.
              </div>
              <div className="component-table" role="table" aria-label="Compostos e espécies adicionados à consulta">
                <div className="component-table-head" role="row">
                  <span role="columnheader">Tipo</span>
                  <span role="columnheader">Composto/espécie</span>
                  <span role="columnheader">Concentração</span>
                  <span role="columnheader">Unidade</span>
                  <span role="columnheader"><span className="sr-only">Ações</span></span>
                </div>
                {entries.map((entry) => {
                  const availableOptions = optionsForType(entry.entryType);
                  const entity = entry.entryType === "material"
                    ? materialById.get(entry.selectionId)!
                    : speciesById.get(entry.selectionId)!;
                  return (
                    <div className="component-table-row editable" role="row" key={entry.id}>
                      <span className="entry-type-select" role="cell">
                        <select value={entry.entryType} onChange={(event) => changeEntryType(entry.id, event.target.value as EntryType)} aria-label={`Tipo da linha ${entry.id}`}>
                          <option value="material">Composto</option>
                          <option value="species">Espécie</option>
                        </select>
                      </span>
                      <span className="material-select" role="cell">
                        <select value={entry.selectionId} onChange={(event) => updateEntry(entry.id, { selectionId: event.target.value })} aria-label={`${entry.entryType === "material" ? "Composto" : "Espécie"} da linha ${entry.id}`}>
                          {availableOptions.map((option) => {
                            const id = optionId(option);
                            return <option value={id} key={id}>{displayFormula(option.formula)} — {option.name}</option>;
                          })}
                        </select>
                        <small>{entry.entryType === "material"
                          ? `${displayFormula(entity.formula)} → ${materialDecomposition(entry.selectionId)}`
                          : `carga: ${"charge" in entity && entity.charge > 0 ? "+" : ""}${"charge" in entity ? entity.charge : ""}`}</small>
                      </span>
                      <span role="cell"><input inputMode="decimal" value={entry.concentration} onChange={(event) => updateEntry(entry.id, { concentration: event.target.value })} aria-label={`Concentração de ${entity.name}`} /></span>
                      <span role="cell">mol/L</span>
                      <span role="cell"><button type="button" className="remove-button" onClick={() => removeEntry(entry.id)} aria-label={`Remover ${entity.name}`} title={`Remover ${entity.name}`}>×</button></span>
                    </div>
                  );
                })}
                {entries.length === 0 && <div className="empty-entry">Nenhum composto ou espécie adicionado.</div>}
              </div>
              <div className="component-actions">
                <button type="button" className="primary-button" onClick={() => calculate(entries)} disabled={entries.length === 0 || equilibriumTypes.length === 0}>Calcular</button>
              </div>
            </section>
          </div>

          <aside className="results-column" id="results" aria-labelledby="results-title">
            <section className="panel result-card">
              <div className="panel-heading compact">
                <div><span className="section-index">04</span><h2 id="results-title">Resultado do equilíbrio</h2></div>
                {result && <div className="result-actions">
                  <span className="converged"><i /> convergiu</span>
                  <button type="button" className="print-button" onClick={() => window.print()}>Imprimir / salvar PDF</button>
                </div>}
              </div>
              {result ? <>
                <div className="ph-result"><span>pH de equilíbrio</span><strong>{formatDecimal(result.pH, 6, 6)}</strong><code>[H⁺] = {scientific(result.hydrogenConcentration)} mol/L</code></div>
                <dl className="diagnostics">
                  <div><dt>Resíduo de carga</dt><dd>{scientific(Math.abs(result.chargeResidual), 2)} <small>mol/L</small></dd></div>
                  <div><dt>Produto iônico da água</dt><dd>{scientific(result.calculatedKw, 3)}</dd></div>
                  <div><dt>Iterações</dt><dd>{result.iterations}</dd></div>
                  <div><dt>Espécies ativas</dt><dd>{result.selectedSpecies.length}</dd></div>
                </dl>
              </> : <div className="empty-result">—</div>}
            </section>

            {result && <section className="panel distribution-panel" id="distribution" aria-labelledby="distribution-title">
              <div className="panel-heading compact"><div><span className="section-index">05</span><h2 id="distribution-title">Distribuição por família</h2></div></div>
              <div className="distribution-content">
                {distributionGroups.map((group) => <div className="distribution-group" key={group.family}>
                  <span className="distribution-chart" style={{ background: group.chart }} aria-hidden="true"><i /></span>
                  <div className="distribution-details">
                    <strong className="distribution-family">{group.family}</strong>
                    <div className="distribution-list">
                      {group.items.map((item, index) => (
                        <div className="distribution-row" key={item.species.species_id}>
                          <div><strong><i style={{ background: distributionColors[index % distributionColors.length] }} />{displayFormula(item.species.formula)}</strong><span>{formatDecimal(item.share, 2, 2)}%</span></div>
                          <span className="bar-track"><i style={{ width: `${Math.max(item.share, 1.2)}%`, background: distributionColors[index % distributionColors.length] }} /></span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>)}
              </div>
            </section>}
          </aside>
        </div>

        <section className="panel species-panel" id="species" aria-labelledby="species-title">
          <div className="panel-heading"><div><span className="section-index">06</span><h2 id="species-title">Concentrações de equilíbrio</h2></div>{result && <div className="table-tools"><span>{result.selectedSpecies.length} espécies ativas</span></div>}</div>
          {result ? <div className="species-table-wrap">
            <table>
              <thead><tr><th>Espécie</th><th>Nome</th><th>Família</th><th>Carga</th><th>Concentração (mol/L)</th></tr></thead>
              <tbody>{result.selectedSpecies.map((species) => <tr key={species.species_id}><td><strong>{displayFormula(species.formula)}</strong></td><td>{species.name}</td><td>{familyForSpecies(species.species_id)}</td><td>{species.charge > 0 ? `+${species.charge}` : species.charge}</td><td><code>{scientific(result.concentrations[species.species_id])}</code></td></tr>)}</tbody>
            </table>
          </div> : <div className="empty-result table-empty">—</div>}
        </section>

      </section>
    </main>
  );
}
