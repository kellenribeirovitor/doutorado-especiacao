# Interface web

Interface da ferramenta de especiação aquosa, construída com React e vinext.

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

Os dados mostrados nesta etapa são um caso científico de referência. Os controles de cálculo permanecem desativados até que o solver seja integrado ao navegador.
