const species = [
  { formula: "H⁺", family: "Sistema", concentration: "9,2542 × 10⁻⁴", fraction: "—", role: "Componente livre" },
  { formula: "OH⁻", family: "Sistema", concentration: "1,0806 × 10⁻¹¹", fraction: "—", role: "Autoionização" },
  { formula: "CH₃COOH", family: "Acetato", concentration: "2,4533 × 10⁻²", fraction: "98,13%", role: "Protonada" },
  { formula: "CH₃COO⁻", family: "Acetato", concentration: "4,6663 × 10⁻⁴", fraction: "1,87%", role: "Base livre" },
  { formula: "H₃Cit", family: "Citrato", concentration: "5,4947 × 10⁻⁴", fraction: "54,95%", role: "Triprotonada" },
  { formula: "H₂Cit⁻", family: "Citrato", concentration: "4,4221 × 10⁻⁴", fraction: "44,22%", role: "Diprotonada" },
  { formula: "HCit²⁻", family: "Citrato", concentration: "8,2980 × 10⁻⁶", fraction: "0,83%", role: "Monoprotonada" },
];

export const dynamic = "force-static";

const distribution = [
  { formula: "CH₃COOH", share: 98.13, className: "bar-blue" },
  { formula: "CH₃COO⁻", share: 1.87, className: "bar-blue-light" },
  { formula: "H₃Cit", share: 54.95, className: "bar-teal" },
  { formula: "H₂Cit⁻", share: 44.22, className: "bar-teal-light" },
  { formula: "HCit²⁻", share: 0.83, className: "bar-gray" },
];

