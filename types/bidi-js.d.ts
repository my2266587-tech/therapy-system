declare module 'bidi-js' {
  export interface EmbeddingLevels {
    levels: Uint8Array;
    paragraphs: { start: number; end: number; level: number }[];
  }

  export interface BidiApi {
    getEmbeddingLevels(text: string, baseDirection?: 'rtl' | 'ltr' | 'auto'): EmbeddingLevels;
    getReorderedString(text: string, embedLevels: EmbeddingLevels, start?: number, end?: number): string;
    getReorderedIndices(text: string, embedLevels: EmbeddingLevels, start?: number, end?: number): number[];
    getReorderSegments(
      text: string,
      embedLevels: EmbeddingLevels,
      start?: number,
      end?: number,
    ): [number, number][];
    getBidiCharType(ch: string): number;
    getBidiCharTypeName(ch: string): string;
    getMirroredCharacter(ch: string): string | null;
    getMirroredCharactersMap(): Map<number, number>;
    closingToOpeningBracket(ch: string): string | null;
    openingToClosingBracket(ch: string): string | null;
    getCanonicalBracket(ch: string): string | null;
  }

  export default function bidiFactory(): BidiApi;
}
