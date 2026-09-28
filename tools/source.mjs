/* ---------------------------------------------------------------------------
   source.mjs
   Strip comments from JavaScript or CSS source, keeping string literals and
   line numbers intact.

   The theme assets in assets/ are heavily commented, on purpose: they are read
   by whoever maintains the theme next. That makes any check of the form "this
   file does not contain display:none" wrong, because the comment explaining why
   it must not contain display:none contains display:none. Stripping first is
   the fix.

   It is a scanner, not a parser. It knows about block comments, line comments,
   the three string forms and escapes inside them. It does not know about
   regular expression literals, so a comment sequence inside one would be
   removed. Nothing in this repository has one.
   --------------------------------------------------------------------------- */

export function stripComments(source) {
  let out = '';
  let i = 0;

  const keepNewlines = (from, to) => {
    for (let j = from; j < to; j += 1) out += source[j] === '\n' ? '\n' : ' ';
  };

  while (i < source.length) {
    const two = source.slice(i, i + 2);

    if (two === '/*') {
      const end = source.indexOf('*/', i + 2);
      const stop = end === -1 ? source.length : end + 2;
      keepNewlines(i, stop);
      i = stop;
      continue;
    }

    if (two === '//') {
      let end = source.indexOf('\n', i);
      if (end === -1) end = source.length;
      keepNewlines(i, end);
      i = end;
      continue;
    }

    const ch = source[i];
    if (ch === '"' || ch === "'" || ch === '`') {
      out += ch;
      i += 1;
      while (i < source.length) {
        if (source[i] === '\\') {
          out += source.slice(i, i + 2);
          i += 2;
          continue;
        }
        out += source[i];
        if (source[i] === ch) {
          i += 1;
          break;
        }
        i += 1;
      }
      continue;
    }

    out += ch;
    i += 1;
  }

  return out;
}
