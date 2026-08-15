# Interface web

Interface da ferramenta Especiação Química em Solução Aquosa, construída com React e vinext.

## Desenvolvimento local

```bash
pnpm install
pnpm dev
```

A prévia local fica disponível em `http://localhost:3000`.

## Verificações

```bash
pnpm lint
pnpm build
pnpm test
```

## GitHub Pages

O modo `output: "export"` gera o site estático em `dist/client`. Durante o GitHub Actions, os recursos recebem o prefixo `/doutorado-especiacao/`, correspondente ao endereço do repositório no Pages.

A interface executa localmente no navegador o solver ácido-base ideal. A base
química é gerada a partir de `../data/base_componentes.xlsx` pelo comando
`pnpm data:sync`, evitando a manutenção manual de duas fontes de dados.

A composição pode misturar linhas de compostos e de espécies. Os compostos são
normalizados pela tabela `material_species`; quando houver entrada direta por
espécies, o conjunto completo somente segue para o solver quando `Σ zᵢCᵢ`
satisfaz a tolerância de eletroneutralidade. Depois do cálculo, a interface oferece
um relatório preparado para impressão ou salvamento em PDF pelo navegador.
