// Turns "Mon YYYY" month labels into x-axis tick text. The year is shown on
// a second line only under January, or under the first tick when January
// isn't the first month in view, so it isn't repeated on every tick. Pair
// with `whitespace-pre` so the "\n" renders as a line break.
export function monthTickText(labels: string[]): string[] {
  return labels.map((label, i) => {
    const [month, year] = label.split(" ");
    if (!year) return label;
    return i === 0 || month === "Jan" ? `${month}\n${year}` : month;
  });
}
