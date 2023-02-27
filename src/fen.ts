import { pos2key, invRanks, roleOf, letterOf, changeNumber } from './util.js';
import * as cg from './types.js';

export const initial: cg.FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR';

// Contains a list of all the used pieces of a given color
// Pieces will be mapped alphabetically (e.g. pieces[0] -> 'a', pieces[2] -> 'c', etc.)
export type Mapping = { whitePieces: string[]; blackPieces: string[] };
export const DEFAULT_MAPPING: Mapping = { whitePieces: ['K', 'Q', 'R', 'B', 'N', 'P'], blackPieces: ['k', 'q', 'r', 'b', 'n', 'p'] };

export function read(fen: cg.FEN, bd: cg.BoardDimensions, mapping: Mapping): cg.BoardState {
  const piecesPart = fen.split(' ')[0];
  const bracketIdx = piecesPart.indexOf('[');

  let boardPart: string;
  let pocketPart: string | undefined;
  if (bracketIdx > -1) {
    boardPart = piecesPart.slice(0, bracketIdx);
    pocketPart = piecesPart.slice(bracketIdx + 1, piecesPart.indexOf(']'));
  } else {
    const ranks = piecesPart.split('/');
    boardPart = ranks.slice(0, bd.height).join('/');
    // Handle "pocket after an extra slash" format
    pocketPart = ranks.length > bd.height ? ranks[bd.height] : undefined;
  }

  return {
    pieces: readBoard(boardPart, mapping),
    pockets: readPockets(pocketPart, mapping),
  };
}

function readBoard(fen: cg.FEN, mapping: Mapping): cg.Pieces {
  if (fen === 'start') fen = initial;

  const pieces: cg.Pieces = new Map();
  let row = fen.split('/').length - 1;
  let col = 0;
  let promoted = false;
  let num = 0;

  for (const c of fen) {
    switch (c) {
      case ' ':
      case '[':
        return pieces;
      case '/':
        --row;
        if (row < 0) return pieces;
        col = 0;
        num = 0;
        break;
      case '+':
        promoted = true;
        break;
      case '~': {
        const piece = pieces.get(pos2key([col - 1, row]));
        if (piece) piece.promoted = true;
        break;
      }
      default: {
        const nb = c.charCodeAt(0);
        if (48 <= nb && nb < 58) {
          num = 10 * num + nb - 48;
        } else {
          col += num;
          num = 0;
          const { letter, color } = mapOuterToInner(c, mapping);
          const piece = {
            role: roleOf(letter),
            color,
          } as cg.Piece;
          if (promoted) {
            piece.role = ('p' + piece.role) as cg.Role;
            piece.promoted = true;
            promoted = false;
          }
          pieces.set(pos2key([col, row]), piece);
          ++col;
        }
      }
    }
  }
  return pieces;
}

function readPockets(pocketStr: string | undefined, mapping: Mapping): cg.Pockets | undefined {
  if (pocketStr !== undefined) {
    const whitePocket = new Map();
    const blackPocket = new Map();

    for (const p of pocketStr) {
      const { letter, color } = mapOuterToInner(p, mapping);
      const role = roleOf(letter);
      if (color === 'white') changeNumber(whitePocket, role, 1);
      else changeNumber(blackPocket, role, 1);
    }

    return {
      white: whitePocket,
      black: blackPocket,
    };
  } else {
    return undefined;
  }
}

export function write(boardState: cg.BoardState, bd: cg.BoardDimensions, mapping: Mapping): cg.FEN {
  return writeBoard(boardState.pieces, bd, mapping) + writePockets(boardState.pockets, mapping);
}

export function writeBoard(pieces: cg.Pieces, bd: cg.BoardDimensions, mapping: Mapping): cg.FEN {
  return invRanks
    .slice(-bd.height)
    .map(y =>
      cg.files
        .slice(0, bd.width)
        .map(x => {
          const piece = pieces.get((x + y) as cg.Key);
          if (piece) {
            const p = letterOf(piece.role);
            let outer = mapInnerToOuter(p, piece.color, mapping);
            if (piece.promoted && p.charAt(0) !== '+') outer += '~';
            return outer;
          } else return '1';
        })
        .join('')
    )
    .join('/')
    .replace(/1{2,}/g, s => s.length.toString());
}

function writePockets(pockets: cg.Pockets | undefined, mapping: Mapping): string {
  if (pockets) return '[' + writePocket(pockets.white, 'white', mapping) + writePocket(pockets.black, 'black', mapping) + ']';
  else return '';
}

function writePocket(pocket: cg.Pocket, color: cg.Color, mapping: Mapping): string {
  const letters: string[] = [];
  for (const [r, n] of pocket.entries()) 
    letters.push(mapInnerToOuter(letterOf(r), color, mapping).repeat(n));
  return letters.join('');
}

function mapOuterToInner(c: string, mapping: Mapping): { letter: cg.Alphabet, color: cg.Color } {
  const letterIndexAsWhite = mapping.whitePieces.indexOf(c);
  const letterIndexAsBlack = mapping.blackPieces.indexOf(c);
  if (letterIndexAsWhite === -1 && letterIndexAsBlack === -1)
    throw new Error(`Piece letter ${c} not found in white or black mapping`);
  if (letterIndexAsWhite !== -1 && letterIndexAsBlack !== -1)
    throw new Error(`Piece letter ${c} found in both white and black mappings`);
  const letterIndex = letterIndexAsWhite !== -1 ? letterIndexAsWhite : letterIndexAsBlack;
  // Map 0 -> 'a', 1 -> 'b', etc.
  const letter = String.fromCharCode('a'.charCodeAt(0) + letterIndex) as cg.Alphabet;
  const color: cg.Color = letterIndexAsWhite !== -1 ? 'white' : 'black';
  return {letter, color};
}

function mapInnerToOuter(c: cg.Letter, color: cg.Color, mapping: Mapping): string {
  // cg.Letter can have a '+' prefix, remove it and add it back later
  const isPromoted = c.charAt(0) === '+';
  const letter = isPromoted ? c.charAt(1) : c;
  if (letter === '*') return c;
  const letterIndex = letter.charCodeAt(0) - 'a'.charCodeAt(0);
  const replacedLetter = color === 'white' ? mapping.whitePieces[letterIndex] : mapping.blackPieces[letterIndex];
  return isPromoted ? '+' + replacedLetter : replacedLetter;
}

export function mapIdToRole(outerId: string, mapping: Mapping): { role: cg.Role, color: cg.Color } {
  const { letter, color } = mapOuterToInner(outerId, mapping);
  return { role: roleOf(letter), color };
}
