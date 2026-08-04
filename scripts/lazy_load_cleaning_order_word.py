from pathlib import Path

path = Path("src/App.tsx")
text = path.read_text(encoding="utf-8")

old_import = 'import { downloadCleaningOrderWord } from "./modules/cleaning/services/cleaningOrderDocument";\n'
if text.count(old_import) != 1:
    raise RuntimeError("Importação estática do Word não encontrada exatamente uma vez")
text = text.replace(old_import, "", 1)

old_call = '''    try {
      await downloadCleaningOrderWord(order, inventoryProducts);
      setNotice("Documento Word pronto para enviar à Thelma.");'''
new_call = '''    try {
      const { downloadCleaningOrderWord } = await import("./modules/cleaning/services/cleaningOrderDocument");
      await downloadCleaningOrderWord(order, inventoryProducts);
      setNotice("Documento Word pronto para enviar à Thelma.");'''
if text.count(old_call) != 1:
    raise RuntimeError("Função de download do Word não encontrada exatamente uma vez")
text = text.replace(old_call, new_call, 1)

path.write_text(text, encoding="utf-8")
