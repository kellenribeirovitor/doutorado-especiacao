# Especiação Química em Solução Aquosa

Ferramenta acadêmica em desenvolvimento para modelagem de equilíbrios ácido-base em fase aquosa, formulada por componentes-base, balanços de massa e eletroneutralidade.

O repositório reúne:

- o núcleo científico em Python;
- a base química em planilhas orientadas a componentes;
- testes de consistência e equilíbrio;
- uma interface web para configuração e leitura dos resultados.

## Escopo atual

- solução aquosa ideal;
- equilíbrio ácido-base;
- autoionização da água;
- entrada por compostos cadastrados ou diretamente por espécies;
- decomposição formal dos compostos em espécies antes do equilíbrio;
- validação da eletroneutralidade das entradas diretas por espécies;
- balanços analíticos por família ácido-base;
- resolução robusta da eletroneutralidade em função de `log10([H+])`.

Precipitação, complexação, oxirredução e correções de atividade ainda não fazem parte desta primeira versão.

## Executar o núcleo científico

Requer Python 3.12 ou compatível.

```bash
python -m pip install -r requirements.txt
python main.py
```

Os caminhos da base e da composição de entrada também podem ser informados pela linha de comando:

```bash
python main.py --database data/base_componentes.xlsx --input data/componentes_selecionados.xlsx
```

## Testes científicos

```bash
python -m unittest discover -s tests -v
```

## Interface web

O código da interface está em `web`. Para desenvolvimento local:

```bash
cd web
pnpm install
pnpm dev
```

A publicação no GitHub Pages é gerada automaticamente a partir da branch `main`. O site é estático, mas executa no próprio navegador o mesmo modelo ideal ácido-base do núcleo Python. O usuário seleciona materiais cadastrados na base, informa as concentrações analíticas e recebe pH, diagnóstico numérico e concentrações de equilíbrio.

A planilha `data/base_componentes.xlsx` continua sendo a fonte de verdade da base química. A interface começa com uma consulta vazia; `data/componentes_selecionados.xlsx` permanece como entrada do programa Python e como caso de regressão nos testes. Depois de alterar a base, sincronize os dados da interface com:

```bash
python scripts/export_web_data.py
```

A base operacional é mantida em cinco tabelas relacionadas: componentes-base,
espécies, composição das espécies, materiais de entrada e decomposição formal
dos materiais em espécies. A antiga aba `material_composition` permanece apenas
como registro legado derivado e não é consumida pelo programa. As abas auxiliares documentam o escopo, as referências, a
origem de cada constante e 18 casos prioritários de validação. As constantes são
armazenadas na convenção única `log10(beta)` e a importação valida
identificadores, cargas, composições, convenções e modelos de entrada antes de
executar qualquer cálculo. Para o escopo ácido-base ideal, cada espécie pode
depender de H+ e de no máximo um componente conservado.

Na interface, cada linha pode ser um **Composto** ou uma **Espécie**, permitindo
misturar os dois tipos na mesma solução. Compostos usam `material_species` para
gerar um vetor formal de espécies; por exemplo, `HF → H+ + F-` e
`CH3COOH → H+ + CH3COO-`. Essa decomposição contabiliza matéria e carga, mas
não fixa a dissociação final: as constantes em `species` determinam novamente a
distribuição de equilíbrio. Quando houver entrada direta por espécies, a soma
`Σ zᵢCᵢ` do conjunto completo é validada antes do solver; entradas sem
eletroneutralidade são recusadas com uma sugestão quantitativa de correção de
carga. Após o cálculo, o relatório pode ser impresso ou salvo em PDF pelo navegador.

Os conjuntos de teste cobrem água pura, ácido/base fortes, neutralização,
tampões monoprotônicos, carbonato, fosfato, citrato, espécies anfipróticas,
concentração nula, separação extrema de escalas e combinações pareadas de todos
os materiais. Carbonato e fosfato foram incluídos com constantes cumulativas a
25 °C e força iônica zero, com rastreabilidade na própria planilha. O carbonato
é tratado como sistema fechado, sem troca com `CO2(g)`.

## Dados e privacidade

A aplicação não utiliza Firebase nem banco de dados remoto. Os cálculos são realizados localmente no navegador e as consultas não são armazenadas. Os arquivos `.xlsx` incluídos integram a base acadêmica necessária para reproduzir os cálculos atuais.
