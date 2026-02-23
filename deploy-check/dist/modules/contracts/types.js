"use strict";
/**
 * Contract Generation Types
 * Type definitions for contract template management and generation
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ADASVETEL_VARIABLES = void 0;
exports.ADASVETEL_VARIABLES = [
    { name: 'szerzodes_helye', label: 'Szerződés helye', type: 'string', required: true },
    { name: 'szerzodes_datuma', label: 'Szerződés dátuma', type: 'date', required: true },
    { name: 'elado_nev', label: 'Eladó neve', type: 'person', required: true },
    { name: 'elado_szul_nev', label: 'Eladó születési neve', type: 'string', required: true },
    { name: 'elado_anya_neve', label: 'Eladó anyja neve', type: 'string', required: true },
    { name: 'elado_szul_hely', label: 'Eladó születési helye', type: 'string', required: true },
    { name: 'elado_szul_ido', label: 'Eladó születési ideje', type: 'date', required: true },
    { name: 'elado_lakcim', label: 'Eladó lakcíme', type: 'address', required: true },
    { name: 'elado_szemelyi_ig', label: 'Eladó személyi igazolvány', type: 'string', required: true },
    { name: 'elado_szemelyi_szam', label: 'Eladó személyi szám', type: 'string', required: true },
    { name: 'elado_allampolgarsag', label: 'Eladó állampolgárság', type: 'string', required: true },
    { name: 'vevo_nev', label: 'Vevő neve', type: 'person', required: true },
    { name: 'vevo_szul_nev', label: 'Vevő születési neve', type: 'string', required: true },
    { name: 'vevo_anya_neve', label: 'Vevő anyja neve', type: 'string', required: true },
    { name: 'vevo_szul_hely', label: 'Vevő születési helye', type: 'string', required: true },
    { name: 'vevo_szul_ido', label: 'Vevő születési ideje', type: 'date', required: true },
    { name: 'vevo_lakcim', label: 'Vevő lakcíme', type: 'address', required: true },
    { name: 'vevo_szemelyi_ig', label: 'Vevő személyi igazolvány', type: 'string', required: true },
    { name: 'vevo_szemelyi_szam', label: 'Vevő személyi szám', type: 'string', required: true },
    { name: 'vevo_allampolgarsag', label: 'Vevő állampolgárság', type: 'string', required: true },
    { name: 'ingatlan_telepules', label: 'Ingatlan település', type: 'string', required: true },
    { name: 'ingatlan_helyrajzi_szam', label: 'Helyrajzi szám', type: 'string', required: true },
    { name: 'ingatlan_iranyitoszam', label: 'Irányítószám', type: 'string', required: true },
    { name: 'ingatlan_utca', label: 'Utca', type: 'string', required: false },
    { name: 'ingatlan_hazszam', label: 'Házszám', type: 'string', required: false },
    { name: 'ingatlan_emelet_ajto', label: 'Emelet/ajtó', type: 'string', required: false },
    { name: 'ingatlan_alapterulet', label: 'Alapterület (m²)', type: 'number', required: true },
    { name: 'ingatlan_tipus_neve', label: 'Ingatlan típusa', type: 'string', required: true },
    { name: 'ingatlan_tulajdoni_hanyad', label: 'Tulajdoni hányad', type: 'string', required: true },
    { name: 'tulajdoni_lap_sorszam', label: 'Tulajdoni lap sorszám', type: 'string', required: true },
    { name: 'kormanyhivatal', label: 'Kormányhivatal', type: 'string', required: true },
    { name: 'belterulet', label: 'Belterület (m²)', type: 'number', required: true },
    { name: 'vetelar', label: 'Vételár (Ft)', type: 'money', required: true },
    { name: 'birtokbaadas_datuma', label: 'Birtokbaadás dátuma', type: 'date', required: true },
    { name: 'kozos_tulajdoni_hanyad', label: 'Közös tulajdoni hányad', type: 'string', required: false },
];
//# sourceMappingURL=types.js.map