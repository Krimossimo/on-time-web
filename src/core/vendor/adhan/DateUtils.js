"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dateByAddingDays = dateByAddingDays;
exports.dateByAddingMinutes = dateByAddingMinutes;
exports.dateByAddingSeconds = dateByAddingSeconds;
exports.roundedMinute = roundedMinute;
exports.isLeapYear = isLeapYear;
exports.dayOfYear = dayOfYear;
exports.isValidDate = isValidDate;
const Rounding_js_1 = require("./Rounding.js");
function dateByAddingDays(date, days) {
    const year = date.getFullYear();
    const month = date.getMonth();
    const day = date.getDate() + days;
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const seconds = date.getSeconds();
    return new Date(year, month, day, hours, minutes, seconds);
}
function dateByAddingMinutes(date, minutes) {
    return dateByAddingSeconds(date, minutes * 60);
}
function dateByAddingSeconds(date, seconds) {
    return new Date(date.getTime() + seconds * 1000);
}
function roundedMinute(date, rounding = Rounding_js_1.Rounding.Nearest) {
    const seconds = date.getUTCSeconds();
    let offset = seconds >= 30 ? 60 - seconds : -1 * seconds;
    if (rounding === Rounding_js_1.Rounding.Up) {
        offset = 60 - seconds;
    }
    else if (rounding === Rounding_js_1.Rounding.None) {
        offset = 0;
    }
    return dateByAddingSeconds(date, offset);
}
/* Whether or not a year is a leap year (has 366 days). */
function isLeapYear(year) {
    if (year % 4 !== 0) {
        return false;
    }
    if (year % 100 === 0 && year % 400 !== 0) {
        return false;
    }
    return true;
}
function dayOfYear(date) {
    let returnedDayOfYear = 0;
    const feb = isLeapYear(date.getFullYear()) ? 29 : 28;
    const months = [31, feb, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    for (let i = 0; i < date.getMonth(); i++) {
        returnedDayOfYear += months[i];
    }
    returnedDayOfYear += date.getDate();
    return returnedDayOfYear;
}
function isValidDate(date) {
    return date instanceof Date && !isNaN(date.valueOf());
}
