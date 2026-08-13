import { access, cp, rm, writeFile } from "node:fs/promises";

const repositoryName = "doutorado-especiacao";
const outputRoot = new URL("../dist/client/", import.meta.url);
const prefixedAssets = new URL(`${repositoryName}/_next/`, outputRoot);
const deployedAssets = new URL("_next/", outputRoot);

async function exists(url) {
  try {
    await access(url);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

if (!(await exists(new URL("index.html", outputRoot)))) {
  throw new Error("A exportação estática não gerou dist/client/index.html.");
}

if (await exists(prefixedAssets)) {
  await rm(deployedAssets, { recursive: true, force: true });
  await cp(prefixedAssets, deployedAssets, { recursive: true });
  await rm(new URL(`${repositoryName}/`, outputRoot), { recursive: true, force: true });
}

if (!(await exists(deployedAssets))) {
  throw new Error("Os recursos estáticos _next não foram encontrados.");
}

await writeFile(new URL(".nojekyll", outputRoot), "");
