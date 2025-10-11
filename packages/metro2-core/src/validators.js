import { loadMetro2Violations, loadKnowledgeGraph } from './utils.js';
import { createOntologyMapper } from './ontologyMapper.js';
import { compileViolationConstraints } from './knowledgeGraph.js';

const metadata = loadMetro2Violations();
const knowledgeGraph = loadKnowledgeGraph();
const ontologyMapper = createOntologyMapper(knowledgeGraph.ontologies || []);
const compiledConstraints = compileViolationConstraints(knowledgeGraph, ontologyMapper);

export function enrich(code, extra = {}) {
  const key = code.toUpperCase();
  const base = metadata[key] || { violation: 'Unknown violation code' };
  return { code: key, ...base, ...extra };
}

export function validateTradeline(tradeline = {}) {
  const violations = [];
  for (const constraint of compiledConstraints) {
    if (constraint.evaluate(tradeline)) {
      const extra = constraint.buildExtra(tradeline);
      violations.push(enrich(constraint.id, extra));
    }
  }
  return violations;
}
