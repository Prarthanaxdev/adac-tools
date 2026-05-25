#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { runCLI, type CLIOptions } from '@mindfiredigital/adac-cli';
import { generateTerraformFromAdacFile } from './terraform-generator.js';

// Read version from package.json
const currentDir = fileURLToPath(new URL('.', import.meta.url));
const pkgPath = path.resolve(currentDir, '../package.json');
let version = '0.0.1';
try {
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
  version = pkg.version;
} catch (error) {
  console.warn(`Failed to read package version from ${pkgPath}`, error);
  // Fallback version when package.json can't be read
}

function unavailable(command: string): never {
  throw new Error(`${command} is not available in this build.`);
}

const cliOptions = {
  generateDiagram: async () => {
    unavailable('Diagram generation');
  },
  parseAdac: () => unavailable('ADAC parsing'),
  validateAdacConfig: () => unavailable('ADAC validation'),
  generateTerraformFromYaml: async (
    input: string,
    outputDir?: string,
    validate?: boolean
  ) => {
    const result = generateTerraformFromAdacFile(input, {
      validate: validate ?? true,
    });

    const parsed = path.parse(input);
    const targetDir =
      outputDir ?? path.resolve(parsed.dir, `${parsed.name}-terraform`);

    mkdirSync(targetDir, { recursive: true });
    writeFileSync(path.join(targetDir, 'main.tf'), result.mainTf);
    writeFileSync(path.join(targetDir, 'variables.tf'), result.variablesTf);
    writeFileSync(path.join(targetDir, 'outputs.tf'), result.outputsTf);

    console.log(`Terraform files written to ${targetDir}`);
  },
  version,
} satisfies CLIOptions;

runCLI(cliOptions);
