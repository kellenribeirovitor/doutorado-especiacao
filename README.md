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
- misturas de componentes cadastrados;
- resolução simultânea dos balanços de componentes e carga.

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

## Dados e privacidade

A aplicação não utiliza Firebase nem banco de dados remoto. Os cálculos são realizados localmente no navegador e as consultas não são armazenadas. Os arquivos `.xlsx` incluídos integram a base acadêmica necessária para reproduzir os cálculos atuais.
