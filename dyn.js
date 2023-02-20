#!/usr/bin/env node
// profiling with option --prof or for memory use --inspect / --inspect-brk
// run afterwards the log through node again

"use strict";

const fs = require("fs-extra");
var intersect = require('path-intersection');


let circle_center = [512, 512];
let circle_radius = 512;
/* let box_path = "M " + circle_center[0] + " " + circle_center[1] + " " +
    "m -" + circle_radius + ", 0" +
    " a " + circle_radius + "," + circle_radius + " 0 1,0 " + (circle_radius * 2) + ",0" +
    " a " + circle_radius + "," + circle_radius + " 0 1,0 -" + (circle_radius * 2) + ",0"; */

let box_path = "M 0 0 L 1024 0 L 1024 1024 L 0 1024 L 0 0"; // should be square box as big as our drawing area (0..1024, 0..1024)


function getStartPosition(path) {
    if (typeof path == 'undefined')
        return [0, 0];
    var re_start_coords = /M ([+\-0-9]*) ([+\-0-9]*)/;
    var matches = path.match(re_start_coords);
    if (matches == null) {
        console.log("What is happening? should be an M but is:  \"" + path + "\". Skip");
        return [0, 0];
    }
    var xcoord = parseInt(matches[1]);
    var ycoord = parseInt(matches[2]);
    return [xcoord, ycoord];
}

// the start position is one (random) M value pair at the beginning
// we want to place the center of the object to newPos
function setStartPosition(path, newPos) { // newPos = [0,0]
    if (typeof path == 'undefined')
        return null;
    //var c = getStartPosition(path);
    var cs = ["M", "Q", "Z", "C", "L", "S", "V", "H", "A"];

    var stroke = path.split(" ");
    var center = [0, 0];
    var numCoords = 0;
    var x = 0;
    // find the center of mass of all coordinates (regardless of spline or position)
    for (var k = 0; k < stroke.length; k++) {
        if (cs.indexOf(stroke[k]) != -1) {
            x = 0;
        } else {
            var ii = parseInt(stroke[k]);
            if (((x + 1) % 2) == 0) {
                center[0] += ii;
            } else {
                // even
                center[1] += ii;
                numCoords++;
                //ii = ii - ycoord + newPos[1];
            }
        }
        x++;
    }
    center[0] /= numCoords;
    center[1] /= numCoords;
    center[0] = Math.floor(center[0]);
    center[1] = Math.floor(center[1]);

    var text = "";
    x = 0;
    var isM = false;
    for (var k = 0; k < stroke.length; k++) {
        if (cs.indexOf(stroke[k]) != -1) {
            text += " " + stroke[k];
            if (stroke[k] == "M")
                isM = true;
            else
                isM = false;
            x = 0;
        } else {
            var ii = parseInt(stroke[k]);
            if (((x + 1) % 2) == 0) {
                // even
                ii = ii - center[0] + newPos[0];
            } else {
                // odd
                ii = ii - center[1] + newPos[1];
            }
            text += " " + ii;
        }
        x++;
    }
    return text.trim();
}

// compute the probability of different path length to appear in a character
async function createDictionary(filePaths) {

    var out = fs.createWriteStream("dictionary.txt"); // each line is a path
    // our dictionary should have size/complexity sorted entries
    let sizeDistribution = {};
    for (var f = 0; f < filePaths.length; f++) {
        var filePath = filePaths[f];
        console.log("read: " + filePath);
        const contentRaw = await fs.readFile(filePath);
        var content = JSON.parse(contentRaw)
        var chars = Object.keys(content);
        for (var i = 0; i < chars.length; i++) {
            // compute size distribution
            var entry = content[chars[i]]["strokes"];
            for (var j = 0; j < entry.length; j++) {
                // one entry is one stroke
                // We can save that after we process some values for it. How about we look at its size or what other strokes it
                // appears together with? Get the size distribution for this character?

                // we should first put the path to a standard position 0,0 and save it afterwards
                // we want to be able to add arbitrary offsets later (no rotation or shift/shear)
                entry[j] = setStartPosition(entry[j], [0, 0]).trim();
                if (!(entry[j].length in sizeDistribution))
                    sizeDistribution[entry[j].length] = [];
                sizeDistribution[entry[j].length].push(entry[j]);
            }
        }
    }
    var keys = Object.keys(sizeDistribution);
    // find max key
    var sums = 0;
    var maxKey = keys.reduce(function (max, a, idx) {
        sums += sizeDistribution[a].length;
        if (parseInt(a) > max)
            return parseInt(a);
    });
    // now we know that we have length 0 to maxKeys
    let bins = 15;
    let distr_short = new Array(bins).fill(0);
    let distr = new Array(maxKey).fill(0);
    keys.map(function (a) {
        let idx = Math.floor(parseInt(a) / maxKey * (bins - 1));
        distr[parseInt(a)] = sizeDistribution[a].length / sums;
        distr_short[idx] += sizeDistribution[a].length;
    });
    for (var i = 0; i < distr_short.length; i++) {
        distr_short[i] /= sums;
    }
    // now save based on size in distr
    for (var i = 0; i < distr.length; i++) {
        if (distr[i] > 0) {
            // we should have some entries for this length
            for (var j = 0; j < sizeDistribution[i].length; j++) {
                out.write(sizeDistribution[i][j] + "\n");
            }
        }
    }
    out.close();


    // save the size distribution (how often a svg path with a given length appeared in the data)
    var out = fs.createWriteStream("sizeDistribution.json"); // each line is a path
    out.write(JSON.stringify({ "min": 0, "max": maxKey, "probs": distr_short }));
    out.close();

    //console.log(sizeDistribution);
    //console.log("max keys value is: " + maxKey);
    //console.log("distr : " + distr);
    return distr; // length probs distribution with sum == 1
}

