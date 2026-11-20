/**
 * PROJECT FILE VERIFIER
 * ---------------------
 * Run verifyProjectFiles() in the Apps Script editor (Run button),
 * then open the Execution log. For every HTML page file it reports:
 *   - basic structure (starts with <!DOCTYPE, ends with </html>)
 *   - duplicate-paste detection (e.g. "let allSales" appearing twice)
 *   - SYNTAX CHECK of every inline <script> block, parsed by the V8
 *     engine server-side (new Function parses without executing).
 *     A corrupted paste prints the exact SyntaxError message.
 *
 * This inspects the REAL files saved in this Apps Script project —
 * not the local PC copies — so it ends any doubt about what got pasted.
 */
function verifyProjectFiles() {
  const pages = ['sales', 'invoice', 'bulk_print', 'template', 'orders', 'dashboard'];

  pages.forEach(function (name) {
    let raw;
    try {
      // getRawContent() returns the file exactly as saved (scriptlets intact)
      raw = HtmlService.createTemplateFromFile(name).getRawContent();
    } catch (e) {
      Logger.log("== " + name + ".html: CANNOT READ (" + e.message + ")");
      return;
    }

    const trimmed = raw.trim();
    const startsOk = /^<!doctype/i.test(trimmed) || /^</.test(trimmed);
    const endsOk = /<\/html>\s*$/i.test(trimmed) || !/<html/i.test(trimmed);
    let report = "== " + name + ".html: " + raw.length + " chars"
               + " | startsOk=" + startsOk + " | endsOk=" + endsOk;

    if (name === 'sales') {
      const dupCount = (raw.match(/let allSales/g) || []).length;
      report += " | 'let allSales' x" + dupCount + (dupCount > 1 ? "  <-- DOUBLE PASTE!" : "");
      report += " | v6 marker=" + (raw.indexOf('[SALES v6]') !== -1);
    }
    Logger.log(report);

    // --- Syntax-check every inline script block ---
    const re = /<script(\s[^>]*)?>([\s\S]*?)<\/script>/gi;
    let m, blockNo = 0;
    while ((m = re.exec(raw)) !== null) {
      const attrs = m[1] || "";
      const code = m[2] || "";
      if (/\ssrc\s*=/i.test(attrs) || !code.trim()) continue; // external/empty
      blockNo++;
      // Replace Apps Script scriptlets (<?= ... ?>) with a placeholder so
      // the parser sees valid JS; every scriptlet in these files sits
      // inside a quoted string, so a bare X keeps the string intact.
      const parseable = code.replace(/<\?[=!]?[\s\S]*?\?>/g, "X");
      try {
        new Function(parseable); // parses, never executes
        Logger.log("   script block " + blockNo + ": SYNTAX OK (" + code.length + " chars)");
      } catch (e) {
        Logger.log("   script block " + blockNo + ": *** SYNTAX ERROR *** -> " + e.message);
        Logger.log("   >>> This file is the corrupted one. Wipe it (Ctrl+A, Delete) and re-paste.");
      }
    }
  });

  Logger.log("Verification finished.");
}