export default function Home() {
  return (
    <main className="application-shell">
      <header className="app-header">
        <a className="tool-brand" href="#workspace" aria-label="Especiação aquosa — início">
          <span className="tool-mark" aria-hidden="true">Σ</span>
          <span>
            <strong>Especiação aquosa</strong>
            <small>equilíbrio por componentes</small>
          </span>
        </a>

        <div className="project-context" aria-label="Consulta atual">
          <span>Consulta atual</span>
          <strong>Ácido acético + ácido cítrico</strong>
        </div>

        <div className="header-status">
          <span className="demo-badge"><i /> demonstração</span>
          <button type="button" className="icon-button" aria-label="Ajuda sobre a interface">?</button>
        </div>
      </header>

      <aside className="app-sidebar" aria-label="Navegação da ferramenta">
        <nav>
          <p>Consulta</p>
          <a className="active" href="#workspace"><span aria-hidden="true">01</span> Sistema</a>
          <a href="#components"><span aria-hidden="true">02</span> Componentes</a>
          <a href="#results"><span aria-hidden="true">03</span> Resultados</a>
          <a href="#species"><span aria-hidden="true">04</span> Espécies</a>
          <p>Referência</p>
          <a href="#method"><span aria-hidden="true">A</span> Formulação</a>
          <a href="#database"><span aria-hidden="true">B</span> Base química</a>
        </nav>

        <div className="model-summary">
          <div className="summary-heading">
            <span>Modelo ativo</span>
            <i aria-hidden="true" />
          </div>
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
            <p>Configure a composição analítica e examine a distribuição calculada das espécies.</p>
          </div>
          <div className="workspace-actions">
            <button type="button" className="secondary-button" disabled>Nova consulta</button>
            <button type="button" className="primary-button" disabled>
              Calcular
              <small>em integração</small>
            </button>
          </div>
        </div>

        <div className="notice" role="note">
          <span aria-hidden="true">i</span>
          <p><strong>Prévia funcional da interface.</strong> Os dados abaixo pertencem a um caso de teste validado pelo núcleo científico. A edição e o recálculo serão conectados na próxima etapa.</p>
        </div>

        <div className="work-grid">
          <div className="input-column">
            <section className="panel conditions-panel" aria-labelledby="conditions-title">
              <div className="panel-heading">
                <div><span className="section-index">01</span><h2 id="conditions-title">Condições do sistema</h2></div>
                <span className="panel-state">definidas</span>
              </div>
              <div className="field-grid">
                <label>
                  <span>Temperatura</span>
                  <span className="input-shell"><input value="25,00" readOnly aria-label="Temperatura" /><small>°C</small></span>
                </label>
                <label>
                  <span>Volume de referência</span>
                  <span className="input-shell"><input value="1,000" readOnly aria-label="Volume de referência" /><small>L</small></span>
                </label>
                <label>
                  <span>Modelo de atividade</span>
                  <span className="select-shell"><select value="ideal" disabled aria-label="Modelo de atividade"><option value="ideal">Solução ideal</option></select></span>
                </label>
              </div>
            </section>

            <section className="panel components-panel" id="components" aria-labelledby="components-title">
              <div className="panel-heading">
                <div><span className="section-index">02</span><h2 id="components-title">Composição analítica</h2></div>
                <button type="button" className="text-button" disabled>+ Adicionar componente</button>
              </div>

              <div className="component-table" role="table" aria-label="Componentes analíticos da consulta">
                <div className="component-table-head" role="row">
                  <span role="columnheader">Componente</span>
                  <span role="columnheader">Forma adicionada</span>
                  <span role="columnheader">Concentração</span>
                  <span role="columnheader">Unidade</span>
                </div>
                <div className="component-table-row" role="row">
                  <span className="component-name" role="cell"><i>008</i><span><strong>Acetato</strong><small>CH₃COO⁻</small></span></span>
                  <span role="cell">CH₃COOH</span>
                  <span role="cell"><input value="0,025000" readOnly aria-label="Concentração de ácido acético" /></span>
                  <span role="cell">mol/L</span>
                </div>
                <div className="component-table-row" role="row">
                  <span className="component-name" role="cell"><i>009</i><span><strong>Citrato</strong><small>Cit³⁻</small></span></span>
                  <span role="cell">H₃Cit</span>
                  <span role="cell"><input value="0,001000" readOnly aria-label="Concentração de ácido cítrico" /></span>
                  <span role="cell">mol/L</span>
                </div>
                <div className="component-table-row calculated" role="row">
                  <span className="component-name" role="cell"><i>001</i><span><strong>Próton</strong><small>H⁺</small></span></span>
                  <span role="cell">Determinado pelo balanço</span>
                  <span role="cell">—</span>
                  <span role="cell">—</span>
                </div>
              </div>

              <div className="component-footnote">
                <span>Σ</span>
                <p>O componente H⁺ é uma variável livre do sistema. Sua concentração resulta simultaneamente dos balanços de massa e de carga.</p>
              </div>
            </section>
          </div>

          <aside className="results-column" id="results" aria-labelledby="results-title">
            <section className="panel result-card">
              <div className="panel-heading compact">
                <div><span className="section-index">03</span><h2 id="results-title">Estado calculado</h2></div>
                <span className="converged"><i /> convergiu</span>
              </div>

              <div className="ph-result">
                <span>pH de equilíbrio</span>
                <strong>3,033672</strong>
                <code>[H⁺] = 9,2542 × 10⁻⁴ mol/L</code>
              </div>

              <dl className="diagnostics">
                <div><dt>Resíduo de carga</dt><dd>1,05 × 10⁻¹⁸ <small>mol/L</small></dd></div>
                <div><dt>Produto iônico da água</dt><dd>1,000 × 10⁻¹⁴</dd></div>
                <div><dt>Iterações</dt><dd>7</dd></div>
                <div><dt>Espécies ativas</dt><dd>9</dd></div>
              </dl>
            </section>

            <section className="panel distribution-card" aria-labelledby="distribution-title">
              <div className="panel-heading compact">
                <div><h2 id="distribution-title">Distribuição por família</h2></div>
                <span className="unit-label">fração molar</span>
              </div>
              <div className="distribution-list">
                {distribution.map((item) => (
                  <div className="distribution-row" key={item.formula}>
                    <div><strong>{item.formula}</strong><span>{item.share.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}%</span></div>
                    <span className="bar-track"><i className={item.className} style={{ width: `${Math.max(item.share, 1.2)}%` }} /></span>
                  </div>
                ))}
              </div>
            </section>
          </aside>
        </div>

        <section className="panel species-panel" id="species" aria-labelledby="species-title">
          <div className="panel-heading">
            <div><span className="section-index">04</span><h2 id="species-title">Concentrações de equilíbrio</h2></div>
            <div className="table-tools"><span>7 espécies principais</span><button type="button" disabled>Exportar tabela</button></div>
          </div>
          <div className="species-table-wrap">
            <table>
              <thead><tr><th>Espécie</th><th>Família</th><th>Papel no sistema</th><th>Fração na família</th><th>Concentração (mol/L)</th></tr></thead>
              <tbody>
                {species.map((item) => (
                  <tr key={item.formula}>
                    <td><strong>{item.formula}</strong></td>
                    <td>{item.family}</td>
                    <td>{item.role}</td>
                    <td>{item.fraction}</td>
                    <td><code>{item.concentration}</code></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="method-strip" id="method" aria-label="Formulação do modelo">
          <div><span>Relação de formação</span><code>log Cᵢ = log βᵢ + Σⱼ νᵢⱼ log cⱼ</code></div>
          <div><span>Balanço de componente</span><code>Tⱼ = Σᵢ νᵢⱼ Cᵢ</code></div>
          <div><span>Eletroneutralidade</span><code>Σᵢ zᵢ Cᵢ = 0</code></div>
        </section>

        <footer className="app-footer" id="database">
          <span>Base química local · 9 componentes</span>
          <span>Modelo acadêmico em desenvolvimento</span>
          <span>Resultados não armazenados</span>
        </footer>
      </section>
    </main>
  );
}