const weighted_choice = function (table) {
    const choices = [], cumweights = [];
    let sum = 0;
    for (const k in table) {
        choices.push(k);
        // work with the cumulative sum of weights
        cumweights.push(sum += table[k]);
    }
    return function () {
        const val = Math.random() * sum;
        // a binary search would be better for "large" tables
        for (const i in cumweights) {
            if (val <= cumweights[i]) {
                return choices[i];
            }
        }
    };
};

// would be good to pick one based on the size distribution
function pickStroke(dict, sizeDistribution) {
    // pick a size bin
    const gen = weighted_choice(sizeDistribution.probs);
    var val = parseInt(gen());
    // now we have a range of entries from which to choose from
    var oneChunk = (sizeDistribution.max - sizeDistribution.min) / (sizeDistribution.probs.length - 1.0);
    var lowerLength = oneChunk * val;
    var upperLength = oneChunk * (val + 1);
    let sub = [];
    for (var i = 0; i < dict.length; i++) {
        if (dict[i].length >= lowerLength && dict[i].length <= upperLength)
            sub.push(dict[i]);
    }
    let idx = Math.floor(Math.random() * sub.length);
    return sub[idx];
}

function pickStrokeLarge(dict, proportion) { // how large should the first character be
    var l = dict.length * proportion;
    let idx = Math.floor(Math.random() * l);
    return dict[dict.length - idx - 2]; // in a split the last entry is empty
}

// Standard Normal variate using Box-Muller transform.
function gaussianRandom(mean = 0, stdev = 1) {
    let u = 1 - Math.random(); //Converting [0,1) to (0,1)
    let v = Math.random();
    let z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    // Transform to the desired mean and standard deviation:
    return z * stdev + mean;
}

function pickPosUniform(min, max) {
    // we should prefer center positions
    var min1 = 0;
    var min2 = 0;
    var max1 = 0;
    var max2 = 0;
    if (typeof min == 'object') { // or 'number'
        min1 = min[0];
        min2 = min[1];
    } else {
        min1 = min;
        min2 = min;
    }
    if (typeof max == 'object') {
        max1 = max[0];
        max2 = max[1];
    } else {
        max1 = max;
        max2 = max;
    }

    let r1 = (Math.random() * (max1 - min1)) - min1;
    r1 = (r1 < 0 ? 0 : r1);
    r1 = (r1 > max1 ? max1 : r1);
    let r2 = (Math.random() * (max2 - min2)) - min2;
    r1 = Math.round(r1);
    r2 = Math.round(r2);
    r2 = (r2 < 0 ? 0 : r2);
    r2 = (r2 > max2 ? max2 : r2);
    return [r1, r2];
}

