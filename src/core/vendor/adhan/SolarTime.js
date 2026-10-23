"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const Astronomical_js_1 = __importDefault(require("./Astronomical.js"));
const MathUtils_js_1 = require("./MathUtils.js");
const SolarCoordinates_js_1 = __importDefault(require("./SolarCoordinates.js"));
class SolarTime {
    constructor(date, coordinates) {
        const julianDay = Astronomical_js_1.default.julianDay(date.getFullYear(), date.getMonth() + 1, date.getDate(), 0);
        this.observer = coordinates;
        this.solar = new SolarCoordinates_js_1.default(julianDay);
        this.prevSolar = new SolarCoordinates_js_1.default(julianDay - 1);
        this.nextSolar = new SolarCoordinates_js_1.default(julianDay + 1);
        const m0 = Astronomical_js_1.default.approximateTransit(coordinates.longitude, this.solar.apparentSiderealTime, this.solar.rightAscension);
        const solarAltitude = -50.0 / 60.0;
        this.approxTransit = m0;
        this.transit = Astronomical_js_1.default.correctedTransit(m0, coordinates.longitude, this.solar.apparentSiderealTime, this.solar.rightAscension, this.prevSolar.rightAscension, this.nextSolar.rightAscension);
        this.sunrise = Astronomical_js_1.default.correctedHourAngle(m0, solarAltitude, coordinates, false, this.solar.apparentSiderealTime, this.solar.rightAscension, this.prevSolar.rightAscension, this.nextSolar.rightAscension, this.solar.declination, this.prevSolar.declination, this.nextSolar.declination);
        this.sunset = Astronomical_js_1.default.correctedHourAngle(m0, solarAltitude, coordinates, true, this.solar.apparentSiderealTime, this.solar.rightAscension, this.prevSolar.rightAscension, this.nextSolar.rightAscension, this.solar.declination, this.prevSolar.declination, this.nextSolar.declination);
    }
    hourAngle(angle, afterTransit) {
        return Astronomical_js_1.default.correctedHourAngle(this.approxTransit, angle, this.observer, afterTransit, this.solar.apparentSiderealTime, this.solar.rightAscension, this.prevSolar.rightAscension, this.nextSolar.rightAscension, this.solar.declination, this.prevSolar.declination, this.nextSolar.declination);
    }
    afternoon(shadowLength) {
        // TODO source shadow angle calculation
        const tangent = Math.abs(this.observer.latitude - this.solar.declination);
        const inverse = shadowLength + Math.tan((0, MathUtils_js_1.degreesToRadians)(tangent));
        const angle = (0, MathUtils_js_1.radiansToDegrees)(Math.atan(1.0 / inverse));
        return this.hourAngle(angle, true);
    }
}
exports.default = SolarTime;
