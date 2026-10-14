export const CSV_FIELDS = [
  "title",
  "company",
  "jobUrl",
  "rawDescription",
  "status",
  "appliedDate",
];
export function parseCsv(text) {
  text = text.replace(/^\uFEFF/, "");
  const rows = [];
  let row = [],
    cell = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (!quoted && cell.length) throw new Error("Invalid CSV quote");
      else quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += char;
  }
  if (quoted) throw new Error("Unclosed CSV quote");
  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }
  const headers = rows.shift() ?? [];
  if (!headers.includes("title"))
    throw new Error("CSV requires a title column");
  return rows
    .filter((cells) => cells.some(Boolean))
    .map((cells) => {
      const result = Object.fromEntries(
        headers.map((header, index) => [header, cells[index] ?? ""]),
      );
      return {
        title: result.title,
        company: result.company ?? "",
        jobUrl: result.jobUrl || null,
        rawDescription: result.rawDescription ?? "",
        status:
          result.status === "" || result.status == null
            ? -1
            : Number(result.status),
        appliedDate: result.appliedDate || null,
      };
    });
}
export function toCsv(rows) {
  const escape = (value) =>
    '"' + String(value ?? "").replaceAll('"', '""') + '"';
  const safe = (value) =>
    typeof value === "string" && /^[=+\-@\t\r]/.test(value)
      ? "'" + value
      : value;
  return [
    CSV_FIELDS.join(","),
    ...rows.map((row) =>
      CSV_FIELDS.map((key) => escape(safe(row[key]))).join(","),
    ),
  ].join("\r\n");
}
export function downloadData(name, body, type) {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}