function pickPos(min, max) {
    // we should prefer center positions
    var min1 = 0;
    var min2 = 0;
    var max1 = 0;
    var max2 = 0;
    if (typeof min == 'object') { // or 'number'
        min1 = min[0];
        min2 = min[1];
    } else {
        min1 = min;
        min2 = min;
    }
    if (typeof max == 'object') {
        max1 = max[0];
        max2 = max[1];
    } else {
        max1 = max;
        max2 = max;
    }

    var r1 = gaussianRandom((max1 - min1) / 2.0, (max1 - min1) / 6.0);
    r1 = (r1 < 0 ? 0 : r1);
    r1 = (r1 > max1 ? max1 : r1);
    var r2 = gaussianRandom((max2 - min2) / 2.0, (max2 - min2) / 6.0);
    r1 = Math.round(r1);
    r2 = Math.round(r2);
    r2 = (r2 < 0 ? 0 : r2);
    r2 = (r2 > max2 ? max2 : r2);
    return [r1, r2];
}

function checkIntersection(paths, path1, allowSmallIntersections) {
    if (typeof allowSmallIntersections == 'undefined')
        allowSmallIntersections = true;
    for (var i in paths) {
        var path0 = paths[i];
        var intersection = intersect(path0, path1);
        // Some intersections  might  be ok,  for example of the two strokes are long
        // We would really like to test  here for the angle of intersection but for now
        // we can simply use the number of intersecting points.
        if (allowSmallIntersections && intersection.length == 4 && path0.length > 300 && path1.length > 300) {
            // maybe check if the 4 points are close enough together?
            var cc = [[intersection[0].x, intersection[1].x, intersection[2].x, intersection[3].x], [intersection[0].y, intersection[1].y, intersection[2].y, intersection[3].y]];
            var size = [Math.max(...cc[0]) - Math.min(...cc[0]), Math.max(...cc[1]) - Math.min(...cc[1])];
            if (size[0] + size[1] < 90)
                return false;
            return true;
        }
        if (intersection.length > 0) {
            return true;
        }
    }
    return false; // no intersection
}

// if we predict a large character first and fill in the rest?

function vary(parent, dictionaryPaths) {
    // get the size distribution from sizeDistribution.json
    var sizeDistribution = null;
    if (sizeDistributionCache == null) {
        const contentRaw = fs.readFileSync("sizeDistribution.json");
        sizeDistribution = JSON.parse(contentRaw);
        sizeDistributionCache = sizeDistribution;
    } else {
        sizeDistribution = sizeDistributionCache;
    }
    var dict = null;
    if (dictCache == null) {
        var dict = [];
        for (var f = 0; f < dictionaryPaths.length; f++) {
            var filePath = dictionaryPaths[f];
            console.log("read: " + filePath);
            const contentRaw = fs.readFileSync(filePath);
            var content = contentRaw.toString('utf8').split("\n");
            for (c in content)
                dict.push(content[c]);
        }
        dictCache = dict;
    } else {
        dict = dictCache;
    }

    // we should only remove the smallest instead of all at the end
    let character = parent;
    character.sort(function (a, b) { return b.length - a.length; });

    // remove some at the end
    character = character.slice(0, Math.floor(parent.length / 2));
    character.unshift(box_path);

    let attempt = 0;
    // how many characters for this?
    var numStrokes = parent.length - 1;
    while (attempt < 2000) {
        if (character.length > numStrokes)
            break;
        var randomStroke = null;
        /*if (character.length < 3 && attempt < 200) {
            randomStroke = pickStrokeLarge(dict, 0.001);
        } else { */
        randomStroke = pickStroke(dict, sizeDistribution);
        //}
        for (var i = 0; i < 1000; i++) {
            // the strokes first position is not the center
            var path = setStartPosition(randomStroke, pickPos(0, 1024));
            if (!checkIntersection(character, path)) {
                character.push(path);
                break; // try with the next random stroke
            }
            attempt++;
        }
    }
    character.shift();  // remove the box again
    //console.log(character);
    //console.log("strokes: " + character.length);
    return character;
}

