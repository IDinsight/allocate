// Per-letter spans for the wavy text animations. Colour is declared per run of
// text rather than per letter, and the extra spaces inside a run are what widen
// the letter spacing — each space is its own flex item and picks up the
// container's gap.

export type Run = [text: string, color: string];

// One <span> per character, with the wave staggered across the whole line
// rather than restarting at each run.
export function colorLetters(runs: Run[], step: number) {
  let i = -1;
  return runs.flatMap(([text, color]) =>
    [...text].map((ch) => {
      i += 1;
      return (
        <span key={i} style={{ animationDelay: `${i * step}s`, color }}>
          {ch}
        </span>
      );
    })
  );
}
