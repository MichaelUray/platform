// SPDX-License-Identifier: EPL-2.0

const { compile } = require('svelte/compiler')
const ts = require('typescript')

// Compile the tested components and Svelte's ESM runtime for Jest's CommonJS execution.
module.exports = {
  process (source, filename) {
    let code = source
    if (filename.endsWith('.svelte')) {
      const javascript = source.replace(/<script lang="ts">([\s\S]*?)<\/script>/g, (_, script) => {
        const result = ts.transpileModule(script, {
          compilerOptions: {
            target: ts.ScriptTarget.ES2020,
            module: ts.ModuleKind.ESNext,
            verbatimModuleSyntax: true
          }
        })
        return `<script>${result.outputText}</script>`
      })
      code = compile(javascript, { filename, generate: 'dom', dev: true }).js.code
    }
    return {
      code: ts.transpileModule(code, {
        compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, allowJs: true }
      }).outputText
    }
  }
}
