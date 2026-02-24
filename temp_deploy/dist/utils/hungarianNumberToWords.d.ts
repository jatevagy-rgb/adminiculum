/**
 * Hungarian Number to Words Converter
 * Converts numbers to Hungarian text representation
 */
export declare class HungarianNumberToWords {
    private static readonly unitWords;
    private static readonly tenWords;
    private static readonly hundredWords;
    /**
     * Convert a number to Hungarian words
     * @param number - The number to convert (can be number or string)
     * @returns Hungarian text representation
     */
    static convert(number: number | string): string;
    /**
     * Convert a number to Hungarian Forint words
     * @param amount - Amount in HUF
     * @returns Formatted Hungarian text with "forint"
     */
    static toForint(amount: number | string): string;
    /**
     * Convert a number to Hungarian Forint and Fillér words
     * @param amount - Amount in HUF with decimals
     * @returns Formatted Hungarian text with "forint" and "fillér"
     */
    static toForintFillers(amount: number | string): string;
}
export default HungarianNumberToWords;
//# sourceMappingURL=hungarianNumberToWords.d.ts.map