// Serialize a JS object/array back into source text for the data files.
// Extracted from content-refresh.js so the (bug-prone) serialization logic can
// be unit-tested in isolation — the `endDate:"undefined"` production bug lived
// here. Used by content-refresh.js's replaceJsValue().

function serializeObject(varName, obj) {
  // Use JSON.stringify so keys and values are always safely quoted as JS
  // string literals — handles apostrophes, backslashes, newlines, control
  // chars, and unicode without manual escaping.  The keys produced are valid
  // ECMAScript object property names because every JSON-stringified string is
  // a valid JS string literal.
  //
  // Values get JSON.stringify(v) directly (NOT JSON.stringify(String(v)))
  // — String({...}) coerces nested objects to the literal "[object Object]"
  // before JSON sees them, producing useless garbage in the output. With
  // raw JSON.stringify, string values land as quoted strings and nested
  // objects land as valid inline JSON ({"zoomUrl":"…","meetingId":"…"}).
  // (For MEETING_AGENDA_META, which has object values.)
  const entries = Object.entries(obj).map(([k, v]) => {
    return `  ${JSON.stringify(String(k))}:\n    ${JSON.stringify(v)}`;
  });
  return `const ${varName} = {\n${entries.join(',\n\n')}\n};`;
}

function serializeArray(varName, arr) {
  // JS object property names without quotes must be valid identifiers; if
  // they aren't (e.g. contain special chars), fall back to JSON.stringify so
  // the key gets quoted.  All string values flow through JSON.stringify so
  // apostrophes, backslashes, newlines, and control chars are safe.
  const safeKey = (k) => /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(k) ? k : JSON.stringify(k);
  const items = arr.map(item => {
    // Omit keys whose value is undefined. Writers intentionally set optional
    // fields to undefined (e.g. `endDate: endDay !== startDay ? endDay : undefined`)
    // to mean "leave it out". Without this filter the fallback below ran
    // JSON.stringify(String(undefined)) → the literal string "undefined", which
    // is TRUTHY at render time (events.html), breaking date ranges and
    // misclassifying single-day events as weekly. See docs/content-review.md.
    const props = Object.entries(item).filter(([, v]) => v !== undefined).map(([k, v]) => {
      if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
        const inner = Object.entries(v).map(([ik, iv]) => `${safeKey(ik)}: ${JSON.stringify(String(iv))}`).join(', ');
        return `    ${safeKey(k)}: { ${inner} }`;
      }
      if (Array.isArray(v)) {
        return `    ${safeKey(k)}: [${v.map(i => JSON.stringify(String(i))).join(', ')}]`;
      }
      if (v === null) {
        // Emit the literal `null` keyword, NOT JSON.stringify(String(null)) —
        // that fallback produced the quoted string "null", which is TRUTHY at
        // render time. getSmartMeetings()/getMVMeetings() do `!!m.agendaUrl`
        // and `m.agendaUrl || fallback`, so a "null" string made hasAgenda
        // true and pointed the "View Agenda" button at a broken `/null` link.
        // (Same class of bug as the endDate:"undefined" fix above.)
        return `    ${safeKey(k)}: null`;
      }
      if (typeof v === 'boolean' || typeof v === 'number') {
        return `    ${safeKey(k)}: ${v}`;
      }
      return `    ${safeKey(k)}: ${JSON.stringify(String(v))}`;
    });
    return `  {\n${props.join(',\n')}\n  }`;
  });
  return `const ${varName} = [\n${items.join(',\n')}\n];`;
}

module.exports = { serializeObject, serializeArray };