var dictCache = null;
var sizeDistributionCache = null;
function predict(dictionaryPaths) {

    // get the size distribution from sizeDistribution.json
    var sizeDistribution = null;
    if (sizeDistributionCache == null) {
        const contentRaw = fs.readFileSync("sizeDistribution.json");
        sizeDistribution = JSON.parse(contentRaw);
        sizeDistributionCache = sizeDistribution;
    } else {
        sizeDistribution = sizeDistributionCache;
    }
    var dict = null;
    if (dictCache == null) {
        var dict = [];
        for (var f = 0; f < dictionaryPaths.length; f++) {
            var filePath = dictionaryPaths[f];
            console.log("read: " + filePath);
            const contentRaw = fs.readFileSync(filePath);
            var content = contentRaw.toString('utf8').split("\n");
            for (c in content)
                dict.push(content[c]);
        }
        dictCache = dict;
    } else {
        dict = dictCache;
    }
    //console.log("got " + dict.length + " entries in dictionary.");
    // so we can draw now some number of characters and place them inside a box
    let character = [box_path]; // every character is a list of drawing commands (existing dictionary entries placed inside the box)

    let attempt = 0;
    // how many characters for this?
    var numStrokes = 2 + Math.max(1, Math.floor(gaussianRandom(7, 2)));

    while (attempt < 2000) {
        if (character.length > numStrokes)
            break;
        var randomStroke = null;
        /*if (character.length < 3 && attempt < 200) {
            randomStroke = pickStrokeLarge(dict, 0.001);
        } else { */
        randomStroke = pickStroke(dict, sizeDistribution);
        //}
        for (var i = 0; i < 1000; i++) {
            // the strokes first position is not the center
            var path = setStartPosition(randomStroke, pickPos(0, 1024));
            if (!checkIntersection(character, path)) {
                character.push(path);
                break; // try with the next random stroke
            }
            attempt++;
        }
    }
    character.shift();  // remove the box again
    //console.log(character);
    //console.log("strokes: " + character.length);
    return character;
}


// show all entries of the data dictionary on one page
function predictAll(dictionaryPaths, options) {
    options = options || {
        portion: [0.9, 1.0],
        maxNumChars: -1,
        maxAttempts: 400
    }
    if (typeof options.portion == 'undefined') {
        options.portion = [0.9, 1];
    }
    if (options.portion[0] > options.portion[1]) {
        var tmp = options.portion[0];
        options.portion[0] = options.portion[1];
        options.portion[1] = tmp;
    }
    // clamp the portion
    options.portion[0] = Math.min(Math.max(options.portion[0], 0), 1);
    options.portion[1] = Math.min(Math.max(options.portion[1], 0), 1);

    if (typeof options.maxNumChars == 'undefined') {
        options.maxNumChars = -1; // no limit
    }
    if (typeof options.maxAttempts == 'undefined') {
        options.maxAttempts = 400;
    }

    var dict = null;
    if (dictCache == null) {
        var dict = [];
        for (var f = 0; f < dictionaryPaths.length; f++) {
            var filePath = dictionaryPaths[f];
            console.log("read: " + filePath);
            const contentRaw = fs.readFileSync(filePath);
            var content = contentRaw.toString('utf8').split("\n");
            for (c in content)
                dict.push(content[c]);
        }
        dictCache = dict;
    } else {
        dict = dictCache;
    }
    //console.log("got " + dict.length + " entries in dictionary.");
    // so we can draw now some number of characters and place them inside a box
    var chars = [];  // return more than one character
    var really_large_box = "M 0 0 L 1024 0 L 1024 1024 L 0 1024 L 0 0";
    var character = [really_large_box];
    var attempt = 0;

    var start = process.hrtime();

    var elapsed_time = function (note) {
        // var precision = 3; // 3 decimal places
        var elapsed = process.hrtime(start)[1] / 1000000; // divide by a million to get nano to milli
        console.log(process.hrtime(start)[0] + " s, " + Math.floor(elapsed) + " ms - " + note); // print message + time
        start = process.hrtime(); // reset the timer
    }

    // how many characters for this?
    var numChars = options.maxNumChars;
    var numAttempts = options.maxAttempts;
    for (var c = Math.floor(dict.length * options.portion[0]); c < Math.floor(dict.length * options.portion[1]); c++) { // place 10 characters on one sheet
        //if (c < dict.length * portion[0] || c > dict.length * portion[1])
        //    continue;
        if (attempt >= numAttempts) {
            if (character.length > 0) {
                character.shift();  // remove the box again
                chars.push(character);
                //console.log("got " + character.length + " characters. Now have " + chars.length);
                elapsed_time("got " + character.length + " strokes, " + chars.length + (numChars > 0 ? "/" + numChars : "")
                    + "character, c(%)=" + ((c - (Math.floor(dict.length * options.portion[0]))) / (Math.floor(dict.length * options.portion[1]) - Math.floor(dict.length * options.portion[0]))).toFixed(2));
                if (numChars > 0 && chars.length > numChars) // early stopping
                    return chars;
            }
            character = [really_large_box]; // every character is a list of drawing commands (existing dictionary entries placed inside the box)
            attempt = 0;
        }
        var p = dict[c];
        while (attempt < numAttempts) {
            // the strokes first position is not the center
            var path = setStartPosition(p, pickPos(0, 1024));
            if (!checkIntersection(character, path, false)) {
                //console.log(c + "/" + dict.length + " x:" + x + " y:" + y);
                character.push(path);
                break; // the while
            }
            attempt++;
        }
    }
    // ignore any leftover characters
    /*if (character.length > 1) {
        character.shift();
        chars.push(character);
    }*/
    //console.log(character);
    //console.log("strokes: " + character.length);
    return chars;
}

