"use client";

import { useMemo, useState } from "react";

import chemistryDatabase from "@/data/chemistry-database.json";
import {
  calculateEquilibrium,
  type ChemistryDatabase,
  type EquilibriumResult,
  type QueryEntry,
} from "@/lib/equilibrium";

export const dynamic = "force-static";

type EditableEntry = {
  id: number;
  materialId: string;
  concentration: string;
};

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
    if (seen.has(entry.materialId)) {
      throw new Error("Cada componente deve aparecer uma única vez na consulta.");
    }
    seen.add(entry.materialId);
    return {
      materialId: entry.materialId,
      concentration: parseConcentration(entry.concentration),
    };
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
  const fixed = value.toFixed(maximumFractionDigits);
  const [integerPart, decimalPart = ""] = fixed.split(".");
  const trimmedDecimal = decimalPart.replace(/0+$/, "").padEnd(minimumFractionDigits, "0");
  return trimmedDecimal ? `${integerPart},${trimmedDecimal}` : integerPart;
}

export default function Home() {
  const [entries, setEntries] = useState<EditableEntry[]>([]);
  const [nextId, setNextId] = useState(1);
  const [result, setResult] = useState<EquilibriumResult | null>(null);
  const [error, setError] = useState("");
  const [activityModel, setActivityModel] = useState("ideal");

  const materialById = useMemo(
    () => new Map(database.materials.map((material) => [material.material_id, material])),
    [],
  );
  const consultationName = entries
    .map((entry) => materialById.get(entry.materialId)?.name)
    .filter(Boolean)
    .join(" + ") || "Nova consulta";

  function calculate(entriesToCalculate: EditableEntry[]) {
    try {
      const calculated = calculateEquilibrium(database, toQueryEntries(entriesToCalculate));
      setResult(calculated);
      setError("");
    } catch (calculationError) {
      setError(calculationError instanceof Error ? calculationError.message : "Não foi possível calcular.");
    }
  }

  function addEntry() {
    const used = new Set(entries.map((entry) => entry.materialId));
    const available = database.materials.find((material) => !used.has(material.material_id));
    if (!available) return;
    setEntries([...entries, { id: nextId, materialId: available.material_id, concentration: "" }]);
    setNextId(nextId + 1);
    setResult(null);
    setError("");
  }

  function updateEntry(id: number, patch: Partial<EditableEntry>) {
    const updatedEntries = entries.map((entry) =>
      entry.id === id ? { ...entry, ...patch } : entry,
    );
    setEntries(updatedEntries);
    setResult(null);
    setError("");
  }

  function removeEntry(id: number) {
    const updatedEntries = entries.filter((entry) => entry.id !== id);
    setEntries(updatedEntries);
    setResult(null);
    setError("");
  }

  const familyTotals = new Map<string, number>();
  for (const species of result?.selectedSpecies ?? []) {
    const family = familyForSpecies(species.species_id);
    if (family !== "Sistema") {
      familyTotals.set(family, (familyTotals.get(family) ?? 0) + result.concentrations[species.species_id]);
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

  return (
    <main className="application-shell">
      <header className="app-header">
        <a className="tool-brand" href="#workspace" aria-label="Especiação aquosa — início">
          <span className="tool-mark" aria-hidden="true">Σ</span>
          <span><strong>Especiação aquosa</strong><small>equilíbrio por componentes</small></span>
        </a>
        <div className="project-context" aria-label="Consulta atual">
          <span>Consulta atual</span><strong>{consultationName}</strong>
        </div>
        <div className="header-status">
          <button type="button" className="icon-button" aria-label="Ajuda sobre a interface" title="Os cálculos são executados somente neste navegador.">?</button>
        </div>
      </header>

      <aside className="app-sidebar" aria-label="Resumo do modelo">
        <div className="model-summary">
          <div className="summary-heading"><span>Modelo ativo</span><i aria-hidden="true" /></div>
          <dl>
            <div><dt>Fase</dt><dd>Aquosa</dd></div>
            <div><dt>Atividade</dt><dd>Ideal</dd></div>
            <div><dt>Temperatura</dt><dd>25 °C</dd></div>
            <div><dt>Solvente</dt><dd>H₂O</dd></div>
          </dl>
        </div>
      </aside>

      <section className="workspace" id="workspace">
        <div className="workspace-heading">
          <div>
            <p className="breadcrumb">Consulta <span>/</span> definição do sistema</p>
            <h1>Sistema de equilíbrio</h1>
            <p>Selecione os materiais da base, informe as concentrações analíticas e calcule a especiação.</p>
          </div>
        </div>

        {error && <div className="notice notice-error" role="alert"><span aria-hidden="true">!</span><p>{error}</p></div>}

        <div className="work-grid">
          <div className="input-column">
            <section className="panel conditions-panel compact-conditions" aria-labelledby="conditions-title">
              <div className="conditions-row">
                <div><span className="section-index">01</span><h2 id="conditions-title">Condições do sistema</h2></div>
                <label><span>Temperatura</span><span className="input-shell"><input value="25,00" readOnly aria-label="Temperatura" /><small>°C</small></span></label>
                <label><span>Volume de referência</span><span className="input-shell"><input value="1,000" readOnly aria-label="Volume de referência" /><small>L</small></span></label>
                <label><span>Modelo de atividade</span><span className="select-shell"><select value={activityModel} onChange={(event) => setActivityModel(event.target.value)} aria-label="Modelo de atividade"><option value="ideal">Solução ideal</option></select></span></label>
              </div>
            </section>

            <section className="panel components-panel" id="components" aria-labelledby="components-title">
              <div className="panel-heading">
                <div><span className="section-index">02</span><h2 id="components-title">Composição analítica</h2></div>
                <button type="button" className="text-button" onClick={addEntry} disabled={entries.length >= database.materials.length}>+ Adicionar componente</button>
              </div>
              <div className="component-table" role="table" aria-label="Materiais adicionados à consulta">
                <div className="component-table-head" role="row">
                  <span role="columnheader">Componente adicionado</span>
                  <span role="columnheader">Concentração</span>
                  <span role="columnheader">Unidade</span>
                  <span role="columnheader"><span className="sr-only">Ações</span></span>
                </div>
                {entries.map((entry) => {
                  const material = materialById.get(entry.materialId)!;
                  return (
                    <div className="component-table-row editable" role="row" key={entry.id}>
                      <span className="material-select" role="cell">
                        <select value={entry.materialId} onChange={(event) => updateEntry(entry.id, { materialId: event.target.value })} aria-label={`Componente da linha ${entry.id}`}>
                          {database.materials.map((option) => <option value={option.material_id} key={option.material_id}>{displayFormula(option.formula)} — {option.name}</option>)}
                        </select>
                      </span>
                      <span role="cell"><input inputMode="decimal" value={entry.concentration} onChange={(event) => updateEntry(entry.id, { concentration: event.target.value })} aria-label={`Concentração de ${material.name}`} /></span>
                      <span role="cell">mol/L</span>
                      <span role="cell"><button type="button" className="remove-button" onClick={() => removeEntry(entry.id)} aria-label={`Remover ${material.name}`} title={`Remover ${material.name}`}>×</button></span>
                    </div>
                  );
                })}
                {entries.length === 0 && <div className="empty-entry">Nenhum componente adicionado.</div>}
              </div>
              <div className="component-actions">
                <button type="button" className="primary-button" onClick={() => calculate(entries)} disabled={entries.length === 0}>Calcular</button>
              </div>
            </section>
          </div>

          <aside className="results-column" id="results" aria-labelledby="results-title">
            <section className="panel result-card">
              <div className="panel-heading compact">
                <div><span className="section-index">03</span><h2 id="results-title">Resultado do equilíbrio</h2></div>
                {result && <span className="converged"><i /> convergiu</span>}
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

            {result && <section className="panel distribution-card" aria-labelledby="distribution-title">
              <div className="panel-heading compact"><div><h2 id="distribution-title">Distribuição por família</h2></div><span className="unit-label">fração molar</span></div>
              <div className="distribution-list">
                {distributions.map((item, index) => (
                  <div className="distribution-row" key={item.species.species_id}>
                    <div><strong>{displayFormula(item.species.formula)}</strong><span>{formatDecimal(item.share, 2, 2)}%</span></div>
                    <span className="bar-track"><i className={`bar-tone-${index % 5}`} style={{ width: `${Math.max(item.share, 1.2)}%` }} /></span>
                  </div>
                ))}
              </div>
            </section>}
          </aside>
        </div>

        <section className="panel species-panel" id="species" aria-labelledby="species-title">
          <div className="panel-heading"><div><span className="section-index">04</span><h2 id="species-title">Concentrações de equilíbrio</h2></div>{result && <div className="table-tools"><span>{result.selectedSpecies.length} espécies ativas</span></div>}</div>
          {result ? <div className="species-table-wrap">
            <table>
              <thead><tr><th>Espécie</th><th>Nome</th><th>Família</th><th>Carga</th><th>Concentração (mol/L)</th></tr></thead>
              <tbody>{result.selectedSpecies.map((species) => <tr key={species.species_id}><td><strong>{displayFormula(species.formula)}</strong></td><td>{species.name}</td><td>{familyForSpecies(species.species_id)}</td><td>{species.charge > 0 ? `+${species.charge}` : species.charge}</td><td><code>{scientific(result.concentrations[species.species_id])}</code></td></tr>)}</tbody>
            </table>
          </div> : <div className="empty-result table-empty">—</div>}
        </section>

        <footer className="app-footer">
          <span>Base química · {database.components.length} componentes · {database.materials.length} materiais</span><span>Modelo ácido-base ideal</span>
        </footer>
      </section>
    </main>
  );
}
