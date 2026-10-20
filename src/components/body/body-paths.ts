/**
 * Stylized anatomical body figure (own artwork). Coordinates for the left half of the image
 * (x < 100) in a 200 × 410 viewBox; the right half is mirrored. Each muscle path is keyed by the
 * muscle group id used in the database, so the figure is data-driven.
 */

export type BodyView = "front" | "back";

export const SILHOUETTE =
  "M100,10 C88,10 83,20 83,32 C83,43 87,50 92,54 L92,61 C84,65 75,67 67,70 C56,73 50,81 48,93 " +
  "C46,108 46,128 48,147 C45,168 43,190 44,210 C42,220 40,231 43,239 C47,244 53,241 54,233 L56,214 " +
  "C60,193 64,173 66,156 C67,168 67,180 65,196 C62,228 64,262 70,298 C66,322 66,350 71,383 " +
  "C69,391 65,398 71,402 L86,402 C88,396 87,388 86,380 C90,352 92,326 90,302 C94,276 98,240 99,206 L100,206 Z";

export interface MusclePath {
  id: string;
  d: string;
}

export const FRONT: MusclePath[] = [
  { id: "traps", d: "M92,59 C88,63 80,67 72,70 L84,72 C88,70 92,67 95,64 Z" },
  { id: "delts_side", d: "M67,70 C57,72 50,80 49,92 L53,96 C54,85 59,77 69,73 Z" },
  { id: "delts_front", d: "M70,73 C61,76 55,85 54,96 L60,103 C62,93 67,85 78,80 L81,74 Z" },
  { id: "chest", d: "M82,74 L98,76 L98,111 C90,116 77,114 67,106 C62,100 62,92 64,88 C68,82 74,77 82,74 Z" },
  { id: "biceps", d: "M54,101 C50,112 50,129 53,145 L63,146 C65,131 65,114 61,105 Z" },
  { id: "forearms", d: "M51,152 C46,170 44,190 46,211 L54,212 C58,193 61,174 64,155 Z" },
  { id: "obliques", d: "M66,110 C71,117 80,120 86,121 L87,177 C80,176 74,172 70,164 C70,146 68,128 66,110 Z" },
  { id: "abs", d: "M89,118 L98,117 L98,182 L90,180 C88,160 87,138 89,118 Z" },
  { id: "abductors", d: "M69,171 C66,181 64,193 64,205 L71,198 C71,188 73,180 76,175 Z" },
  { id: "quads", d: "M72,198 C68,222 68,252 72,290 L86,296 L91,292 C93,264 93,232 90,205 C84,195 78,193 72,198 Z" },
  { id: "adductors", d: "M91,205 L99,197 L99,252 C98,262 96,272 93,282 C95,256 95,228 91,205 Z" },
  { id: "calves", d: "M72,308 C68,330 70,356 75,380 L84,380 C87,356 89,330 87,307 Z" },
];

export const BACK: MusclePath[] = [
  { id: "traps", d: "M100,55 L88,62 L70,71 L86,80 L100,120 Z" },
  { id: "delts_side", d: "M67,70 C57,72 50,80 49,92 L53,96 C54,85 59,77 69,73 Z" },
  { id: "delts_rear", d: "M70,73 C61,76 55,85 54,96 L60,101 C62,91 68,84 79,79 Z" },
  { id: "upper_back", d: "M86,82 L97,114 L89,117 C84,108 78,100 71,94 C71,88 75,84 86,82 Z" },
  { id: "lats", d: "M70,97 C78,104 85,116 91,122 L98,127 L98,160 C90,162 80,160 74,154 C70,140 66,118 66,101 Z" },
  { id: "lower_back", d: "M92,129 L99,131 L99,179 L88,181 C90,164 90,146 92,129 Z" },
  { id: "triceps", d: "M53,100 C49,112 49,129 52,147 L62,148 C64,130 64,113 60,103 Z" },
  { id: "forearms", d: "M51,152 C46,170 44,190 46,211 L54,212 C58,193 61,174 64,155 Z" },
  { id: "abductors", d: "M70,168 C67,173 66,178 67,185 C76,181 86,180 97,181 L97,174 C88,170 79,169 70,168 Z" },
  { id: "glutes", d: "M68,188 C65,199 66,211 72,220 C82,227 93,225 99,219 L99,185 C88,183 77,184 68,188 Z" },
  { id: "hamstrings", d: "M72,225 C70,249 72,273 76,296 L86,298 L93,295 C95,272 95,249 94,228 C87,230 79,230 72,225 Z" },
  { id: "adductors", d: "M95,228 L99,225 L99,262 L95,271 C96,256 96,242 95,228 Z" },
  { id: "calves", d: "M72,306 C65,326 67,346 75,363 L84,365 C90,346 90,326 86,306 Z" },
];

/** Decorative inner lines (abs segmentation etc.), not interactive. */
export const FRONT_DETAILS = "M90,134 L98,133 M90,150 L98,149 M90,165 L98,165 M80,98 C84,102 90,104 97,104";
export const BACK_DETAILS = "M96,131 L96,178 M76,148 C82,152 88,154 94,154";

export const VIEW_MUSCLES: Record<BodyView, string[]> = {
  front: [...new Set(FRONT.map((m) => m.id))],
  back: [...new Set(BACK.map((m) => m.id))],
};
