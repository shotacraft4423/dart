// Minimal planar homography (perspective transform) solver used to map
// camera pixel coordinates onto normalized dartboard coordinates during
// camera calibration. No external dependency (OpenCV.js etc.) needed for
// a 4-point DLT solve.

export type Point = [number, number];

/** 3x3 homography stored row-major, h33 fixed to 1. */
export type Homography = number[]; // length 9

function solveLinearSystem(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col++) {
    let pivotRow = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[pivotRow][col])) pivotRow = r;
    }
    [M[col], M[pivotRow]] = [M[pivotRow], M[col]];

    const pivot = M[col][col];
    if (Math.abs(pivot) < 1e-12) continue;
    for (let c = col; c <= n; c++) M[col][c] /= pivot;

    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = M[r][col];
      for (let c = col; c <= n; c++) M[r][c] -= factor * M[col][c];
    }
  }

  return M.map((row) => row[n]);
}

/** Computes the homography mapping each `src[i]` to `dst[i]`. Requires exactly 4 point pairs. */
export function computeHomography(src: Point[], dst: Point[]): Homography {
  if (src.length !== 4 || dst.length !== 4) {
    throw new Error('computeHomography requires exactly 4 point correspondences');
  }

  const A: number[][] = [];
  const b: number[] = [];

  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i];
    const [X, Y] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -x * X, -y * X]);
    b.push(X);
    A.push([0, 0, 0, x, y, 1, -x * Y, -y * Y]);
    b.push(Y);
  }

  const [h11, h12, h13, h21, h22, h23, h31, h32] = solveLinearSystem(A, b);
  return [h11, h12, h13, h21, h22, h23, h31, h32, 1];
}

export function applyHomography(H: Homography, x: number, y: number): Point {
  const w = H[6] * x + H[7] * y + H[8];
  return [(H[0] * x + H[1] * y + H[2]) / w, (H[3] * x + H[4] * y + H[5]) / w];
}
