"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.polarCircleResolvedValues = exports.PolarCircleResolution = void 0;
const Coordinates_js_1 = __importDefault(require("./Coordinates.js"));
const SolarTime_js_1 = __importDefault(require("./SolarTime.js"));
const DateUtils_js_1 = require("./DateUtils.js");
exports.PolarCircleResolution = {
    AqrabBalad: 'AqrabBalad',
    AqrabYaum: 'AqrabYaum',
    Unresolved: 'Unresolved',
};
const LATITUDE_VARIATION_STEP = 0.5; // Degrees to add/remove at each resolution step
const UNSAFE_LATITUDE = 65; // Based on https://en.wikipedia.org/wiki/Midnight_sun
const isValidSolarTime = (solarTime) => !isNaN(solarTime.sunrise) && !isNaN(solarTime.sunset);
const aqrabYaumResolver = (coordinates, date, daysAdded = 1, direction = 1) => {
    if (daysAdded > Math.ceil(365 / 2)) {
        return null;
    }
    const testDate = new Date(date.getTime());
    testDate.setDate(testDate.getDate() + direction * daysAdded);
    const tomorrow = (0, DateUtils_js_1.dateByAddingDays)(testDate, 1);
    const solarTime = new SolarTime_js_1.default(testDate, coordinates);
    const tomorrowSolarTime = new SolarTime_js_1.default(tomorrow, coordinates);
    if (!isValidSolarTime(solarTime) || !isValidSolarTime(tomorrowSolarTime)) {
        return aqrabYaumResolver(coordinates, date, daysAdded + (direction > 0 ? 0 : 1), -direction);
    }
    return {
        date,
        tomorrow,
        coordinates,
        solarTime,
        tomorrowSolarTime,
    };
};
const aqrabBaladResolver = (coordinates, date, latitude) => {
    const solarTime = new SolarTime_js_1.default(date, { ...coordinates, latitude });
    const tomorrow = (0, DateUtils_js_1.dateByAddingDays)(date, 1);
    const tomorrowSolarTime = new SolarTime_js_1.default(tomorrow, {
        ...coordinates,
        latitude,
    });
    if (!isValidSolarTime(solarTime) || !isValidSolarTime(tomorrowSolarTime)) {
        return Math.abs(latitude) >= UNSAFE_LATITUDE
            ? aqrabBaladResolver(coordinates, date, latitude - Math.sign(latitude) * LATITUDE_VARIATION_STEP)
            : null;
    }
    return {
        date,
        tomorrow,
        coordinates: new Coordinates_js_1.default(latitude, coordinates.longitude),
        solarTime,
        tomorrowSolarTime,
    };
};
const polarCircleResolvedValues = (resolver, date, coordinates) => {
    const defaultReturn = {
        date,
        tomorrow: (0, DateUtils_js_1.dateByAddingDays)(date, 1),
        coordinates,
        solarTime: new SolarTime_js_1.default(date, coordinates),
        tomorrowSolarTime: new SolarTime_js_1.default((0, DateUtils_js_1.dateByAddingDays)(date, 1), coordinates),
    };
    switch (resolver) {
        case exports.PolarCircleResolution.AqrabYaum: {
            return aqrabYaumResolver(coordinates, date) || defaultReturn;
        }
        case exports.PolarCircleResolution.AqrabBalad: {
            const { latitude } = coordinates;
            return (aqrabBaladResolver(coordinates, date, latitude - Math.sign(latitude) * LATITUDE_VARIATION_STEP) || defaultReturn);
        }
        default: {
            return defaultReturn;
        }
    }
};
exports.polarCircleResolvedValues = polarCircleResolvedValues;
