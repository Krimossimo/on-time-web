"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class TimeComponents {
    constructor(num) {
        this.hours = Math.floor(num);
        this.minutes = Math.floor((num - this.hours) * 60);
        this.seconds = Math.floor((num - (this.hours + this.minutes / 60)) * 60 * 60);
        return this;
    }
    utcDate(year, month, date) {
        return new Date(Date.UTC(year, month, date, this.hours, this.minutes, this.seconds));
    }
}
exports.default = TimeComponents;
