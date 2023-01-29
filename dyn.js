#!/usr/bin/env node
// profiling with option--prof
// run afterwards the log through node again

const fs = require("fs-extra");
var intersect = require('path-intersection');

function getStartPosition(path) {
    var re_start_coords = /M ([+\-0-9]*) ([+\-0-9]*)/;
    var matches = path.match(re_start_coords);
    if (matches == null) {
        console.log("What is happening? should be an M but is:  " + path);
    }
    var xcoord = parseInt(matches[1]);
    var ycoord = parseInt(matches[2]);
    return [xcoord, ycoord];
}

// the start position is one (random) M value pair at the beginning
// we want to place the center of the object to newPos
function setStartPosition(path, newPos) { // newPos = [0,0]
    var c = getStartPosition(path);
    let xcoord = c[0];
    let ycoord = c[1];
    var cs = ["M", "Q", "Z", "C", "L", "S", "V", "H", "A"];

    var stroke = path.split(" ");
    var center = [0, 0];
    var numCoords = 0;
    let x = 0;
    // find the center of mass of all coordinates (regardless of spline or position)
    for (var k = 0; k < stroke.length; k++) {
        if (cs.indexOf(stroke[k]) != -1) {
            x = 0;
        } else {
            var ii = parseInt(stroke[k]);
            if (((x + 1) % 2) == 0) {
                // odd (x because the is M or Q etc.)
                // ii = ii - xcoord + newPos[0];
                center[0] += ii;
            } else {
                // even
                center[1] += ii;
                numCoords++;
                //ii = ii - ycoord + newPos[1];
            }
        }
        x++
    }
    center[0] /= numCoords;
    center[1] /= numCoords;
    center[0] = Math.floor(center[0]);
    center[1] = Math.floor(center[1]);

    let text = "";
    x = 0;
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
            //if (!isM) { // relative to M only if its not M itself
            if (((x + 1) % 2) == 0) {
                // even
                ii = ii - center[0] + newPos[0];
            } else {
                // odd
                ii = ii - center[1] + newPos[1];
            }
            //}
            //console.log("number: " + ii + " for: " + stroke[k]);
            text += " " + ii;
        }
        x++
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

function pickPos(min, max) {
    // we should prefer center positions
    let r1 = gaussianRandom((max - min) / 2.0, (max - min) / 6.0);
    r1 = (r1 < 0 ? 0 : r1);
    r1 = (r1 > max ? max : r1);
    let r2 = gaussianRandom((max - min) / 2.0, (max - min) / 6.0);
    r1 = Math.round(r1);
    r2 = Math.round(r2);
    r2 = (r2 < 0 ? 0 : r2);
    r2 = (r2 > max ? max : r2);
    return [r1, r2];
}

function checkIntersection(paths, path1) {
    for (i in paths) {
        var path0 = paths[i];
        var intersection = intersect(path0, path1);
        // Some intersections  might  be ok,  for example of the two strokes are long
        // We would really like to test  here for the angle of intersection but for now
        // we can simply use the number of intersecting points.
        if (intersection.length == 4 && path0.length > 300 && path1.length > 300) {
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
    let box_path = "M 0 0 L 1024 0 L 1024 1024 L 0 1024 L 0 0"; // should be square box as big as our drawing area (0..1024, 0..1024)
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
    let box_path = "M 0 0 L 1024 0 L 1024 1024 L 0 1024 L 0 0"; // should be square box as big as our drawing area (0..1024, 0..1024)
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

function pageForCharacter(characters) {
    var out = fs.createWriteStream("page.html"); // each line is a path

    let page = "<!DOCTYPE html>\n" +
        "<html lang=\"en\">\n" +
        "<head>\n" +
        "  <meta charset=\"UTF-8\" />\n" +
        "  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\" />\n" +
        "  <meta http-equiv=\"X-UA-Compatible\" content=\"ie=edge\" />\n" +
        "  <title>Random strokes</title>\n" +
        "  <link href=\"index.css\" rel=\"stylesheet\" />\n" +
        "</head>\n" +
        "<body>\n" +
        "<div><div style=\"width: 100%; height: 100%; display: inline-table; margin: 60px;\">";
    for (var c = 0; c < characters.length; c++) {
        var char = characters[c];
        page += "<svg viewBox=\"0 0 1024 1024\" height=\"100\" width=\"100\" style=\"margin-right: 100px; margin-bottom: 20px;\"><path class=\"svg1\" style = \"fill: black; stroke: width; stroke-width: 2; stroke-linecap: round; stroke-linejoin:  miter; stroke-miterlimit: 4;\"  d = \"";
        for (var i = 0; i < char.length; i++) {
            page += char[i] + " ";
        }
        page += "\"/></svg>\n";
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
        for (var i = 0; i < 7 * 7; i++)
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
        for (var i = 0; i < (7 * 7) - 1; i++)
            chars.push(vary(chars[0], argv.filename));  // that is now an array
        pageForCharacter(chars);
    })
    .option('verbose', {
        alias: 'v',
        type: 'boolean',
        description: 'Run with verbose logging'
    }).command('$0', 'the default command', () => { }, (argv) => {
        console.log('Use --help to see option')
    })
    .parse()