// fill can be either false or "green"
function pageForCharacter(characters, theme) {
    var theme = theme || { "glow": true, 'black-on-white': false, 'fill': false };
    if (typeof theme.glow == 'undefined')
        theme.glow = true;
    if (typeof theme["black-on-white"] == 'undefined')
        theme['black-on-white'] = false;
    if (typeof theme["fill"] == 'undefined')
        theme['fill'] = false;

    var out = fs.createWriteStream("page.html"); // each line is a path

    var filter = "<defs>" +
        "<filter id=\"red-glow\" filterUnits=\"userSpaceOnUse\"" +
        "   x =\"-50%\" y=\"-50%\" width=\"200%\" height=\"200%\">" +
        "<feGaussianBlur in=\"SourceGraphic\" stdDeviation=\"5\" result=\"blur5\"/>" +
        "<feGaussianBlur in=\"SourceGraphic\" stdDeviation=\"10\" result=\"blur10\"/>" +
        "<feGaussianBlur in=\"SourceGraphic\" stdDeviation=\"20\" result=\"blur20\"/>" +
        "<feGaussianBlur in=\"SourceGraphic\" stdDeviation=\"30\" result=\"blur30\"/>" +
        "<feGaussianBlur in=\"SourceGraphic\" stdDeviation=\"50\" result=\"blur50\"/>" +
        "<feMerge result=\"blur-merged\">" +
        "  <feMergeNode in=\"blur10\"/>" +
        "  <feMergeNode in=\"blur20\"/>" +
        "  <feMergeNode in=\"blur30\"/>" +
        "  <feMergeNode in=\"blur50\"/>" +
        "</feMerge>" +
        "<feColorMatrix result=\"red-blur\" in=\"blur-merged\" type=\"matrix\"" +
        "               values=\"1 0 0 0 0" +
        "                       0 0.06 0 0 0" +
        "                       0 0 0.44 0 0" +
        "                       0 0 0 1 0\" />" +
        "<feMerge>" +
        "  <feMergeNode in=\"red-blur\"/>" +
        "  <feMergeNode in=\"blur5\"/>" +
        "  <feMergeNode in=\"SourceGraphic\"/>" +
        "</feMerge>" +
        "</filter>\n" +
        "</defs>\n";

    var filter_green = "<defs>" +
        "<pattern id=\"img1\" patternUnits=\"userSpaceOnUse\" width=\"2070\" height=\"1380\">\n" +
        "  <image href=\"images/green.jpg\" x=\"0\" y=\"0\" width=\"2070\" height=\"1380\" />\n" +
        "</pattern>\n" +
        "</defs>\n";

    if (!theme.glow) {
        filter = "";
    }
    var fg = "white";
    var bg = "black";
    if (theme["black-on-white"]) {
        bg = "white";
        fg = "black";
    }
    if (theme["fill"] == "green") {
        filter += filter_green;
        fg = "url(#img1)";
    }

    let page = "<!DOCTYPE html>\n" +
        "<html lang=\"en\">\n" +
        "<head>\n" +
        "  <meta charset=\"UTF-8\" />\n" +
        "  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\" />\n" +
        "  <meta http-equiv=\"X-UA-Compatible\" content=\"ie=edge\" />\n" +
        "  <title>Random piles of bones</title>\n" +
        "</head>\n" +
        "<body style=\"background: " + bg + ";\">\n" +
        "<svg viewBox=\"0 0 1024 1024\" height=\"100\" width=\"100\">" + filter + "</svg>\n" +
        "<div>\n<div style=\"width: 100%; height: 100%; display: inline-table; margin: 60px; fill: " + fg + ";\">\n";
    for (var c = 0; c < characters.length; c++) {
        var char = characters[c];
        page += "  <svg viewBox=\"0 0 1024 1024\" height=\"100\" width=\"100\" style=\"margin-left: 100px; margin-top: 20px; " + (theme.glow ? "filter: url(#red-glow);" : "") + " transform: scale(-1,-1);\">\n";
        page += "    <path class=\"svg1\" style=\"stroke-width: 0; stroke-linecap: round; stroke-linejoin: miter; stroke-miterlimit: 4;\" d=\"";
        for (var i = 0; i < char.length; i++) {
            page += char[i] + " ";
        }
        page += "\"/>\n  </svg>\n";
    }
    page += "</div></div></body>\n</html>\n";
    out.write(page);
    out.close();
}

