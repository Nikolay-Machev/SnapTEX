import type { DocumentBlock } from "~/recognition/types";

function escapeLatexText(value: string): string {
  return value.replace(/[&%$#_{}~^\\]/g, (character) => {
    const replacements: Record<string, string> = {
      "&": String.raw`\&`,
      "%": String.raw`\%`,
      "$": String.raw`\$`,
      "#": String.raw`\#`,
      "_": String.raw`\_`,
      "{": String.raw`\{`,
      "}": String.raw`\}`,
      "~": String.raw`\textasciitilde{}`,
      "^": String.raw`\textasciicircum{}`,
      "\\": String.raw`\textbackslash{}`,
    };
    return replacements[character];
  });
}

export function assembleLatexDocument(blocks: DocumentBlock[], pageCount: number): string {
  const ordered = [...blocks].sort(
    (left, right) => left.page - right.page || left.order - right.order,
  );
  const lines = [
    String.raw`\documentclass{article}`,
    String.raw`\usepackage{amsmath,amssymb}`,
    String.raw`\usepackage[margin=1in]{geometry}`,
    String.raw`\begin{document}`,
  ];

  for (let page = 1; page <= pageCount; page += 1) {
    lines.push("", `% Page ${page}`);
    for (const block of ordered.filter((candidate) => candidate.page === page)) {
      if (block.type === "text") {
        lines.push(escapeLatexText(block.content), "");
      } else {
        lines.push(String.raw`\[`, block.content, String.raw`\]`, "");
      }
    }
    if (page < pageCount) lines.push(String.raw`\newpage`);
  }

  lines.push(String.raw`\end{document}`, "");
  return lines.join("\n");
}
