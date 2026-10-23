"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const Madhab_js_1 = require("./Madhab.js");
const HighLatitudeRule_js_1 = __importDefault(require("./HighLatitudeRule.js"));
const PolarCircleResolution_js_1 = require("./PolarCircleResolution.js");
const Rounding_js_1 = require("./Rounding.js");
const Shafaq_js_1 = require("./Shafaq.js");
class CalculationParameters {
    constructor(
    // Name of the method, can be used to apply special behavior in calculations.
    // This property should not be manually modified.
    method, 
    // Angle of the sun below the horizon used for calculating Fajr.
    fajrAngle = 0, 
    // Angle of the sun below the horizon used for calculating Isha.
    ishaAngle = 0, 
    // Minutes after Maghrib to determine time for Isha
    // if this value is greater than 0 then ishaAngle is not used.
    ishaInterval = 0, 
    // Angle of the sun below the horizon used for calculating Maghrib.
    // Only used by the Tehran method to account for lightness in the sky.
    maghribAngle = 0) {
        this.method = method;
        this.fajrAngle = fajrAngle;
        this.ishaAngle = ishaAngle;
        this.ishaInterval = ishaInterval;
        this.maghribAngle = maghribAngle;
        // Madhab to determine how Asr is calculated.
        this.madhab = Madhab_js_1.Madhab.Shafi;
        // Rule to determine the earliest time for Fajr and latest time for Isha
        // needed for high latitude locations where Fajr and Isha may not truly exist
        // or may present a hardship unless bound to a reasonable time.
        this.highLatitudeRule = HighLatitudeRule_js_1.default.MiddleOfTheNight;
        // Manual adjustments (in minutes) to be added to each prayer time.
        this.adjustments = {
            fajr: 0,
            sunrise: 0,
            dhuhr: 0,
            asr: 0,
            maghrib: 0,
            isha: 0,
        };
        // Adjustments set by a calculation method. This value should not be manually modified.
        this.methodAdjustments = {
            fajr: 0,
            sunrise: 0,
            dhuhr: 0,
            asr: 0,
            maghrib: 0,
            isha: 0,
        };
        // Rule to determine how to resolve prayer times inside the Polar Circle
        // where daylight or night may persist for more than 24 hours depending
        // on the season
        this.polarCircleResolution = PolarCircleResolution_js_1.PolarCircleResolution.Unresolved;
        // How seconds are rounded when calculating prayer times
        this.rounding = Rounding_js_1.Rounding.Nearest;
        // Used by the MoonsightingCommittee method to determine how to calculate Isha
        this.shafaq = Shafaq_js_1.Shafaq.General;
        if (this.method === null) {
            // we don't want a breaking change
            this.method = 'Other';
        }
    }
    nightPortions() {
        switch (this.highLatitudeRule) {
            case HighLatitudeRule_js_1.default.MiddleOfTheNight:
                return { fajr: 1 / 2, isha: 1 / 2 };
            case HighLatitudeRule_js_1.default.SeventhOfTheNight:
                return { fajr: 1 / 7, isha: 1 / 7 };
            case HighLatitudeRule_js_1.default.TwilightAngle:
                return { fajr: this.fajrAngle / 60, isha: this.ishaAngle / 60 };
            default:
                throw `Invalid high latitude rule found when attempting to compute night portions: ${this.highLatitudeRule}`;
        }
    }
}
exports.default = CalculationParameters;
