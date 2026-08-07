import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';

const outputDir = process.argv[2];
if (!outputDir) throw new Error('Usage: node scripts/extract-workflow-shell.mjs <output-dir>');
fs.mkdirSync(outputDir, { recursive: true });
let count = 0;
const workflowDir = '.github/workflows';
const workflowPaths = fs.readdirSync(workflowDir)
  .filter((name) => name.endsWith('.yml') || name.endsWith('.yaml'))
  .sort()
  .map((name) => path.join(workflowDir, name));
for (const workflowPath of workflowPaths) {
  const workflow = parse(fs.readFileSync(workflowPath, 'utf8'));
  for (const [jobName, job] of Object.entries(workflow.jobs || {})) {
    for (const [stepIndex, step] of (job.steps || []).entries()) {
      if (typeof step.run !== 'string') continue;
      const file = path.join(outputDir, `${path.basename(workflowPath, '.yml')}-${jobName}-${stepIndex}.sh`);
      fs.writeFileSync(file, `#!/usr/bin/env bash\n${step.run}\n`);
      count += 1;
    }
  }
}
if (count === 0) throw new Error('Aucun bloc shell extrait des workflows.');
console.log(`${count} blocs shell extraits.`);
