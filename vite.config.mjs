import { defineConfig } from "vite";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const packageRoot = (resolvedPath) => {
  let currentDir = dirname(resolvedPath);

  while (!existsSync(join(currentDir, "package.json"))) {
    const parentDir = dirname(currentDir);

    if (parentDir === currentDir) {
      throw new Error(`Could not find package root for ${resolvedPath}`);
    }

    currentDir = parentDir;
  }

  return currentDir;
};
const packageDir = (packageName, fromDir) => {
  const resolveOptions = fromDir ? { paths: [fromDir] } : undefined;

  try {
    return dirname(require.resolve(`${packageName}/package.json`, resolveOptions));
  } catch {
    return packageRoot(require.resolve(packageName, resolveOptions));
  }
};
const reactDir = packageDir("react");
const reactDomDir = packageDir("react-dom");
const schedulerDir = packageDir("scheduler");
const tiptapStarterKitDir = packageDir("@tiptap/starter-kit");
const tiptapExtensionLinkDir = packageDir("@tiptap/extension-link");
const tiptapPmDir = packageRoot(require.resolve("@tiptap/pm/state"));
const tiptapReactDir = packageDir("@tiptap/react");
const tiptapDependencyAliases = [
  "@tiptap/extension-blockquote",
  "@tiptap/extension-bold",
  "@tiptap/extension-code",
  "@tiptap/extension-code-block",
  "@tiptap/extension-document",
  "@tiptap/extension-dropcursor",
  "@tiptap/extension-gapcursor",
  "@tiptap/extension-hard-break",
  "@tiptap/extension-heading",
  "@tiptap/extension-horizontal-rule",
  "@tiptap/extension-italic",
  "@tiptap/extension-list",
  "@tiptap/extension-list-item",
  "@tiptap/extension-list-keymap",
  "@tiptap/extension-ordered-list",
  "@tiptap/extension-paragraph",
  "@tiptap/extension-strike",
  "@tiptap/extension-text",
  "@tiptap/extension-underline",
  "@tiptap/extensions",
].map((packageName) => ({
  find: packageName,
  replacement: packageDir(packageName, tiptapStarterKitDir),
}));
const prosemirrorDependencyAliases = [
  "orderedmap",
  "prosemirror-changeset",
  "prosemirror-commands",
  "prosemirror-dropcursor",
  "prosemirror-gapcursor",
  "prosemirror-history",
  "prosemirror-inputrules",
  "prosemirror-keymap",
  "prosemirror-model",
  "prosemirror-schema-list",
  "prosemirror-state",
  "prosemirror-tables",
  "prosemirror-transform",
  "prosemirror-view",
  "rope-sequence",
  "w3c-keyname",
].map((packageName) => ({
  find: packageName,
  replacement: packageDir(packageName, tiptapPmDir),
}));

export default defineConfig({
  resolve: {
    preserveSymlinks: true,
    alias: [
      { find: /^react$/, replacement: join(reactDir, "index.js") },
      { find: /^react\/jsx-runtime$/, replacement: join(reactDir, "jsx-runtime.js") },
      { find: /^react\/jsx-dev-runtime$/, replacement: join(reactDir, "jsx-dev-runtime.js") },
      { find: /^react-dom\/client$/, replacement: join(reactDomDir, "client.js") },
      { find: /^scheduler$/, replacement: join(schedulerDir, "index.js") },
      { find: /^fast-equals$/, replacement: packageDir("fast-equals", tiptapReactDir) },
      { find: /^linkifyjs$/, replacement: packageDir("linkifyjs", tiptapExtensionLinkDir) },
      ...tiptapDependencyAliases,
      ...prosemirrorDependencyAliases,
    ],
  },
  optimizeDeps: {
    esbuildOptions: {
      preserveSymlinks: true,
    },
  },
});