const yargs = require('yargs/yargs')
const { hideBin } = require('yargs/helpers')

yargs(hideBin(process.argv))
    .command('database [filename..]', 'convert a json database from dd to a cleared text file (output: cleared_database.json)', (yargs) => {
        return yargs
            .positional('filename', {
                describe: 'json with array of dictionaries',
                default: 'database.json'
            })
    }, (argv) => {
        if (argv.verbose)
            console.info(`process: ${argv.filename} to get a cleared text file`)

        createDictionary(argv.filename);  // that is now an array
    })
    .command('predict [filename..]', 'create a character based on the dictionary.txt', (yargs) => {
        return yargs
            .positional('filename', {
                describe: 'json with array of dictionaries',
                default: 'dictionary.txt'
            })
    }, (argv) => {
        if (argv.verbose)
            console.info(`process: ${argv.filename} to get a cleared text file`)

        var chars = [];
        for (var i = 0; i < 16 * 16; i++)
            chars.push(predict(argv.filename));  // that is now an array
        pageForCharacter(chars);
    })
    .command('variation [filename..]', 'create a character based on the dictionary.txt and vary it on the page', (yargs) => {
        return yargs
            .positional('filename', {
                describe: 'json with array of dictionaries',
                default: 'dictionary.txt'
            })
    }, (argv) => {
        if (argv.verbose)
            console.info(`process: ${argv.filename} to get a cleared text file`)

        var chars = [predict(argv.filename)];
        for (var i = 0; i < (16 * 16) - 1; i++)
            chars.push(vary(chars[0], argv.filename));  // that is now an array
        pageForCharacter(chars);
    })
    .command('language [filename..]', 'create a character set based on the dictionary.txt and vary it on the page', (yargs) => {
        return yargs
            .positional('filename', {
                describe: 'json with array of dictionaries',
                default: 'dictionary.txt'
            })
    }, (argv) => {
        if (argv.verbose)
            console.info(`process: ${argv.filename} to get a cleared text file`)

        // a circular design with a parent character in the center
        // at each section of the circle some variation of the character is continued
        // we should have a fixed number of characters for each parent
        var chars = new Array(14 * 14).fill(null);
        for (var j = 0; j < 14; j++) {
            var diag_idx = j * 14 + j;
            chars[diag_idx] = predict(argv.filename);
            for (var i = 1; i < 14 - j; i++) { // fill in the row
                chars[diag_idx + i] = vary(chars[diag_idx], argv.filename);  // that is now an array
            }
            for (var i = diag_idx + 14; i < 14 * 14; i += 14) {  // fill in the column
                chars[i] = vary(chars[diag_idx], argv.filename);
            }
        }
        pageForCharacter(chars, { glow: false, "black-on-white": true, "fill": null });
    })
    .command('dictionary [filename..]', 'display all characters on one page', (yargs) => {
        return yargs
            .positional('filename', {
                describe: 'json with array of dictionaries',
                default: 'dictionary.txt'
            })
    }, (argv) => {
        if (argv.verbose)
            console.info(`process: ${argv.filename} to get a page with all the entries in dictionary`)

        // we cannot display all the characters, select a portion of the data
        var chars = predictAll(argv.filename, {
            portion: [argv.dictmin, argv.dictmax],
            maxNumChars: -1,
            maxAttempts: 400
        });
        pageForCharacter(chars, { glow: false, "black-on-white": false, "fill": null });
    })
    .option('dictmin', {
        alias: 'i',
        type: 'float',
        default: 0.9,
        description: 'minimum value, only used for "dictionary" argument (0.9)'
    })
    .option('dictmax', {
        alias: 'a',
        type: 'float',
        default: 1.0,
        description: 'maximum value, only used for "dictionary" argument (1.0)'
    })
    .option('verbose', {
        alias: 'v',
        type: 'boolean',
        description: 'Run with verbose logging'
    }).command('$0', 'the default command', () => { }, (argv) => {
        console.log('Use --help to see option')
    })
    .parse()
