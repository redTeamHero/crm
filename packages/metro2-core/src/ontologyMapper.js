function normalizeToken(value) {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value).trim().toLowerCase();
}

export function createOntologyMapper(ontologies = []) {
  const byOntology = new Map();
  const byField = new Map();

  for (const ontology of ontologies || []) {
    if (!ontology || !ontology.id) {
      continue;
    }
    const entry = {
      id: ontology.id,
      field: ontology.field || null,
      concepts: new Map(),
    };
    for (const concept of ontology.concepts || []) {
      if (!concept || !concept.id) {
        continue;
      }
      const synonyms = new Set();
      synonyms.add(normalizeToken(concept.id));
      for (const synonym of concept.synonyms || []) {
        const normalized = normalizeToken(synonym);
        if (normalized) {
          synonyms.add(normalized);
        }
      }
      entry.concepts.set(concept.id, synonyms);
    }
    byOntology.set(entry.id, entry);
    if (entry.field) {
      byField.set(entry.field, entry);
    }
  }

  function resolveConcept(ontologyId, rawValue, field) {
    let entry = ontologyId ? byOntology.get(ontologyId) : null;
    if (!entry && field) {
      entry = byField.get(field) || null;
    }
    if (!entry) {
      return null;
    }
    const normalized = normalizeToken(rawValue);
    if (!normalized) {
      return null;
    }
    for (const [conceptId, synonyms] of entry.concepts.entries()) {
      if (synonyms.has(normalized)) {
        return conceptId;
      }
    }
    return null;
  }

  function guessOntologyId(field) {
    return field ? byField.get(field)?.id || null : null;
  }

  return {
    resolveConcept,
    guessOntologyId,
  };
}

export function parseConceptToken(token) {
  if (!token && token !== 0) {
    return { ontologyId: null, conceptId: null };
  }
  const raw = String(token).trim();
  if (!raw) {
    return { ontologyId: null, conceptId: null };
  }
  const parts = raw.split('.');
  if (parts.length === 1) {
    return { ontologyId: null, conceptId: parts[0] };
  }
  const conceptId = parts.pop();
  const ontologyId = parts.join('.') || null;
  return { ontologyId, conceptId };
}
