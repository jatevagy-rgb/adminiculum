/**
 * Hungarian Number to Words Converter
 * Converts numbers to Hungarian text representation
 */
export class HungarianNumberToWords {
    static unitWords = [
        'nulla', 'egy', 'kettő', 'három', 'négy', 'öt', 'hat', 'hét', 'nyolc', 'kilenc',
        'tíz', 'tizenegy', 'tizenkettő', 'tizenhárom', 'tizennégy', 'tizenöt',
        'tizenhat', 'tizenhét', 'tizennyolc', 'tizenkilenc'
    ];
    static tenWords = [
        '', '', 'húsz', 'harminc', 'negyven', 'ötven', 'hatvan', 'hetven', 'nyolcvan', 'kilencven'
    ];
    static hundredWords = [
        '', 'száz', 'kétszáz', 'háromszáz', 'négyszáz', 'ötszáz', 'hatszáz', 'hétszáz', 'nyolcszáz', 'kilencszáz'
    ];
    /**
     * Convert a number to Hungarian words
     * @param number - The number to convert (can be number or string)
     * @returns Hungarian text representation
     */
    static convert(number) {
        if (!number)
            return 'nulla';
        const num = typeof number === 'string' ? parseFloat(number) : number;
        if (isNaN(num))
            return 'nulla';
        if (num < 0)
            return 'mínusz ' + this.convert(-num);
        if (num === 0)
            return 'nulla';
        // Handle millions
        if (num >= 1000000) {
            const millions = Math.floor(num / 1000000);
            const remainder = num % 1000000;
            const millionsText = millions === 1 ? 'egy millió' : this.convert(millions) + ' millió';
            return remainder > 0 ? millionsText + ' ' + this.convert(remainder) : millionsText;
        }
        // Handle thousands
        if (num >= 1000) {
            const thousands = Math.floor(num / 1000);
            const remainder = num % 1000;
            const thousandsText = thousands === 1 ? 'ezer' : this.convert(thousands) + 'ezer';
            return remainder > 0 ? thousandsText + ' ' + this.convert(remainder) : thousandsText;
        }
        // Handle hundreds
        if (num >= 100) {
            const hundreds = Math.floor(num / 100);
            const remainder = num % 100;
            const hundredsText = this.hundredWords[hundreds];
            return remainder > 0 ? hundredsText + ' ' + this.convert(remainder) : hundredsText;
        }
        // Handle 20-99
        if (num >= 20) {
            const tens = Math.floor(num / 10);
            const units = num % 10;
            const tensText = this.tenWords[tens];
            return units > 0 ? tensText + this.convert(units) : tensText;
        }
        // Handle 0-19
        return this.unitWords[num];
    }
    /**
     * Convert a number to Hungarian Forint words
     * @param amount - Amount in HUF
     * @returns Formatted Hungarian text with "forint"
     */
    static toForint(amount) {
        const num = typeof amount === 'string' ? parseFloat(amount) : amount;
        if (isNaN(num))
            return 'nulla forint';
        const forintText = this.convert(Math.floor(num));
        return `${forintText} forint`;
    }
    /**
     * Convert a number to Hungarian Forint and Fillér words
     * @param amount - Amount in HUF with decimals
     * @returns Formatted Hungarian text with "forint" and "fillér"
     */
    static toForintFillers(amount) {
        const num = typeof amount === 'string' ? parseFloat(amount) : amount;
        if (isNaN(num))
            return 'nulla forint';
        const forint = Math.floor(num);
        const fillers = Math.round((num - forint) * 100);
        const forintText = this.convert(forint);
        const fillersText = fillers > 0 ? this.convert(fillers) + ' fillér' : '';
        return fillersText ? `${forintText} forint ${fillersText}` : `${forintText} forint`;
    }
}
export default HungarianNumberToWords;
//# sourceMappingURL=hungarianNumberToWords.js.map