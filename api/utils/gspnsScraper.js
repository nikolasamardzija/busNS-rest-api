/**
 * Created by Aleksandar Babic on 19.11.17..
 * Take a look at my portfolio at https://aleksandar.alfa-ing.com
 */
const osmosis = require('osmosis');
const cheerio = require('cheerio');
const request = require('request');
const buildUrl = require('build-url');
const utilsBuildUrl = require('./gspnsBuildUrl');
const Bus = require('../model/bus');
const BusTwoWay = require('../model/busTwoWay');

/**
 * Will take day as parameter ('R','S','N' ), it will fallback to 'R' if no parameter is passed
 * Will get all bus lines for city buses on given day
 * @param day
 * @returns {Promise}
 */
module.exports.scrapeLaneCity = function (day) {
    return new Promise(async (resolve, reject) => {
        let queryData;
        day = day ? day.toUpperCase() : false;
        try {
            queryData = await utilsBuildUrl.getUrlBaseValues();
        } catch (e) {
            return reject(({'message': `Error while getting base url values. ERROR: ${e}`}));
        }
        const baseUrl = 'http://www.gspns.co.rs/red-voznje/lista-linija';
        const URL = buildUrl(baseUrl, {
            queryParams: {
                rv: 'rvg',
                vaziod: queryData.vaziod[queryData.vaziod.length - 1],
                dan: queryData.dan.includes(day) ? day : 'R'
            }
        });
        //TODO Implement caching for city lanes
        osmosis.get(URL)
            .find('#linija')
            .set({'linije': ['option@value']})
            .set({'linijeTekst': ['option']})
            .data(async data => {
                "use strict";
                const mappedArray = await data.linije.map((curr, index) => {
                    const newCurr = {};
                    newCurr[curr] = data.linijeTekst[index];
                    return newCurr;
                });
                if (mappedArray.length == 0)
                    return reject(({'message': 'Error while getting lanes, got no results'}));
                resolve(mappedArray);
            });
    });
};

/**
 *  Will take day as parameter ('R','S','N' ), it will fallback to 'R' if no parameter is passed
 *  Will get all bus lines for non city buses on given day
 * @param day
 * @returns {Promise}
 */
module.exports.scrapeLaneNonCity = function (day) {
    return new Promise(async (resolve, reject) => {
        let queryData;
        day = day ? day.toUpperCase() : false;
        try {
            queryData = await utilsBuildUrl.getUrlBaseValues();
        } catch (e) {
            return reject(({'message': `Error while getting base url values. ERROR: ${e}`}));
        }
        const baseUrl = 'http://www.gspns.co.rs/red-voznje/lista-linija';
        const URL = buildUrl(baseUrl, {
            queryParams: {
                rv: 'rvp',
                vaziod: queryData.vaziod[queryData.vaziod.length - 1],
                dan: queryData.dan.includes(day) ? day : 'R'
            }
        });
        //TODO Implement caching for non city lanes
        osmosis.get(URL)
            .find('#linija')
            .set({'linije': ['option@value']})
            .set({'linijeTekst': ['option']})
            .data(async data => {
                "use strict";
                const mappedArray = await data.linije.map((curr, index) => {
                    const newCurr = {};
                    newCurr[curr] = data.linijeTekst[index];
                    return newCurr;
                });
                if (mappedArray.length == 0)
                    return reject(({'message': 'Error while getting lanes, got no results'}));
                resolve(mappedArray);
            });
    });
};

/**
 * Will return Promise that resolves to Bus object with all data
 * @param busId
 * @param day
 * @param rv
 * @returns {Promise} Bus
 */
module.exports.scrapeBus = function (busId, day, rv) {
    return new Promise(async (resolve, reject) => {
        "use strict";
        let queryData;
        day = day ? day.toUpperCase() : 'R';
        rv = rv ? rv.toLowerCase() : undefined;
        busId = busId ? busId.toUpperCase() : undefined;
        try {
            queryData = await utilsBuildUrl.getUrlBaseValues();
            if (!queryData.dan.includes(day) || !queryData.rv.includes(rv))
                return reject(({'message': 'Values dan or rv are invalid.'}));
            const baseUrl = 'http://www.gspns.co.rs/red-voznje/ispis-polazaka';
            const URL = buildUrl(baseUrl, {
                queryParams: {
                    'rv': rv,
                    'vaziod': queryData.vaziod[queryData.vaziod.length - 1],
                    'dan': queryData.dan.includes(day) ? day : 'R',
                    'linija%5B%5D': busId
                }
            });
            //TODO Implement caching for buses
            //Make request to get schedule HTML
            request(URL, (err, resp, html) => {
                if (err) return reject(err);
                const $ = cheerio.load(html);

                if ($('td > b').length == 0) {
                    return reject(({'message': `Error while getting bus schedule, double check bus lane number.`}));
                }


                if ($('tbody > tr > th').length == 2) {
                    const bus = new BusTwoWay();
                    bus.id = busId.toUpperCase();
                    bus.dan = day.toUpperCase();
                    bus.linijaA = $('tbody > tr > th').slice(0, 1).text().trim();
                    bus.linijaB = $('tbody > tr > th').slice(1, 2).text().trim();
                    //Iterate through both lane ways
                    $('tbody > tr > td').each(function (laneIndex) {
                        if (laneIndex == 2) return;
                        //Iterate through each hour
                        $(this).find('b').each(function (index) {
                            let hour = $(this).text().trim();
                            const validateRegxp = /^[0-9]*$/;
                            if (!hour.toString().match(validateRegxp) || hour === '') return;
                            if (laneIndex == 0) {
                                bus.rasporedA[hour] = [];
                            } else {
                                bus.rasporedB[hour] = [];
                            }
                            let next = $(this).next();
                            //While next DOM element is minute
                            while (next.is('sup')) {
                                if (laneIndex == 0) {
                                    bus.rasporedA[hour].push(next.text());
                                } else {
                                    bus.rasporedB[hour].push(next.text());
                                }
                                next = next.next();
                            }
                            //If reached end of hours array, resolve with data
                            if (bus.rasporedA.length == bus.rasporedB.length && laneIndex == 1) {
                                resolve(bus);
                            }
                        });
                    });
                    //Requested bus is one way only
                } else {
                    const bus = new Bus();
                    bus.id = busId.toUpperCase();
                    bus.dan = day.toUpperCase();
                    bus.linija = $('tbody > tr > th').text().trim();
                    //Iterate through each hour
                    $('td > b').each(function (index) {
                        let hour = $(this).text();
                        bus.raspored[hour] = [];
                        let next = $(this).next();
                        //While next DOM element is minute
                        while (next.is('sup')) {
                            bus.raspored[hour].push(next.text());
                            next = next.next();
                        }
                        //If reached end of hours array, resolve with data
                        if (index == $('td > b').length - 1) {
                            resolve(bus);
                        }
                    });
                }
            });
        } catch (e) {
            return reject(({'message': `Error while getting base url values. ERROR: ${e}`}));
        }
    });
};