/** Deterministic cutouts keep server/client rendering identical. Decoration only. */
export function PaperShapes() {
  return <div className="paper-shapes" aria-hidden="true">
    <span className="paper-shape pentagon cutout-one" />
    <span className="paper-shape semicircle cutout-two" />
    <span className="paper-shape triangle cutout-three" />
    <span className="paper-shape star cutout-four" />
    <span className="paper-shape circle cutout-five" />
    <span className="paper-shape star cutout-six" />
    <span className="paper-shape triangle cutout-seven" />
    <span className="paper-shape circle cutout-eight" />
  </div>;
}