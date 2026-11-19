/** World units. The world is a fixed 9:16 box; the renderer scales it to the screen. */
export const COLS = 7;
export const CELL = 36;
/** Inset on each side of a brick inside its cell. */
export const INSET = 2;
export const BRICK = CELL - INSET * 2;
export const W = COLS * CELL; // 252
export const H = 448;
/** Top of the play field (HUD lives above). */
export const TOP = 34;
/** Balls return when they reach this line. */
export const FLOOR = 420;
/** Rows that fit in the field. A brick pushed to this row ends the run. */
export const ROWS = 10;

export const BALL_R = 5;
export const BALL_SPEED = 440;
/** Seconds between balls in a volley. */
export const LAUNCH_INTERVAL = 0.07;
/** Fixed simulation step. */
export const STEP = 1 / 240;

/** Shallowest launch angle allowed, in radians from horizontal. */
export const MIN_ANGLE = (8 * Math.PI) / 180;
/** Balls never travel flatter than this fraction of their speed vertically (prevents endless loops). */
export const MIN_VY_FRACTION = 0.14;

export const SETTLE_TIME = 0.28;
export const DROP_TIME = 0.34;

/** Pixel size of a brick spanning n cells. */
export const span = (n: number) => n * CELL - INSET * 2;
export const brickX = (c: number) => c * CELL + INSET;
export const brickY = (r: number) => TOP + r * CELL + INSET;
export const cellCenterX = (c: number) => c * CELL + CELL / 2;
export const cellCenterY = (r: number) => TOP + r * CELL + CELL / 2;
