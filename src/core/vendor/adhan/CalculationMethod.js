"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const CalculationParameters_js_1 = __importDefault(require("./CalculationParameters.js"));
const Rounding_js_1 = require("./Rounding.js");
const CalculationMethod = {
    // Muslim World League
    MuslimWorldLeague() {
        const params = new CalculationParameters_js_1.default('MuslimWorldLeague', 18, 17);
        params.methodAdjustments.dhuhr = 1;
        return params;
    },
    // Egyptian General Authority of Survey
    Egyptian() {
        const params = new CalculationParameters_js_1.default('Egyptian', 19.5, 17.5);
        params.methodAdjustments.dhuhr = 1;
        return params;
    },
    // University of Islamic Sciences, Karachi
    Karachi() {
        const params = new CalculationParameters_js_1.default('Karachi', 18, 18);
        params.methodAdjustments.dhuhr = 1;
        return params;
    },
    // Umm al-Qura University, Makkah
    UmmAlQura() {
        return new CalculationParameters_js_1.default('UmmAlQura', 18.5, 0, 90);
    },
    // Dubai
    Dubai() {
        const params = new CalculationParameters_js_1.default('Dubai', 18.2, 18.2);
        params.methodAdjustments = {
            ...params.methodAdjustments,
            sunrise: -3,
            dhuhr: 3,
            asr: 3,
            maghrib: 3,
        };
        return params;
    },
    // Moonsighting Committee
    MoonsightingCommittee() {
        const params = new CalculationParameters_js_1.default('MoonsightingCommittee', 18, 18);
        params.methodAdjustments = {
            ...params.methodAdjustments,
            dhuhr: 5,
            maghrib: 3,
        };
        return params;
    },
    // ISNA
    NorthAmerica() {
        const params = new CalculationParameters_js_1.default('NorthAmerica', 15, 15);
        params.methodAdjustments.dhuhr = 1;
        return params;
    },
    // Kuwait
    Kuwait() {
        return new CalculationParameters_js_1.default('Kuwait', 18, 17.5);
    },
    // Qatar
    Qatar() {
        return new CalculationParameters_js_1.default('Qatar', 18, 0, 90);
    },
    // Singapore
    Singapore() {
        const params = new CalculationParameters_js_1.default('Singapore', 20, 18);
        params.methodAdjustments.dhuhr = 1;
        params.rounding = Rounding_js_1.Rounding.Up;
        return params;
    },
    // Institute of Geophysics, University of Tehran
    Tehran() {
        const params = new CalculationParameters_js_1.default('Tehran', 17.7, 14, 0, 4.5);
        return params;
    },
    // Dianet
    Turkey() {
        const params = new CalculationParameters_js_1.default('Turkey', 18, 17);
        params.methodAdjustments = {
            ...params.methodAdjustments,
            sunrise: -7,
            dhuhr: 5,
            asr: 4,
            maghrib: 7,
        };
        return params;
    },
    // Other
    Other() {
        return new CalculationParameters_js_1.default('Other', 0, 0);
    },
};
exports.default = CalculationMethod;
