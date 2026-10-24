// Presentation only: recognise the legacy importer's standalone block marker
// followed by its first complete field. Incomplete/quoted markers stay intact.
// Search snippets may end halfway through the remaining import fields.
export function formatStudentDescription(value) {
  if (typeof value !== "string" || !value.trim()) return "Cuplikan dokumen belum tersedia.";
  const importBlock = /(?:^|\r?\n)[ \t]*\[Import Metadata\][ \t]*\r?\n[ \t]*Source ID:[ \t]*(?:\d+|-)[ \t]*(?:\r?\n|$)/;
  const match = importBlock.exec(value);
  const fields = ["Nomor Dokumen:", "Access Level:", "Unit Kerja ID:", "Source UUID:", "Source Path:"];
  const remaining = match ? value.slice(match.index + match[0].length).trim().split(/\r?\n/).map(line => line.trim()).filter(Boolean) : [];
  // Refuse prose after the marker; only known importer fields (or a clipped
  // final field label in a search snippet) belong to the technical suffix.
  const valid = match && remaining.every((line, index) => fields.some(field =>
    line.startsWith(field) || (index === remaining.length - 1 && line.length >= 4 && field.startsWith(line))));
  const description = valid ? value.slice(0, match.index) : value;
  return description.trim() || "Cuplikan dokumen belum tersedia.";
}
