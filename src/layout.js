export const CELL_SIZE = 11;
export const CELL_GAP = 3;
export const MARGIN = { top: 30, right: 24, bottom: 34, left: 24 };
export const SKY_PADDING = 40; // extra open sky above/below the grid for fireflies to roam in

export function computeLayout(cells, weekCount) {
  const step = CELL_SIZE + CELL_GAP;
  const gridWidth = weekCount * step - CELL_GAP;
  const gridHeight = 7 * step - CELL_GAP;

  const width = gridWidth + MARGIN.left + MARGIN.right;
  const height = gridHeight + MARGIN.top + MARGIN.bottom + SKY_PADDING * 2;

  const placed = cells.map((c) => {
    const px = MARGIN.left + c.x * step;
    const py = MARGIN.top + SKY_PADDING + c.y * step;
    return {
      ...c,
      px,
      py,
      cx: px + CELL_SIZE / 2,
      cy: py + CELL_SIZE / 2,
    };
  });

  return {
    width,
    height,
    gridTop: MARGIN.top + SKY_PADDING,
    gridBottom: MARGIN.top + SKY_PADDING + gridHeight,
    gridLeft: MARGIN.left,
    gridRight: MARGIN.left + gridWidth,
    cells: placed,
  };
}
