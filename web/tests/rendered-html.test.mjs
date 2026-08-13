import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const outputRoot = new URL("../dist/client/", import.meta.url);

test("gera a ferramenta como uma página estática", async () => {
  const html = await readFile(new URL("index.html", outputRoot), "utf8");

  assert.match(html, /<!DOCTYPE html>/i);
  assert.match(html, /<html[^>]*lang="pt-BR"/i);
  assert.match(html, /Especiação Química em Solução Aquosa/);
  assert.doesNotMatch(html, /Especiação aquosa/);
  assert.match(html, /Sistema de equilíbrio/);
  assert.match(html, /Composição analítica/);
  assert.match(html, /Nenhum componente adicionado/);
  assert.doesNotMatch(html, /3,033672/);
  assert.match(html, /Concentrações de equilíbrio/);
  assert.match(html, /Adicionar componente/);
  assert.match(html, /Calcular/);
  assert.doesNotMatch(html, /Modelo ativo/);
  assert.match(html, /Tipos de equilíbrio/);
  assert.match(html, /Condições do sistema/);
  assert.match(html, /Distribuição/);
  assert.match(html, /Ácido–base/);
  assert.match(html, /Complexação/);
  assert.match(html, /Redox/);
  assert.match(html, /Precipitação/);
  assert.doesNotMatch(html, /Volume de referência/);
  assert.doesNotMatch(html, /href="#method"|href="#database"/);
  assert.doesNotMatch(html, /method-strip|Relação de formação/);
  assert.doesNotMatch(html, /equilíbrio por componentes|Consulta atual|Nova consulta/);
  assert.doesNotMatch(html, /Consulta <span>\/|Selecione os materiais da base/);
  assert.doesNotMatch(html, /Ajuda sobre a interface|Base química ·|Modelo ácido-base ideal/);
  assert.doesNotMatch(html, /aria-label="Modelo de atividade"[^>]*disabled/);
  assert.doesNotMatch(html, /Restaurar exemplo|Carregar exemplo/);
  assert.doesNotMatch(html, /react-loading-skeleton|Starter Project/);
});

test("usa caminhos compatíveis com o repositório no GitHub Pages", async () => {
  const html = await readFile(new URL("index.html", outputRoot), "utf8");

  assert.match(html, /\/doutorado-especiacao\/_next\//);
  assert.doesNotMatch(html, /(?:href|src)="\/_next\//);
  await access(new URL("_next", outputRoot));
  await access(new URL(".nojekyll", outputRoot));
});
