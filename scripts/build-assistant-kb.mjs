import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const manualPreevalPath = path.join(
  rootDir,
  "backend",
  "app",
  "assistant",
  "kb",
  "manual",
  "preevaluacion.json"
);
const manualPlataformaPath = path.join(
  rootDir,
  "backend",
  "app",
  "assistant",
  "kb",
  "manual",
  "plataforma.json"
);
const academyContentPath = path.join(
  rootDir,
  "frontend",
  "src",
  "constants",
  "academyContent.js"
);
const outputKbPath = path.join(
  rootDir,
  "backend",
  "app",
  "assistant",
  "kb",
  "kb.json"
);

async function buildKnowledgeBase() {
  console.log("Compiling Assistant Knowledge Base...");
  const chunks = [];

  // 1. Manual chunks: Pre-evaluacion
  if (fs.existsSync(manualPreevalPath)) {
    const preevalChunks = JSON.parse(fs.readFileSync(manualPreevalPath, "utf-8"));
    chunks.push(...preevalChunks);
    console.log(`Loaded ${preevalChunks.length} chunks from preevaluacion.json`);
  }

  // 2. Manual chunks: Plataforma
  if (fs.existsSync(manualPlataformaPath)) {
    const platChunks = JSON.parse(fs.readFileSync(manualPlataformaPath, "utf-8"));
    chunks.push(...platChunks);
    console.log(`Loaded ${platChunks.length} chunks from plataforma.json`);
  }

  // 3. Academia content
  if (fs.existsSync(academyContentPath)) {
    // Copy to temp .mjs so Node ES module loader accepts it regardless of package.json
    const tempMjsPath = path.join(__dirname, "_temp_academyContent.mjs");
    fs.copyFileSync(academyContentPath, tempMjsPath);
    let academyModule;
    try {
      academyModule = await import(`file://${tempMjsPath.replace(/\\/g, "/")}`);
    } finally {
      if (fs.existsSync(tempMjsPath)) {
        fs.unlinkSync(tempMjsPath);
      }
    }

    const { ACADEMY_GLOSSARY, ACADEMY_ARTICLES } = academyModule;

    // Glossary entries
    if (ACADEMY_GLOSSARY) {
      let glossaryCount = 0;
      for (const [key, item] of Object.entries(ACADEMY_GLOSSARY)) {
        chunks.push({
          id: `glossary-${key.toLowerCase().replace(/\s+/g, "-")}`,
          title: `Glosario: ${item.label}`,
          category: "glosario",
          step: null,
          step_name: null,
          field_id: null,
          screen_id: "academia",
          content: `${item.label}: ${item.definition}`,
          synonyms: [item.label.toLowerCase(), `que es ${item.label.toLowerCase()}`, `definicion de ${item.label.toLowerCase()}`],
          link: item.articleId
            ? {
                type: "academy",
                articleId: item.articleId,
                label: `Leer en Academia: ${item.label}`,
              }
            : null,
        });
        glossaryCount++;
      }
      console.log(`Added ${glossaryCount} glossary terms`);
    }

    // Article entries
    if (Array.isArray(ACADEMY_ARTICLES)) {
      let articleCount = 0;
      for (const art of ACADEMY_ARTICLES) {
        const summary = art.summary || "";
        const takeaways = Array.isArray(art.takeaways) ? art.takeaways.join(". ") : "";
        const fullText = [art.title, summary, takeaways].filter(Boolean).join("\n\n");

        chunks.push({
          id: `article-${art.id}`,
          title: art.title,
          category: "academia",
          step: null,
          step_name: null,
          field_id: null,
          screen_id: "academia",
          content: fullText,
          synonyms: [art.title.toLowerCase(), ...(art.tags || []).map((t) => t.toLowerCase())],
          link: {
            type: "academy",
            articleId: art.id,
            label: `Ver artículo: ${art.title}`,
          },
        });
        articleCount++;
      }
      console.log(`Added ${articleCount} academy articles`);
    }
  }

  // Ensure output directory exists
  fs.mkdirSync(path.dirname(outputKbPath), { recursive: true });

  const jsonStr = JSON.stringify(chunks, null, 2);
  fs.writeFileSync(outputKbPath, jsonStr, "utf-8");

  const kbSizeKb = (Buffer.byteLength(jsonStr, "utf-8") / 1024).toFixed(1);
  console.log(`✓ Generated ${outputKbPath}`);
  console.log(`  Total chunks: ${chunks.length}`);
  console.log(`  Total size: ${kbSizeKb} KB`);
}

buildKnowledgeBase().catch((err) => {
  console.error("Failed to build KB:", err);
  process.exit(1);
});
