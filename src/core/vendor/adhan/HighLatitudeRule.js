"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const HighLatitudeRule = {
    MiddleOfTheNight: 'middleofthenight',
    SeventhOfTheNight: 'seventhofthenight',
    TwilightAngle: 'twilightangle',
    recommended(coordinates) {
        if (coordinates.latitude > 48) {
            return HighLatitudeRule.SeventhOfTheNight;
        }
        else {
            return HighLatitudeRule.MiddleOfTheNight;
        }
    },
};
exports.default = HighLatitudeRule;
